from fastapi import HTTPException

from rpc_errors import rpc_http_error


class ProviderError(Exception):
    def __init__(self, code: str):
        self.code = code
        super().__init__("detalhe privado do provedor")


def test_rpc_http_error_maps_only_statuses_in_module_allowlist():
    messages = {400: "Requisição inválida.", 409: "Conflito.", 503: "Indisponível."}

    assert rpc_http_error(ProviderError("PT400"), messages).status_code == 400
    assert rpc_http_error(ProviderError("23505"), messages).status_code == 409
    assert rpc_http_error(ProviderError("PT403"), messages).status_code == 503
    assert rpc_http_error(ProviderError("XX000"), messages).status_code == 503


def test_rpc_http_error_uses_safe_message_and_no_provider_details():
    error = rpc_http_error(
        ProviderError("PT404"),
        {404: "Não encontrado.", 503: "Indisponível."},
    )

    assert isinstance(error, HTTPException)
    assert error.status_code == 404
    assert error.detail == "Não encontrado."
    assert "detalhe privado" not in str(error.detail)


def test_rpc_http_error_maps_precondition_only_when_allowed():
    error = rpc_http_error(
        ProviderError("PT412"),
        {412: "Pré-condição recusada.", 503: "Indisponível."},
    )

    assert error.status_code == 412
    assert error.detail == "Pré-condição recusada."


def test_rpc_http_error_does_not_stringify_provider_error():
    class UnsafeStringError(ProviderError):
        def __str__(self):
            raise AssertionError("provider exception must not be stringified")

    error = rpc_http_error(UnsafeStringError("XX000"), {503: "Indisponível."})
    assert error.status_code == 503
    assert error.detail == "Indisponível."
