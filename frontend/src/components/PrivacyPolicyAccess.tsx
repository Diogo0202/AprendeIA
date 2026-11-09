import { useEffect, useId, useRef, useState } from 'react';

export const PRIVACY_POLICY_VERSION = '1.7';

/** O navegador também valida o campo; o backend repete a exigência no cadastro. */
export function PrivacyConsentCheckbox({
  label,
  name = 'privacy_policy_accepted',
  requiredDescription = 'Ciência obrigatória da política ou aceite dos termos, conforme a caixa. Cookies opcionais têm escolha separada.',
}: {
  label: string;
  name?: 'privacy_policy_accepted' | 'terms_of_use_accepted';
  requiredDescription?: string;
}) {
  const inputId = useId();
  const hintId = `${inputId}-privacy-hint`;

  return (
    <div className="privacy-consent-card">
      <label className="privacy-consent" htmlFor={inputId}>
        <input
          id={inputId}
          name={name}
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
  const titleId = useId();
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
        aria-labelledby={titleId}
        onClose={() => setIsOpen(false)}
      >
        <div className="privacy-policy-heading">
          <div>
            <p className="eyebrow">VERSÃO {PRIVACY_POLICY_VERSION} · 09/11/2026</p>
            <h2 id={titleId}>Política de Privacidade do AprendeIA</h2>
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
        <PrivacyPolicyContent />
      </dialog>
    </>
  );
}

