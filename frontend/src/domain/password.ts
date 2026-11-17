/** Política de senha do cadastro; o servidor e o provedor de identidade aplicam a mesma regra. */
export const MIN_PASSWORD_LENGTH = 6;
export const MAX_PASSWORD_LENGTH = 128;

/** Explica a primeira regra ainda não atendida; texto vazio quando a senha serve. */
export function passwordPolicyError(password: string): string {
  if (password.length < MIN_PASSWORD_LENGTH) return 'A senha precisa ter pelo menos 6 caracteres.';
  if (password.length > MAX_PASSWORD_LENGTH) return 'A senha pode ter no máximo 128 caracteres.';
  if (!/[A-Z]/.test(password)) return 'A senha precisa ter pelo menos uma letra maiúscula.';
  if (!/[a-z]/.test(password)) return 'A senha precisa ter pelo menos uma letra minúscula.';
  if (!/\d/.test(password)) return 'A senha precisa ter pelo menos um número.';
  return '';
}
