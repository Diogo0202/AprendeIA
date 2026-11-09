"""RF22: transporte, fencing e SQL real em PostgreSQL WASM local."""
import os
from pathlib import Path
import shutil
import smtplib
import subprocess
from datetime import datetime, timezone
from types import SimpleNamespace
import unittest
from unittest.mock import MagicMock, Mock, patch

from backend import email_delivery as delivery

CONFIG = delivery.SMTPConfig('smtp.example.test', 465, 'user', 'secret', 'sender@example.test')
PANEL = 'https://aprendeia.example/'
NOW = datetime(2026, 11, 9, 11, tzinfo=timezone.utc)


class SMTPTests(unittest.TestCase):
    def send(self, *, error=None, login_error=None, quit_error=None, refused=None, config=CONFIG):
        server = Mock()
        server.send_message.side_effect = error
        server.send_message.return_value = refused or {}
        server.login.side_effect = login_error
        server.quit.side_effect = quit_error
        with patch.object(delivery.smtplib, 'SMTP_SSL', return_value=server), patch.object(delivery.smtplib, 'SMTP', return_value=server):
            result = delivery.send_smtp(config, 'teacher@example.test', 'Aviso', 'Abra o painel', 'delivery-id')
        return result, server

    def test_acceptance_is_not_receipt_and_quit_failure_cannot_undo_it(self):
        result, server = self.send(quit_error=smtplib.SMTPServerDisconnected('secret'))
        self.assertEqual(result.status, 'smtp_accepted')
        message = server.send_message.call_args.args[0]
        self.assertEqual(message['Message-ID'], '<delivery-id@example.test>')
        self.assertEqual(server.send_message.call_args.kwargs['to_addrs'], ['teacher@example.test'])

    def test_connection_loss_during_send_is_unknown_without_retry(self):
        for error in (TimeoutError(), smtplib.SMTPServerDisconnected('PII')):
            result, _ = self.send(error=error)
            self.assertEqual(result, delivery.SMTPResult('unknown', False, 'smtp_connection'))

    def test_pre_send_network_failure_is_safe_to_retry(self):
        result, server = self.send(login_error=TimeoutError())
        self.assertEqual(result.status, 'failed')
        self.assertTrue(result.retryable)
        server.send_message.assert_not_called()

    def test_explicit_rejections_distinguish_transient_and_permanent(self):
        for code in (451, 550):
            for error in (smtplib.SMTPDataError(code, b'private'), smtplib.SMTPRecipientsRefused({'teacher@example.test': (code, b'private')})):
                result, _ = self.send(error=error)
                self.assertEqual(result.status, 'failed')
                self.assertEqual(result.retryable, code == 451)
                self.assertNotIn('private', str(result))

    def test_starttls_precedes_credentials(self):
        config = delivery.SMTPConfig('smtp.example.test', 587, 'u', 'p', 'sender@example.test', False)
        result, server = self.send(config=config)
        self.assertEqual(result.status, 'smtp_accepted')
        self.assertEqual(server.method_calls[0][0], 'starttls')
        self.assertEqual(server.method_calls[1][0], 'login')

    def test_rejects_recipient_injection_and_configuration_without_secrets(self):
        with patch.object(delivery.smtplib, 'SMTP_SSL') as connect:
            result = delivery.send_smtp(CONFIG, 'a@example.test\nBcc: b@example.test', 'x', 'x', 'id')
        self.assertEqual(result.status, 'failed')
        connect.assert_not_called()
        for env in ({}, {'SMTP_USE_SSL': 'garbage'}):
            with self.assertRaises(ValueError):
                delivery.SMTPConfig.from_env(env)


