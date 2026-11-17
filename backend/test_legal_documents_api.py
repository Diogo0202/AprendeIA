"""A API e a autorização acompanham a fonte central, sem chamadas externas."""
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock, patch

sys.path.insert(0,str(Path(__file__).parent))
from fastapi import Response
from aprendeia.adapters.inbound.http.dependencies import authenticated_profile
from aprendeia.adapters.inbound.http.routers.access import accept_privacy_policy as accept_route
from aprendeia.adapters.inbound.http.routers.access import current_legal_versions as versions_route
from aprendeia.adapters.inbound.http.schemas import PrivacyPolicyAccept
from aprendeia.adapters.inbound.http.support import RequestAudit
from aprendeia.adapters.outbound.supabase.security import get_current_legal_documents
from aprendeia.container import Services
from aprendeia.domain.errors import ApplicationError
from aprendeia.domain.legal_documents import LegalDocumentVersionsUnavailable
from test_support import status_of


def accept_privacy_policy(request, payload, user):
    return accept_route(payload, user, Services(), RequestAudit(request))


def current_legal_versions(response):
    return versions_route(response, Services())
from starlette.requests import Request


DOCUMENTS = {'privacy':{'version':'1.8','effective_at':'2026-11-10T00:00:00Z'},
             'terms':{'version':'1.1','effective_at':'2026-11-10T00:00:00Z'}}


class LegalDocumentsApiTests(unittest.TestCase):
    def test_stale_acceptance_is_rejected_before_write(self):
        db=Mock()
        db.rpc.return_value.execute.return_value.data=DOCUMENTS
        with patch('aprendeia.adapters.outbound.supabase.client.database',return_value=db),patch('aprendeia.adapters.outbound.supabase.security.enforce_api_rate_limit'),self.assertRaises(ApplicationError) as caught:
            accept_privacy_policy(Request({'type':'http'}),PrivacyPolicyAccept(policy_version='1.7',terms_version='1.0'),{'id':'student-id'})
        self.assertEqual(status_of(caught.exception),409)
        self.assertEqual([call.args[0] for call in db.rpc.call_args_list],['get_current_legal_document_versions'])

    def test_public_metadata_comes_from_database_without_cache(self):
        db=Mock()
        db.rpc.return_value.execute.return_value.data=DOCUMENTS
        response=Response()
        with patch('aprendeia.adapters.outbound.supabase.client.database',return_value=db):
            self.assertEqual(current_legal_versions(response),DOCUMENTS)
        self.assertEqual(response.headers['Cache-Control'],'no-store')
        db.rpc.assert_called_once_with('get_current_legal_document_versions',{})

    def test_failed_source_never_uses_local_default(self):
        db=Mock()
        db.rpc.return_value.execute.side_effect=RuntimeError('private-key-provider-detail')
        with self.assertRaises(LegalDocumentVersionsUnavailable):
            get_current_legal_documents(db)
        with patch('aprendeia.adapters.outbound.supabase.client.database',return_value=db), self.assertRaises(ApplicationError) as caught:
            current_legal_versions(Response())
        self.assertEqual(status_of(caught.exception),503)
        self.assertNotIn('private-key',caught.exception.detail)

    def test_new_versions_are_valid_input_but_old_acceptance_cannot_open_account(self):
        self.assertEqual(PrivacyPolicyAccept(policy_version='1.8',terms_version='1.1').policy_version,'1.8')
        db=Mock()
        db.auth.get_user.return_value.user=SimpleNamespace(id='student-id')
        profile={'id':'student-id','role':'student','privacy_policy_version':'1.7','terms_of_use_version':'1.0'}
        db.table.return_value.select.return_value.eq.return_value.limit.return_value.execute.return_value.data=[profile]
        db.rpc.return_value.execute.return_value.data=DOCUMENTS
        with patch('aprendeia.adapters.outbound.supabase.client.database',return_value=db),patch('aprendeia.config.settings.supabase_configured',return_value=True),patch('aprendeia.application.services.access.check_access') as check:
            with self.assertRaises(ApplicationError) as caught:
                authenticated_profile(None,'Bearer test')
            self.assertEqual(status_of(caught.exception),428)
            check.assert_not_called()
            profile.update(privacy_policy_version='1.8',terms_of_use_version='1.1')
            self.assertEqual(authenticated_profile(None,'Bearer test'),profile)
            check.assert_called_once_with(profile)
