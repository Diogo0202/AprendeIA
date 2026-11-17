/** Pedidos do titular (LGPD): tipos e rótulos exibidos ao usuário. */
export type PrivacyRequestKind =
  | 'access'
  | 'correction'
  | 'anonymization'
  | 'deletion'
  | 'confirmation'
  | 'sharing'
  | 'opposition'
  | 'revocation'
  | 'portability'
  | 'automated_review';
export type PrivacyRequest = {
  id: string;
  user_id?: string | null;
  kind: PrivacyRequestKind;
  status: 'pending' | 'completed' | 'rejected' | 'cancelled';
  details: string;
  corrections?: Partial<Record<'full_name' | 'grade' | 'goal', string>> | null;
  response: string | null;
  created_at: string;
  resolved_at: string | null;
  expires_at: string | null;
};
export const privacyRequestKinds: Record<PrivacyRequestKind, string> = {
  access: 'Acesso aos dados',
  correction: 'Correção',
  anonymization: 'Anonimização',
  deletion: 'Exclusão',
  confirmation: 'Confirmação de tratamento',
  sharing: 'Informações sobre compartilhamento',
  opposition: 'Oposição ao tratamento',
  revocation: 'Revogação de consentimento',
  portability: 'Portabilidade',
  automated_review: 'Revisão de decisão automatizada',
};
export const privacyRequestStatuses = {
  pending: 'Pendente',
  completed: 'Concluído',
  rejected: 'Recusado',
  cancelled: 'Cancelado',
};