class ResendTests(unittest.TestCase):
    def test_transport_configuration_defaults_to_smtp_and_selects_resend(self):
        transport, config = delivery.email_config_from_env({'SMTP_HOST':'smtp.test','SMTP_USERNAME':'u','SMTP_PASSWORD':'p','SMTP_FROM':'smtp@example.test'})
        self.assertEqual(transport, 'smtp')
        self.assertIsInstance(config, delivery.SMTPConfig)
        transport, config = delivery.email_config_from_env({'EMAIL_TRANSPORT':'resend','RESEND_API_KEY':'key-secret','EMAIL_FROM':'sender@example.test'})
        self.assertEqual(transport, 'resend')
        self.assertIsInstance(config, delivery.ResendConfig)
        with self.assertRaisesRegex(ValueError, 'EMAIL_TRANSPORT'):
            delivery.email_config_from_env({'EMAIL_TRANSPORT':'other'})

    def test_https_request_uses_fixed_endpoint_key_and_delivery_idempotency(self):
        response = MagicMock()
        response.status = 200
        response.read.return_value = b'{"id":"email-id"}'
        response.__enter__.return_value = response
        opener = Mock()
        opener.open.return_value = response
        with patch.object(delivery, 'build_opener', return_value=opener) as build_opener:
            result = delivery.send_resend(delivery.ResendConfig('re_secret','sender@example.test'), 'teacher@example.test', 'Aviso', 'Texto', 'ledger-uuid')
        request = opener.open.call_args.args[0]
        self.assertEqual(request.full_url, 'https://api.resend.com/emails')
        self.assertEqual(request.get_header('Authorization'), 'Bearer re_secret')
        self.assertEqual(request.get_header('Idempotency-key'), 'ledger-uuid')
        self.assertEqual(result.status, 'provider_accepted')
        self.assertEqual(opener.open.call_args.kwargs['timeout'], 15)
        self.assertEqual(build_opener.call_args.args, (delivery._RejectRedirects,))

    def test_ambiguous_transport_errors_are_unknown_and_scrubbed(self):
        opener = Mock()
        opener.open.side_effect = TimeoutError('key-secret teacher@example.test')
        with patch.object(delivery, 'build_opener', return_value=opener):
            result = delivery.send_resend(delivery.ResendConfig('key-secret','sender@example.test'), 'teacher@example.test', 'x', 'x', 'id')
        self.assertEqual(result, delivery.SMTPResult('unknown', False, 'resend_connection'))
        self.assertNotIn('key-secret', str(result))

    def test_http_rejections_are_bounded_by_status_class(self):
        for status, expected, retryable in ((429,'failed',True),(401,'failed',False),(422,'failed',False),(503,'unknown',False),(302,'failed',False)):
            error = delivery.HTTPError(delivery.RESEND_ENDPOINT, status, 'private body', {}, None)
            error.read = Mock(return_value=b'x' * (delivery.RESPONSE_LIMIT + 10))
            opener = Mock()
            opener.open.side_effect = error
            with patch.object(delivery, 'build_opener', return_value=opener):
                result = delivery.send_resend(delivery.ResendConfig('key','sender@example.test'), 'teacher@example.test', 'x', 'x', 'id')
            self.assertEqual((result.status,result.retryable), (expected,retryable))
            self.assertNotIn('private body', str(result))

    def test_success_requires_bounded_json_receipt_id(self):
        for body in (b'', b'{invalid', b'{"id":""}', b'{"id":null}', b'x' * (delivery.RESPONSE_LIMIT + 1)):
            response = MagicMock()
            response.status = 200
            response.read.return_value = body
            response.__enter__.return_value = response
            opener = Mock()
            opener.open.return_value = response
            with patch.object(delivery, 'build_opener', return_value=opener):
                result = delivery.send_resend(delivery.ResendConfig('key','sender@example.test'), 'teacher@example.test', 'x', 'x', 'id')
            self.assertEqual(result, delivery.SMTPResult('unknown', False, 'resend_connection'))

    def test_redirect_handler_refuses_new_hosts(self):
        handler = delivery._RejectRedirects()
        request = delivery.Request(delivery.RESEND_ENDPOINT, headers={'Authorization':'Bearer secret'})
        self.assertIsNone(handler.redirect_request(request, Mock(), 302, 'Found', {}, 'https://attacker.example/'))

    def test_ledger_dispatch_keeps_provider_acceptance_distinct(self):
        db=Mock()
        db.rpc.return_value.execute.side_effect=[SimpleNamespace(data=[{'id':'delivery-uuid','claim_token':'token','recipient':'teacher@example.test','claimed':True}]),SimpleNamespace(data=True),SimpleNamespace(data=True)]
        config=delivery.ResendConfig('key','sender@example.test')
        with patch.object(delivery, 'send_resend', return_value=delivery.SMTPResult('provider_accepted')) as send:
            result=delivery.deliver(db,teacher_id='teacher',subject_id='subject',kind='weekly',panel_url=PANEL,config=config,now=NOW)
        self.assertEqual(result,'provider_accepted')
        self.assertEqual(db.rpc.call_args_list[-1].args[1]['p_status'],'provider_accepted')
        send.assert_called_once()

    def test_sao_paulo_boundary_and_previous_completed_week(self):
        self.assertEqual(delivery.local_period('weekly', NOW), ('2026-11-02', '2026-11-09'))
        self.assertEqual(delivery.local_period('weekly', datetime(2026, 11, 9, 2, tzinfo=timezone.utc)), ('2026-10-26', '2026-11-02'))
        self.assertEqual(delivery.local_period('immediate', datetime(2026, 11, 9, 2, tzinfo=timezone.utc)), ('2026-11-08', '2026-11-09'))
        with self.assertRaises(ValueError):
            delivery.local_period('weekly', datetime(2026, 11, 9))


