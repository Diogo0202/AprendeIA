from aprendeia.adapters.outbound.supabase.rpc_errors import rpc_error
from aprendeia.domain.errors import NotFound
from test_support import status_of


class ProviderError(Exception):
    def __init__(self, code: str):
        self.code = code
        super().__init__("detalhe privado do provedor")


def test_rpc_error_maps_only_statuses_in_module_allowlist():
    messages = {400: "Requisição inválida.", 409: "Conflito.", 503: "Indisponível."}

    assert status_of(rpc_error(ProviderError("PT400"), messages)) == 400
    assert status_of(rpc_error(ProviderError("23505"), messages)) == 409
    assert status_of(rpc_error(ProviderError("PT403"), messages)) == 503
    assert status_of(rpc_error(ProviderError("XX000"), messages)) == 503


def test_rpc_error_uses_safe_message_and_no_provider_details():
    error = rpc_error(
        ProviderError("PT404"),
        {404: "Não encontrado.", 503: "Indisponível."},
    )

    assert isinstance(error, NotFound)
    assert status_of(error) == 404
    assert error.detail == "Não encontrado."
    assert "detalhe privado" not in str(error.detail)


def test_rpc_error_maps_precondition_only_when_allowed():
    error = rpc_error(
        ProviderError("PT412"),
        {412: "Pré-condição recusada.", 503: "Indisponível."},
    )

    assert status_of(error) == 412
    assert error.detail == "Pré-condição recusada."


def test_rpc_error_does_not_stringify_provider_error():
    class UnsafeStringError(ProviderError):
        def __str__(self):
            raise AssertionError("provider exception must not be stringified")

    error = rpc_error(UnsafeStringError("XX000"), {503: "Indisponível."})
    assert status_of(error) == 503
    assert error.detail == "Indisponível."
