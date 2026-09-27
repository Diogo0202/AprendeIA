import { useEffect, useId, useRef, useState } from 'react';

export const PRIVACY_POLICY_VERSION = '1.0';

/** O navegador também valida o campo; o backend repete a exigência no cadastro. */
export function PrivacyConsentCheckbox({
  label,
  requiredDescription = 'Obrigatório para criar a conta ou continuar usando a plataforma.',
}: {
  label: string;
  requiredDescription?: string;
}) {
  const inputId = useId();
  const hintId = `${inputId}-privacy-hint`;

  return (
    <div className="privacy-consent-card">
      <label className="privacy-consent" htmlFor={inputId}>
        <input
          id={inputId}
          name="privacy_policy_accepted"
          type="checkbox"
          value="true"
          aria-required="true"
          aria-describedby={hintId}
          required
        />
        <span>{label}</span>
      </label>
      <small id={hintId} className="privacy-consent-required">
        {requiredDescription}
      </small>
    </div>
  );
}

/** Uma mesma política fica acessível no cadastro, no login e dentro do app. */
export function PrivacyPolicyAccess({ label = 'Política de Privacidade' }: { label?: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (isOpen && !dialog.open) dialog.showModal();
    if (!isOpen && dialog.open) dialog.close();
  }, [isOpen]);

  return (
    <>
      <button className="privacy-policy-trigger" type="button" onClick={() => setIsOpen(true)}>
        {label}
      </button>
      <dialog
        ref={dialogRef}
        className="privacy-policy-dialog"
        aria-labelledby="privacy-policy-title"
        onClose={() => setIsOpen(false)}
      >
        <div className="privacy-policy-heading">
          <div>
            <p className="eyebrow">VERSÃO {PRIVACY_POLICY_VERSION} · 23/09/2026</p>
            <h2 id="privacy-policy-title">Política de Privacidade do AprendeIA</h2>
          </div>
          <button
            className="privacy-policy-close"
            type="button"
            onClick={() => setIsOpen(false)}
            aria-label="Fechar política"
          >
            Fechar
          </button>
        </div>
        <div className="privacy-policy-content">
          <p>
            Esta política explica como o AprendeIA trata informações usadas para oferecer aulas,
            acompanhar o progresso e proteger as contas da plataforma.
          </p>
          <h3>1. Informações utilizadas</h3>
          <p>
            Podemos tratar dados de cadastro e perfil (como nome, e-mail, papel e etapa escolar),
            dados acadêmicos (disciplinas, aulas, respostas, acertos, dificuldades, tempo de estudo
            e recomendações) e registros técnicos de acesso e segurança.
          </p>
          <h3>2. Para que usamos os dados</h3>
          <p>
            Usamos essas informações para autenticar usuários, disponibilizar conteúdos, acompanhar
            o aprendizado, recomendar atividades, gerar relatórios para professores autorizados,
            administrar turmas e investigar falhas ou acessos indevidos.
          </p>
          <h3>3. Inteligência artificial</h3>
          <p>
            Recursos de IA podem analisar respostas e dificuldades para criar explicações e
            recomendações educacionais. Essas sugestões são apoio ao estudo e não substituem a
            avaliação do professor. Não envie informações pessoais desnecessárias em perguntas ou
            mensagens.
          </p>
          <h3>4. Compartilhamento e acesso</h3>
          <p>
            O acesso é limitado por função: estudantes veem seus próprios dados; professores veem
            dados pedagógicos dos estudantes vinculados às suas turmas e disciplinas;
            administradores gerenciam contas e a operação. Prestadores de infraestrutura e serviços
            usados pela plataforma podem processar dados conforme a configuração e os contratos
            aplicáveis.
          </p>
          <h3>5. Segurança e registros</h3>
          <p>
            Adotamos controles de autenticação, autorização por perfil, proteção de credenciais e
            registros técnicos. A auditoria registra ação, recurso, horário, perfil, identificador
            de correlação e metadados permitidos; endereços IP não são armazenados em texto puro.
          </p>
          <h3>6. Retenção</h3>
          <p>
            Logs de acesso e evidências detalhadas de aceite são mantidos por no máximo 7 dias e
            depois removidos. Para não bloquear o uso após esse prazo, o perfil conserva somente a
            versão atualmente aceita; o horário do aceite é removido após 7 dias. Dados acadêmicos
            seguem a política de retenção definida pela instituição responsável.
          </p>
          <h3>7. Direitos e solicitações</h3>
          <p>
            Você pode solicitar confirmação, acesso, correção ou outras providências relacionadas
            aos seus dados. O canal oficial de privacidade e a identificação do controlador precisam
            ser confirmados pela instituição antes da divulgação pública da plataforma.
          </p>
          <h3>8. Crianças e adolescentes</h3>
          <p>
            Quando o público incluir crianças ou adolescentes, o uso deve seguir as salvaguardas
            aplicáveis, inclusive participação e autorização do responsável quando exigidas, com
            foco no melhor interesse do estudante.
          </p>
          <h3>9. Cookies e tecnologias de medição</h3>
          <p>
            Cookies estritamente necessários podem ser usados para autenticação e funcionamento.
            Ferramentas opcionais de análise devem permanecer desativadas até que a instituição
            defina a base legal, a transparência e o mecanismo de escolha aplicáveis.
          </p>
          <h3>10. Controlador e contato</h3>
          <p>
            A instituição responsável deve informar sua identificação e o canal de privacidade para
            pedidos sobre dados pessoais.
          </p>
          <h3>11. Registro do aceite</h3>
          <p>
            O cadastro registra a versão aceita e o horário do aceite. Contas existentes ou
            provisionadas pela administração só liberam o restante da plataforma depois da
            concordância do próprio titular.
          </p>
          <p className="privacy-policy-review-note">
            Documento baseado na política fornecida para o projeto. A identificação do controlador,
            o canal de atendimento e os prazos específicos de retenção devem ser revisados e
            confirmados antes do uso público.
          </p>
        </div>
      </dialog>
    </>
  );
}