class DispatcherTests(unittest.TestCase):
    def invoke(self, db):
        return delivery.deliver(db, teacher_id='teacher', subject_id='subject', kind='weekly', panel_url=PANEL, config=CONFIG, now=NOW)

    def test_unclaimed_states_never_contact_smtp(self):
        for status in ('unknown', 'smtp_accepted', 'received', 'claimed', 'sending', 'failed'):
            db = Mock()
            db.rpc.return_value.execute.return_value.data = [{'claimed': False, 'status': status}]
            with patch.object(delivery, 'send_smtp') as send:
                self.assertEqual(self.invoke(db), status)
            send.assert_not_called()

    def test_fences_before_smtp_and_records_afterwards(self):
        db = Mock()
        db.rpc.return_value.execute.side_effect = [SimpleNamespace(data=[{'id': 'id', 'claim_token': 'token', 'recipient': 'teacher@example.test', 'claimed': True}]), SimpleNamespace(data=True), SimpleNamespace(data=True)]
        with patch.object(delivery, 'send_smtp', return_value=delivery.SMTPResult('smtp_accepted')) as send:
            self.assertEqual(self.invoke(db), 'smtp_accepted')
        self.assertEqual([call.args[0] for call in db.rpc.call_args_list], ['claim_email_delivery','begin_email_delivery','finish_email_delivery'])
        self.assertEqual(db.rpc.call_args.args[1]['p_token'], 'token')
        send.assert_called_once()

    def test_lost_fence_does_not_send(self):
        db = Mock()
        db.rpc.return_value.execute.side_effect = [SimpleNamespace(data=[{'id': 'id', 'claim_token': 't', 'recipient': 'teacher@example.test', 'claimed': True}]), SimpleNamespace(data=False)]
        with patch.object(delivery, 'send_smtp') as send:
            self.assertEqual(self.invoke(db), 'unknown')
        send.assert_not_called()

    def test_failure_to_persist_acceptance_does_not_start_another_send(self):
        db = Mock()
        db.rpc.return_value.execute.side_effect = [SimpleNamespace(data=[{'id': 'id', 'claim_token': 't', 'recipient': 'teacher@example.test', 'claimed': True}]), SimpleNamespace(data=True), RuntimeError('database unavailable')]
        with patch.object(delivery, 'send_smtp', return_value=delivery.SMTPResult('smtp_accepted')) as send:
            with self.assertRaises(RuntimeError):
                self.invoke(db)
        send.assert_called_once()

    def test_partial_week_preserves_other_recipients_and_reports_unknown(self):
        db = Mock()
        db.rpc.return_value.execute.return_value.data = [{'teacher_id':'a','subject_id':'a'}, {'teacher_id':'b','subject_id':'b'}]
        with patch.object(delivery, 'deliver', side_effect=['smtp_accepted','unknown']):
            result = delivery.run_weekly_summary(db, panel_url=PANEL, config=CONFIG, now=NOW)
        self.assertEqual(result['status'], 'unknown')
        self.assertEqual(result['smtp_accepted'], 1)
        self.assertEqual(result['received'], 0)


class SQLTests(unittest.TestCase):
    def test_migrations_and_delivery_state_machine_in_postgresql(self):
        root = Path(__file__).resolve().parents[1]
        if not shutil.which('node') or not (root/'scripts/validation/node_modules/@electric-sql/pglite').exists():
            self.skipTest('Instale scripts/validation com npm ci para testar PostgreSQL local.')
        # Reaproveita apenas o bootstrap isolado das migrations existentes.
        bootstrap = (root/'scripts/validation/privacy-database.mjs').read_text(encoding='utf-8').split('let passed = 0;')[0]
        result = subprocess.run(['node','--input-type=module','-'], input=bootstrap + SQL_CASES, text=True, capture_output=True, cwd=root/'scripts/validation', timeout=120, encoding='utf-8')
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr[-8000:])


