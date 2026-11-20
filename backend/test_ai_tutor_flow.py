"""Contrato do tutor com provedor simulado, sem enviar dados externos."""
import json
import sys
import unittest
from pathlib import Path
from unittest.mock import Mock, patch
from uuid import uuid4

sys.path.insert(0, str(Path(__file__).parent))
from fastapi import HTTPException
from main import AICommunicationRequest, send_ai_communication_message


class TutorFlowTests(unittest.TestCase):
    def setup_flow(self):
        db = Mock()
        query = db.table.return_value
        for method in ('insert', 'select', 'eq', 'order', 'limit', 'update'):
            getattr(query, method).return_value = query
        query.execute.return_value.data = [{'id': str(uuid4()), 'sender_kind': 'user', 'body': 'Explique números primos'}]
        db.rpc.return_value.execute.return_value.data = {
            'user_message': {'id':str(uuid4()),'sender_kind':'user','body':'Explique frações'},
            'assistant_message': {'id':str(uuid4()),'sender_kind':'assistant','body':'Pense em partes iguais.'},
        }
        provider = Mock()
        provider.responses.create.return_value.output_text = json.dumps({'answer': 'Pense em partes iguais.', 'suggested_questions': []})
        return db, provider

    def test_student_and_teacher_keep_only_their_context(self):
        for role in ('student', 'teacher'):
            with self.subTest(role=role):
                db, provider = self.setup_flow()
                user = {'id': str(uuid4()), 'role': role, 'full_name': 'Nome privado'}
                conversation = uuid4()
                with patch('main.database', return_value=db), patch('main.openai_client', return_value=provider), patch('main.enforce_api_rate_limit'), patch('main.owned_conversation') as owned:
                    result = send_ai_communication_message(AICommunicationRequest(conversation_id=conversation, body='Explique frações'), user)
                owned.assert_called_once_with(db, user['id'], str(conversation), expected_kind='ai')
                sent = provider.responses.create.call_args.kwargs
                self.assertFalse(sent['store'])
                self.assertNotIn(user['full_name'], json.dumps(sent))
                request_data = json.loads(sent['input'][1]['content'])
                self.assertEqual(request_data['solicitacao_do_usuario'], 'Explique frações')
                self.assertNotIn('Explique frações', json.dumps(request_data['historico_recente']))
                db.table.return_value.insert.assert_not_called()
                self.assertEqual(db.rpc.call_args.args[0], 'append_ai_exchange')
                db.table.return_value.eq.assert_any_call('conversation_id', str(conversation))
                self.assertEqual(result['assistant_message']['sender_name'], 'Tutor IA')

    def test_other_users_conversation_is_rejected_before_provider(self):
        db, provider = self.setup_flow()
        with patch('main.database', return_value=db), patch('main.openai_client', return_value=provider), patch('main.enforce_api_rate_limit'), patch('main.owned_conversation', side_effect=HTTPException(403, 'Acesso negado')):
            with self.assertRaises(HTTPException) as error:
                send_ai_communication_message(AICommunicationRequest(conversation_id=uuid4(), body='Explique frações'), {'id': str(uuid4()), 'role': 'student'})
        self.assertEqual(error.exception.status_code, 403)
        provider.responses.create.assert_not_called()
        db.table.assert_not_called()

    def test_provider_failure_has_safe_response(self):
        db, provider = self.setup_flow()
        provider.responses.create.side_effect = RuntimeError('private-provider-detail')
        with patch('main.database', return_value=db), patch('main.openai_client', return_value=provider), patch('main.enforce_api_rate_limit'), patch('main.owned_conversation'):
            with self.assertRaises(HTTPException) as error:
                send_ai_communication_message(AICommunicationRequest(conversation_id=uuid4(), body='Explique frações'), {'id': str(uuid4()), 'role': 'student'})
        self.assertEqual(error.exception.status_code, 502)
        self.assertNotIn('private-provider-detail', error.exception.detail)
        db.rpc.assert_not_called()
        db.table.return_value.insert.assert_not_called()

    def test_invalid_provider_answer_does_not_persist_question(self):
        db, provider = self.setup_flow()
        provider.responses.create.return_value.output_text = '{}'
        with patch('main.database', return_value=db), patch('main.openai_client', return_value=provider), patch('main.enforce_api_rate_limit'), patch('main.owned_conversation'):
            with self.assertRaises(HTTPException) as caught:
                send_ai_communication_message(AICommunicationRequest(conversation_id=uuid4(), body='Explique frações'), {'id':str(uuid4()),'role':'student'})
        self.assertEqual(caught.exception.status_code, 502)
        db.rpc.assert_not_called()

    def test_database_failure_reports_safe_error_and_never_uses_separate_inserts(self):
        db, provider = self.setup_flow()
        db.rpc.return_value.execute.side_effect = RuntimeError('private-database-detail')
        with patch('main.database', return_value=db), patch('main.openai_client', return_value=provider), patch('main.enforce_api_rate_limit'), patch('main.owned_conversation'):
            with self.assertRaises(HTTPException) as caught:
                send_ai_communication_message(AICommunicationRequest(conversation_id=uuid4(), body='Explique frações'), {'id':str(uuid4()),'role':'teacher'})
        self.assertEqual(caught.exception.status_code, 503)
        self.assertNotIn('private-database-detail', caught.exception.detail)
        db.table.return_value.insert.assert_not_called()


if __name__ == '__main__':
    unittest.main()