/** Texto da política, usado no modal e na aba de documentos legais. */
export function PrivacyPolicyContent() {
  return (
    <div className="privacy-policy-content">
      <p>
        Esta política explica como o AprendeIA trata informações usadas para oferecer aulas,
        acompanhar o progresso e proteger as contas da plataforma.
      </p>
      <p>
        A confirmação de leitura desta política registra ciência sobre o tratamento de dados. O
        aceite dos Termos de Uso permanece na versão 1.0. Essas marcações não autorizam cookies
        opcionais nem constituem consentimento geral para todas as finalidades. A instituição deve
        definir a hipótese legal de cada tratamento. Recusar medição opcional não impede o acesso.
      </p>
      <h3>1. Informações tratadas</h3>
      <p>
        Podemos tratar dados de cadastro e perfil (como nome, e-mail, papel e etapa escolar), dados
        acadêmicos (disciplinas, aulas, respostas, acertos, dificuldades, tempo de estudo e
        recomendações) e registros técnicos de acesso e segurança.
      </p>
      <h3>2. Para que usamos os dados</h3>
      <p>
        Usamos essas informações para autenticar usuários, disponibilizar conteúdos, acompanhar o
        aprendizado, recomendar atividades, gerar relatórios para professores autorizados,
        administrar turmas e investigar falhas ou acessos indevidos.
      </p>
      <h3>3. Inteligência artificial</h3>
      <p>
        O assistente envia à API da OpenAI sua mensagem e, em conversas, até as 10 mensagens mais
        recentes. A geração de questões envia disciplina, tópico e dificuldade. As recomendações
        docentes usam métricas acadêmicas sem nome do estudante. As chamadas verificadas usam
        store=false. As respostas do assistente ficam no banco do AprendeIA. A IA apoia o estudo e
        não substitui a avaliação do professor. Evite inserir nome, e-mail ou outros dados pessoais
        nas mensagens.
      </p>
      <h3>4. Compartilhamento e acesso</h3>
      <p>
        Desde a versão 1.4, estudantes participam automaticamente do ranking das próprias turmas. O
        ranking da escola é opcional e começa desligado. Os colegas veem somente apelido, avatar, XP
        semanal, nível e posição, sem nome completo, e-mail, notas ou dificuldades. Sair do ranking
        escolar preserva o XP pessoal. A semana começa segunda-feira às 00h em America/Sao_Paulo; a
        exclusão da conta remove a participação e as conquistas. O novo aceite é exigido antes dessa
        exposição.
      </p>
      <p>
        O acesso é limitado por função: estudantes veem seus próprios dados; professores veem dados
        pedagógicos dos estudantes vinculados às suas turmas e disciplinas; administradores
        gerenciam contas e a operação. Prestadores de infraestrutura e serviços usados pela
        plataforma podem processar dados conforme a configuração e os contratos aplicáveis.
      </p>
      <p>
        Na versão 1.5, a administração vê todos os professores e turmas, o desempenho por turma e
        por professor somente em totais (sem nome, respostas ou resultado de um aluno; grupos com
        menos de 3 alunos ficam ocultos), os registros de auditoria dos últimos 7 dias, inclusive de
        uma pessoa específica, e troca mensagens diretas com professores. Administração e estudantes
        não têm conversa direta.
      </p>
      <p>
        Os e-mails de alerta e resumo semanal contêm um aviso e um link para o painel autenticado,
        sem nomes de alunos ou métricas individuais. Cada professor recebe apenas notificações da
        disciplina sob sua responsabilidade. O Gmail SMTP atende à recuperação de senha; o Resend
        HTTPS está preparado para notificações docentes. Vercel e Railway são os destinos previstos
        de hospedagem. Fornecedores só ficam ativos após configuração e verificação.
      </p>
      <h3>5. Segurança e registros</h3>
      <p>
        Adotamos controles de autenticação, autorização por perfil, proteção de credenciais e
        registros técnicos. A auditoria registra ação, recurso, horário, perfil, identificador de
        correlação e metadados permitidos; endereços IP não são armazenados em texto puro.
      </p>
      <h3>6. Retenção</h3>
      <p>
        Logs de acesso e evidências detalhadas de aceite são mantidos por no máximo 7 dias e depois
        removidos. Para não bloquear o uso após esse prazo, o perfil conserva somente a versão
        atualmente aceita; o horário do aceite é removido em até 7 dias. Contas student e teacher
        expiram 168 horas após a criação da conta; admin é isento. Login e nova ciência da política
        não reiniciam esse prazo. O prazo acadêmico definido acompanha as 168 horas da conta. A
        limpeza automática das contas ainda está desativada, portanto o prazo de acesso não comprova
        exclusão. Até a validação do executor, a instituição precisa atender à remoção assistida.
        Prazos de cópias de segurança dependem de confirmação. Não há garantia de remoção imediata
        de backups ou de dados mantidos por fornecedores.
      </p>
      <h3>7. Direitos e solicitações</h3>
      <p>
        Você pode solicitar acesso, correção, anonimização, bloqueio ou exclusão quando aplicável.
        Na área Meus dados, você pode abrir e acompanhar um pedido, cancelar enquanto estiver
        pendente e baixar uma cópia após a revisão administrativa. Pedidos de exclusão e
        anonimização encerram a conta quando aprovados e confirmados pela administração; as
        conversas e o histórico identificável são removidos. A anonimização conserva apenas totais
        globais sem identificação. Correções por esse fluxo abrangem nome, etapa escolar e objetivo
        de estudo. Contas com arquivos armazenados precisam de atendimento assistido antes do
        encerramento. Os pedidos e respostas detalhados expiram em seis dias. Para atendimento
        assistido ou outros direitos, use o canal de privacidade da seção 10.
      </p>
      <p>
        Na área Meus dados ou pelo canal de privacidade da seção 10, solicite atendimento assistido
        para confirmação da existência de tratamento, informação sobre compartilhamento, oposição ao
        tratamento, revogação do consentimento, portabilidade e revisão de decisões tomadas
        unicamente com base em tratamento automatizado que afetem seus interesses. Você também pode
        pedir informação sobre a possibilidade de negar consentimento e suas consequências. O canal
        recebe pedidos de bloqueio ou sobre dados excessivos. Esses direitos dependem de análise e
        das condições legais aplicáveis; o download de acesso em JSON não equivale à portabilidade.
        A área Meus dados registra o pedido e a resposta administrativa, sem executar
        automaticamente medidas externas.
      </p>
      <p>
        A administração também pode excluir contas de estudantes e professores por iniciativa
        própria, com confirmação digitada e motivo. O efeito é o mesmo da exclusão pedida pelo
        titular e não pode ser desfeito. As turmas de um professor excluído são preservadas sem
        professor. A auditoria guarda só o cargo da conta e o motivo, por 7 dias.
      </p>
      <h3>8. Crianças e adolescentes</h3>
      <p>
        Na Escola Diogo Mendes teste, instituição de teste, menores precisam de admissão
        administrativa verificável antes de acessar os recursos. Aceitar esta política ou enviar
        e-mail não comprova aprovação. Sem decisão válida recebida do servidor, o acesso fica
        bloqueado. O canal para menores é{' '}
        <a href="mailto:dig.mendes.baptista.mb@gmail.com">dig.mendes.baptista.mb@gmail.com</a>. O
        controlador deve definir a hipótese legal de cada finalidade e priorizar o melhor interesse
        do estudante. Quando o consentimento for a hipótese aplicável aos dados de uma criança, ele
        deve ser específico, destacado e dado por um responsável legal. As informações também devem
        ser claras para o estudante.
      </p>
      <h3>9. Cookies e tecnologias de medição</h3>
      <p>
        O Supabase Auth mantém a sessão e suas credenciais no armazenamento do navegador. O
        Cloudflare Turnstile verifica solicitações contra abuso nos formulários de autenticação.
        Esses recursos necessários têm finalidade de acesso e segurança, separada da medição
        opcional. Cookies e armazenamento local são tecnologias distintas; os fornecedores podem
        tratar dados técnicos conforme suas configurações.
      </p>
      <p>
        A política {PRIVACY_POLICY_VERSION} limita a medição opcional à página pública /sobre:
        Google Analytics 4 (GA4) para estatísticas de navegação e Microsoft Clarity para gravação de
        sessões (session replay). São duas escolhas independentes, ambas desligadas por padrão,
        ativadas apenas por consentimento específico para cada ferramenta. Recusar ambas permite
        continuar navegando. Essas ferramentas podem tratar identificadores e dados de navegação;
        mascaramento não garante ausência de dados pessoais.
      </p>
      <p>
        A escolha de cookies opcionais vale por 7 dias no navegador. Após esse prazo, as ferramentas
        devem ficar desligadas até nova escolha. O link permanente Preferências de cookies deve
        permitir alterar a escolha ou revogar cada consentimento a qualquer momento, de forma
        gratuita. A revogação deve impedir novas coletas opcionais. O prazo local de 7 dias não
        apaga dados já enviados ao Google ou à Microsoft; exclusão e retenção externa precisam de
        atendimento e confirmação com esses fornecedores. A restrição a /sobre e os controles de
        escolha precisam estar verificados antes da ativação.
      </p>
      <h3>10. Controlador e contato</h3>
      <p>
        Instituição de teste: Escola Diogo Mendes teste. Responsável pelo projeto: Diogo Mendes
        Baptista. Canal de privacidade:{' '}
        <a href="mailto:dig.mendes.baptista@gmail.com">dig.mendes.baptista@gmail.com</a>. Pedidos
        sobre dados pessoais podem exigir confirmação razoável de identidade.
      </p>
      <h3>11. Registro do aceite</h3>
      <p>
        O cadastro registra a ciência da versão {PRIVACY_POLICY_VERSION} e o aceite dos Termos de
        Uso 1.0, com seus horários. Quem confirmou uma política anterior precisa confirmar a ciência
        desta versão para continuar. O registro obrigatório não ativa GA4 nem Clarity. A evidência
        detalhada fica por até 7 dias; o perfil conserva a versão para controlar o acesso. Contas
        existentes ou provisionadas pela administração só liberam o restante da plataforma depois da
        concordância do próprio titular.
      </p>
      <p className="privacy-policy-review-note">
        A lista de fornecedores ativos, a execução da limpeza, os prazos de backups e as condições
        contratuais ainda dependem de confirmação antes do uso público. store=false não garante
        retenção zero no fornecedor. O aceite da versão {PRIVACY_POLICY_VERSION} não substitui a
        admissão de menores.
      </p>
    </div>
  );
}
