import { useEffect, useId, useRef, useState } from 'react';
import { PRIVACY_POLICY_VERSION, PrivacyPolicyContent } from './PrivacyPolicyAccess';

export const TERMS_OF_USE_VERSION = '1.0';

const LGPD_URL = 'https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm';

type LegalTab = 'privacy' | 'terms' | 'law';

const legalTabs: { id: LegalTab; label: string }[] = [
  { id: 'privacy', label: 'Política de Privacidade' },
  { id: 'terms', label: 'Termos de Uso' },
  { id: 'law', label: 'LGPD e referências' },
];

/** Artigos da LGPD ligados aos temas que a política trata, em linguagem simples. */
const lgpdArticles: { article: string; topic: string; policySection: string }[] = [
  {
    article: 'Art. 7º',
    topic: 'Hipóteses legais que autorizam o tratamento de dados pessoais.',
    policySection: 'Seções 2, 8 e 9',
  },
  {
    article: 'Art. 14',
    topic:
      'Dados de crianças e adolescentes: melhor interesse e, quando o consentimento for a hipótese, consentimento específico e destacado de um dos pais ou responsável.',
    policySection: 'Seção 8',
  },
  {
    article: 'Arts. 15 e 16',
    topic: 'Término do tratamento e eliminação dos dados depois dele.',
    policySection: 'Seção 6',
  },
  {
    article: 'Art. 18',
    topic:
      'Direitos do titular: confirmação, acesso, correção, anonimização, bloqueio ou eliminação, portabilidade, informação sobre compartilhamento e revogação do consentimento.',
    policySection: 'Seção 7',
  },
  {
    article: 'Art. 20',
    topic: 'Revisão de decisões tomadas unicamente com base em tratamento automatizado.',
    policySection: 'Seções 3 e 7',
  },
  {
    article: 'Arts. 33 a 36',
    topic: 'Transferência internacional de dados, como no uso de fornecedores fora do Brasil.',
    policySection: 'Seção 4',
  },
  {
    article: 'Art. 41',
    topic: 'Encarregado e canal de contato com os titulares.',
    policySection: 'Seção 10',
  },
  {
    article: 'Art. 46',
    topic: 'Medidas de segurança para proteger os dados pessoais.',
    policySection: 'Seção 5',
  },
  {
    article: 'Art. 48',
    topic: 'Comunicação de incidente de segurança à ANPD e aos titulares.',
    policySection: 'Seção 5',
  },
];

const anpdReferences: { title: string; href: string; note: string }[] = [
  {
    title: 'ANPD: tratamento de dados de crianças e adolescentes',
    href: 'https://www.gov.br/anpd/pt-br/assuntos/noticias/anpd-divulga-enunciado-sobre-o-tratamento-de-dados-pessoais-de-criancas-e-adolescentes',
    note: 'Enunciado usado na seção 8.',
  },
  {
    title: 'ANPD: transferência internacional de dados',
    href: 'https://www.gov.br/anpd/pt-br/assuntos/assuntos-internacionais/transferencia-internacional-de-dados',
    note: 'Regulamento aplicável quando um fornecedor trata dados fora do Brasil.',
  },
  {
    title: 'ANPD: comunicação de incidente de segurança',
    href: 'https://www.gov.br/anpd/pt-br/canais_atendimento/agente-de-tratamento/comunicado-de-incidente-de-seguranca-cis',
    note: 'Na orientação vigente, incidente com risco ou dano relevante é comunicado em três dias úteis.',
  },
  {
    title: 'ANPD: documentos técnicos e orientativos',
    href: 'https://www.gov.br/anpd/pt-br/centrais-de-conteudo/documentos-tecnicos-orientativos',
    note: 'Guias sobre crianças, adolescentes, inteligência artificial e proteção de dados.',
  },
];