SQL_CASES = r'''
const teacher = 'b0000000-0000-0000-0000-000000000001';
const teacher2 = 'b0000000-0000-0000-0000-000000000002';
for (const id of [teacher,teacher2]) {
  await db.query(`insert into auth.users(id,email,raw_app_meta_data) values ($1,'teacher@example.test','{"account_origin":"admin_provisioned"}')`, [id]);
  await db.query(`update public.profiles set role='teacher', registration_status='active', age_band='adult' where id=$1`, [id]);
}
const subjects = (await db.query('select id from public.subjects order by id')).rows;
const subject = subjects[0].id;
const subject2 = subjects[1].id;
await db.query('insert into public.teacher_subjects(teacher_id,subject_id) values ($1,$2),($3,$4)', [teacher,subject,teacher2,subject2]);
async function claim(t=teacher,s=subject,kind='weekly',start='2026-11-02',end='2026-11-09') {
  return (await db.query('select * from public.claim_email_delivery($1,$2,$3,$4,$5)',[t,s,kind,start,end])).rows[0];
}
async function begin(r) { return (await db.query('select public.begin_email_delivery($1,$2) ok',[r.id,r.claim_token])).rows[0].ok; }
async function finish(r,status,retry=false) { return (await db.query('select public.finish_email_delivery($1,$2,$3,$4,null) ok',[r.id,r.claim_token,status,retry])).rows[0].ok; }
const a = await claim();
assert.equal(a.claimed,true);
assert.equal((await claim()).claimed,false);
assert.equal(await begin({...a,claim_token:teacher2}),false);
assert.equal(await begin(a),true);
assert.equal(await begin(a),false);
await db.query(`update public.email_deliveries set lease_until=now()-interval '1 minute' where id=$1`,[a.id]);
assert.equal((await claim()).status,'unknown');
assert.equal((await claim()).claimed,false);
assert.equal(await finish(a,'smtp_accepted'),false);
const b=await claim(teacher2,subject2);
assert.equal(await begin(b),true);
assert.equal(await finish(b,'smtp_accepted'),true);
assert.equal((await claim(teacher2,subject2)).status,'smtp_accepted');
assert.equal((await db.query('select received_at from public.email_deliveries where id=$1',[b.id])).rows[0].received_at,null);
assert.equal(await finish(b,'failed'),false);
await assert.rejects(db.query(`update public.email_deliveries set status='received' where id=$1`,[b.id]));
const provider=await claim(teacher2,subject2,'weekly','2026-11-09','2026-11-16');
assert.equal(await begin(provider),true);
assert.equal(await finish(provider,'provider_accepted'),true);
const providerRow=(await db.query('select status,smtp_accepted_at,provider_accepted_at from public.email_deliveries where id=$1',[provider.id])).rows[0];
assert.equal(providerRow.status,'provider_accepted');
assert.equal(providerRow.smtp_accepted_at,null);
assert.ok(providerRow.provider_accepted_at);
assert.equal((await claim(teacher2,subject2,'weekly','2026-11-09','2026-11-16')).status,'provider_accepted');
const c=await claim(teacher,subject,'immediate','2026-11-09','2026-11-10');
await db.query(`update public.email_deliveries set lease_until=now()-interval '1 minute' where id=$1`,[c.id]);
const c2=await claim(teacher,subject,'immediate','2026-11-09','2026-11-10');
assert.equal(c2.claimed,true);
assert.notEqual(c2.claim_token,c.claim_token);
assert.equal(await begin(c),false);
assert.equal(await begin(c2),true);
assert.equal(await finish(c2,'failed',true),true);
assert.equal((await claim(teacher,subject,'immediate','2026-11-09','2026-11-10')).claimed,false);
await db.query(`update public.email_deliveries set next_attempt_at=now()-interval '1 minute' where id=$1`,[c.id]);
const c3=await claim(teacher,subject,'immediate','2026-11-09','2026-11-10');
assert.equal(c3.claimed,true);
assert.equal(await begin(c3),true);
assert.equal(await finish(c3,'failed',true),true);
await db.query(`update public.email_deliveries set next_attempt_at=now()-interval '1 minute' where id=$1`,[c.id]);
assert.equal((await claim(teacher,subject,'immediate','2026-11-09','2026-11-10')).claimed,false);
await db.query('update public.profiles set email_difficulty_alerts=false where id=$1',[teacher]);
assert.equal(await claim(teacher,subject,'immediate','2026-11-11','2026-11-12'),undefined);
await db.query('update public.profiles set email_difficulty_alerts=true where id=$1',[teacher]);
await db.query('update public.profiles set email_weekly_summary=false where id=$1',[teacher]);
assert.equal(await claim(teacher,subject,'weekly','2026-11-09','2026-11-16'),undefined);
await db.query('update public.profiles set email_weekly_summary=true where id=$1',[teacher]);
const d=await claim(teacher,subject,'weekly','2026-11-09','2026-11-16');
await db.query('update public.profiles set email_weekly_summary=false where id=$1',[teacher]);
assert.equal(await begin(d),false);
assert.equal(await claim(teacher,subject2,'weekly','2026-11-09','2026-11-16'),undefined);
await assert.rejects(claim(teacher,subject,'weekly','2026-11-03','2026-11-10'));
for (const role of ['anon','authenticated']) {
  await db.exec(`set role ${role}`);
  await assert.rejects(db.query('select * from public.email_deliveries'));
  await assert.rejects(claim());
  await db.exec('reset role');
}
console.log('RF22 SQL state machine, fencing, retry bounds and role isolation passed');
await db.close();
'''

if __name__ == '__main__':
    unittest.main()
