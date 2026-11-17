/** Resultado de uma chamada a um serviço externo, sem expor detalhes de transporte às telas. */
export type Success<T> = { ok: true; data: T };

/** `detail` traz a mensagem segura do servidor; fica vazio quando ele não enviou nenhuma. */
export type Failure = { ok: false; status: number; detail: string };

export type Result<T> = Success<T> | Failure;

/** A tela decide o texto padrão; a mensagem do servidor, quando existe, tem prioridade. */
export function failureMessage(failure: Failure, fallback: string): string {
  return failure.detail || fallback;
}
