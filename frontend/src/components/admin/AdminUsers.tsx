import { FormEvent, useEffect, useId, useRef, useState } from 'react';
import { gateways } from '../../application/gateways';
import { failureMessage } from '../../application/result';
import { roleLabels, type AdminUser, type Role } from '../../domain/admin';

type DeletionDialogProps = {
  target: AdminUser;
  onCancel: () => void;
  onDeleted: (target: AdminUser) => void;
};

/** Diálogo nativo: foco preso e confirmação digitada antes de uma ação irreversível. */
function DeletionDialog({ target, onCancel, onDeleted }: DeletionDialogProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [confirmation, setConfirmation] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!dialog.current?.open) dialog.current?.showModal();
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (confirmation !== 'EXCLUIR' || reason.trim().length < 5 || busy) return;
    setBusy(true);
    setError('');
    try {
      const deleted = await gateways().admin.deleteUser(target.id, confirmation, reason.trim());
      if (!deleted.ok)
        throw new Error(failureMessage(deleted, 'Não foi possível excluir a conta.'));
      onDeleted(target);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível excluir a conta.');
      setBusy(false);
    }
  }

  return (
    <dialog
      ref={dialog}
      className="privacy-policy-dialog"
      aria-labelledby={titleId}
      onCancel={onCancel}
    >
      <form className="privacy-policy-content" onSubmit={(event) => void submit(event)}>
        <h2 id={titleId}>Excluir {target.full_name}</h2>
        <p className="privacy-policy-review-note">
          A exclusão não pode ser desfeita. Encerra o acesso e remove o perfil, as conversas e o
          histórico identificável desta conta.
          {target.role === 'teacher' &&
            ' As turmas ficam sem professor e o progresso dos alunos é preservado.'}
        </p>
        <label>
          MOTIVO
          <textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            minLength={5}
            maxLength={300}
            required
          />
          <small className="field-help">
            Fica no registro de auditoria por até 7 dias. Não inclua dados pessoais.
          </small>
        </label>
        <label>
          DIGITE EXCLUIR PARA CONFIRMAR
          <input
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            autoComplete="off"
            required
          />
        </label>
        {error && (
          <p className="form-message" role="alert">
            {error}
          </p>
        )}
        <div className="analytics-consent-actions">
          <button type="button" className="outline-button" onClick={onCancel} disabled={busy}>
            Cancelar
          </button>
          <button
            type="submit"
            className="primary-button"
            disabled={busy || confirmation !== 'EXCLUIR' || reason.trim().length < 5}
          >
            {busy ? 'Excluindo...' : 'Excluir conta'}
          </button>
        </div>
      </form>
    </dialog>
  );
}

type AdminUsersProps = {
  users: AdminUser[];
  currentUserId?: string | null;
  onViewActivity: (user: AdminUser) => void;
  onDeleted: (user: AdminUser) => void;
};

/** Lista de contas com busca, histórico e exclusão; administração não é excluível aqui. */
export function AdminUsers({ users, currentUserId, onViewActivity, onDeleted }: AdminUsersProps) {
  const [query, setQuery] = useState('');
  const [role, setRole] = useState<'' | Role>('');
  const [target, setTarget] = useState<AdminUser | null>(null);
  const [message, setMessage] = useState('');
  const normalized = query.trim().toLocaleLowerCase('pt-BR');
  const visible = users.filter(
    (user) =>
      (!role || user.role === role) &&
      (!normalized ||
        user.full_name.toLocaleLowerCase('pt-BR').includes(normalized) ||
        user.email.toLocaleLowerCase('pt-BR').includes(normalized)),
  );

  return (
    <section className="profile-panel" aria-labelledby="admin-users-title">
      <p className="eyebrow">CONTAS</p>
      <h2 id="admin-users-title">Usuários</h2>
      <div className="audit-filters">
        <label>
          BUSCAR
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Nome ou e-mail"
          />
        </label>
        <label>
          PERFIL
          <select value={role} onChange={(event) => setRole(event.target.value as '' | Role)}>
            <option value="">Todos</option>
            <option value="student">Estudante</option>
            <option value="teacher">Professor</option>
            <option value="admin">Administração</option>
          </select>
        </label>
      </div>
      {message && (
        <p className="form-message" role="status">
          {message}
        </p>
      )}
      <div
        className="audit-table-wrap"
        tabIndex={0}
        role="region"
        aria-label="Atividades, tabela com rolagem"
      >
        <table className="audit-table">
          <thead>
            <tr>
              <th>Usuário</th>
              <th>Perfil</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((user) => {
              const protectedAccount = user.role === 'admin' || user.id === currentUserId;
              return (
                <tr key={user.id}>
                  <td>
                    <strong>{user.full_name}</strong>
                    <small>{user.email}</small>
                  </td>
                  <td>
                    <span className="badge">{roleLabels[user.role]}</span>
                  </td>
                  <td>
                    <button
                      className="outline-button"
                      type="button"
                      onClick={() => onViewActivity(user)}
                    >
                      Ver atividades
                    </button>{' '}
                    {!protectedAccount && (
                      <button
                        className="outline-button"
                        type="button"
                        onClick={() => {
                          setMessage('');
                          setTarget(user);
                        }}
                        aria-label={`Excluir ${user.full_name}`}
                      >
                        Excluir
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
            {!visible.length && (
              <tr>
                <td colSpan={3}>Nenhum usuário encontrado.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {target && (
        <DeletionDialog
          target={target}
          onCancel={() => setTarget(null)}
          onDeleted={(deleted) => {
            setTarget(null);
            setMessage(`Conta de ${deleted.full_name} excluída.`);
            onDeleted(deleted);
          }}
        />
      )}
    </section>
  );
}
