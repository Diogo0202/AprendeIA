"""Contratos produtivos sem rede, tokens ou contas reais."""

import sys
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

sys.path.insert(0, str(Path(__file__).parent))
from deployment_config import frontend_origin
import main
from fastapi import HTTPException


class DeploymentConfigTests(unittest.TestCase):
    def test_development_keeps_loopback(self):
        self.assertEqual(frontend_origin({}), 'http://localhost:5173')

    def test_production_accepts_only_exact_https_origin(self):
        self.assertEqual(frontend_origin({'APP_ENV': 'production',
            'FRONTEND_URL': 'https://aprendeia.example/'}), 'https://aprendeia.example')
        for value in ('', '*', 'http://app.example', 'https://localhost',
                      'https://127.0.0.1', 'https://[::1]', 'https://10.0.0.1',
                      'https://app.example/path', 'https://app.example?token=secret',
                      'https://app.example#fragment', 'https://user:secret@app.example',
                      'https://*.example', 'https://app.example:5173', 'https://intranet'):
            with self.subTest(value=value), self.assertRaises(ValueError) as caught:
                frontend_origin({'RAILWAY_ENVIRONMENT_NAME': 'production', 'FRONTEND_URL': value})
            self.assertNotIn('secret', str(caught.exception))

    def test_https_email_does_not_require_smtp_credentials(self):
        with patch.dict('os.environ', {'EMAIL_TRANSPORT': 'resend',
                        'RESEND_API_KEY': 'test-key', 'EMAIL_FROM': 'sender@example.test'}, clear=True):
            self.assertTrue(main.email_configured())
        with patch.dict('os.environ', {'EMAIL_TRANSPORT': 'resend'}, clear=True):
            self.assertFalse(main.email_configured())

    def test_readiness_requires_new_schema_without_fetching_personal_records(self):
        db = Mock()
        query = db.table.return_value
        query.select.return_value = query
        query.limit.return_value = query
        with patch('main.database', return_value=db), patch('main.supabase_configured', return_value=True), patch('main.captcha_required', return_value=False):
            self.assertEqual(main.readiness()['status'], 'ready')
        names = {call.args[0] for call in db.table.call_args_list}
        self.assertTrue({'email_deliveries', 'account_admissions', 'gamification_events'} <= names)
        self.assertTrue(all(call.args == (0,) for call in query.limit.call_args_list))

    def test_readiness_hides_missing_schema_details(self):
        db = Mock()
        db.table.side_effect = RuntimeError('private-schema-detail')
        with patch('main.database', return_value=db), patch('main.supabase_configured', return_value=True), patch('main.captcha_required', return_value=False), self.assertRaises(HTTPException) as caught:
            main.readiness()
        self.assertEqual(caught.exception.status_code, 503)
        self.assertNotIn('private-schema-detail', caught.exception.detail)