function TermsOfUseContent() {
  return (
    <div className="privacy-policy-content">
      <p>
        Estes termos definem as regras de uso do AprendeIA na Escola Diogo Mendes teste. A Política
        de Privacidade faz parte destes termos e explica como os dados são tratados.
      </p>
      <h3>1. Contas e acesso</h3>
      <p>
        Use dados verdadeiros no cadastro e mantenha sua senha em sigilo: a conta é pessoal e não
        pode ser compartilhada. Professores só acessam a área docente depois da aprovação da
        administração, na disciplina atribuída. Menores dependem de admissão administrativa antes de
        usar os recursos. Nesta fase de teste, contas de estudantes e professores expiram 168 horas
        após a criação.
      </p>
      <h3>2. Uso permitido</h3>
      <p>
        A plataforma serve para estudar, praticar exercícios, acompanhar o aprendizado e apoiar o
        trabalho pedagógico. As mensagens seguem as regras do sistema: estudante com o professor da
        própria disciplina, professores entre si e administração com professores.
      </p>
      <h3>3. Condutas proibidas</h3>
      <ul>
        <li>Acessar ou tentar acessar dados e contas de outras pessoas.</li>
        <li>Burlar a verificação contra robôs, os limites de tentativas ou outros controles.</li>
        <li>Enviar conteúdo ofensivo, discriminatório, ilegal ou que exponha colegas.</li>
        <li>Tentar fazer o assistente de IA ignorar suas regras ou revelar dados.</li>
        <li>Colocar dados pessoais desnecessários em mensagens e perguntas à IA.</li>
        <li>Copiar materiais da plataforma para uso comercial.</li>
      </ul>
      <h3>4. Inteligência artificial</h3>
      <p>
        As respostas do assistente e as questões geradas por IA são apoio ao estudo. Elas podem
        conter erros e não substituem o professor nem a avaliação da escola. Questões geradas por IA
        só são publicadas depois da revisão de um professor.
      </p>
      <h3>5. Conteúdo e direitos autorais</h3>
      <p>
        Aulas, exercícios e materiais pertencem aos seus autores ou à instituição e podem ser usados
        apenas para fins educacionais dentro da plataforma. Quem publica um material declara ter o
        direito de usá-lo.
      </p>
      <h3>6. Ranking e conquistas</h3>
      <p>
        Pontos, níveis, ranking e conquistas incentivam a participação. Eles não definem nota nem
        aprovação.
      </p>
      <h3>7. Suspensão e exclusão</h3>
      <p>
        A administração pode bloquear ou excluir contas de estudantes e professores que descumpram
        estes termos ou deixem a escola. A exclusão não pode ser desfeita e segue a seção 7 da
        Política de Privacidade. Você também pode pedir a exclusão da sua conta em Meus dados.
      </p>
      <h3>8. Disponibilidade</h3>
      <p>
        O AprendeIA é um projeto acadêmico em fase de teste. Pode haver manutenção, falhas ou
        mudanças nos recursos, e não há garantia de funcionamento contínuo.
      </p>
      <h3>9. Alterações e contato</h3>
      <p>
        O aceite destes termos é obrigatório no cadastro e fica registrado com a versão e o horário,
        pelo mesmo prazo do aceite da Política de Privacidade. Uma nova versão exige novo aceite
        antes de continuar. Dúvidas:{' '}
        <a href="mailto:dig.mendes.baptista@gmail.com">dig.mendes.baptista@gmail.com</a>. Estes
        termos seguem a legislação brasileira, incluindo a LGPD.
      </p>
      <p className="privacy-policy-review-note">
        Versão {TERMS_OF_USE_VERSION} preparada para o projeto. Ela ainda precisa de validação
        jurídica e institucional antes do uso público.
      </p>
    </div>
  );
}

function LegislationContent() {
  return (
    <div className="privacy-policy-content">
      <p>
        A Política de Privacidade do AprendeIA se baseia na{' '}
        <a href={LGPD_URL} target="_blank" rel="noreferrer">
          Lei nº 13.709/2018, Lei Geral de Proteção de Dados Pessoais (LGPD)
        </a>
        , e nas orientações da Autoridade Nacional de Proteção de Dados (ANPD) listadas abaixo.
      </p>
      <h3>Artigos da LGPD relacionados à política</h3>
      <div className="legal-article-list">
        {lgpdArticles.map((item) => (
          <article key={item.article}>
            <strong>{item.article}</strong>
            <p>{item.topic}</p>
            <small>Na política: {item.policySection}</small>
          </article>
        ))}
      </div>
      <h3>Orientações da ANPD</h3>
      <ul className="legal-reference-list">
        {anpdReferences.map((reference) => (
          <li key={reference.href}>
            <a href={reference.href} target="_blank" rel="noreferrer">
              {reference.title}
            </a>
            <span>{reference.note}</span>
          </li>
        ))}
      </ul>
      <h3>Referência acadêmica</h3>
      <p>
        Silva, Alessandro Aparecido da. Orientações para privacidade e adequação à LGPD para PFCs
        2026. Documento acadêmico usado na preparação da política.
      </p>
      <p className="privacy-policy-review-note">
        Os resumos acima usam linguagem simples e não substituem o texto oficial da lei nem a
        avaliação jurídica da instituição.
      </p>
    </div>
  );
}

/** Abre os Termos de Uso no cadastro e na tela de novo aceite. */
export function TermsOfUseAccess({ label = 'Termos de Uso' }: { label?: string }) {
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
        className="privacy-policy-dialog legal-documents"
        aria-labelledby={titleId}
        onClose={() => setIsOpen(false)}
      >
        <div className="privacy-policy-heading">
          <div>
            <p className="eyebrow">VERSÃO {TERMS_OF_USE_VERSION} · 04/11/2026</p>
            <h2 id={titleId}>Termos de Uso do AprendeIA</h2>
          </div>
          <button
            className="privacy-policy-close"
            type="button"
            onClick={() => setIsOpen(false)}
            aria-label="Fechar termos"
          >
            Fechar
          </button>
        </div>
        <TermsOfUseContent />
      </dialog>
    </>
  );
}

/** Reúne política, termos e legislação em uma aba disponível para todos os perfis. */
export function LegalDocuments({ id }: { id?: string }) {
  const titleId = useId();
  const [activeTab, setActiveTab] = useState<LegalTab>('privacy');
  const versions: Record<LegalTab, string> = {
    privacy: `VERSÃO ${PRIVACY_POLICY_VERSION} · 04/11/2026`,
    terms: `VERSÃO ${TERMS_OF_USE_VERSION} · 04/11/2026`,
    law: 'LEGISLAÇÃO CITADA NA POLÍTICA',
  };

  return (
    <section className="legal-documents" id={id} aria-labelledby={titleId}>
      <div className="legal-documents-heading">
        <p className="eyebrow">{versions[activeTab]}</p>
        <h2 id={titleId}>Termos e privacidade</h2>
      </div>
      <div className="legal-documents-tabs" role="group" aria-label="Documentos legais">
        {legalTabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            aria-pressed={activeTab === tab.id}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="legal-documents-body">
        {activeTab === 'privacy' && <PrivacyPolicyContent />}
        {activeTab === 'terms' && <TermsOfUseContent />}
        {activeTab === 'law' && <LegislationContent />}
      </div>
    </section>
  );
}
