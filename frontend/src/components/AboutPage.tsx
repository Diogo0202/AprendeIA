import { useEffect } from 'react';
import { LegalDocuments } from './LegalDocuments';
import { cleanNavigation, stopOptionalTracking } from '../lib/tracking';

/** Página informativa separada do documento que contém login e dados escolares. */
export function AboutPage() {
  useEffect(() => {
    document.title = 'Sobre o AprendeIA | Escola Diogo Mendes teste';
    document
      .querySelector<HTMLLinkElement>('link[rel="canonical"]')
      ?.setAttribute('href', `${window.location.origin}/sobre`);
  }, []);
  return (
    <main id="main-content" tabIndex={-1} className="about-page">
      <p>Escola Diogo Mendes teste</p>
      <h1>AprendeIA: seu espaço de aprendizagem</h1>
      <p>
        Aulas, exercícios e acompanhamento pedagógico ajudam a identificar dificuldades e orientar o
        próximo estudo. O tutor de IA oferece apoio; o professor acompanha o aprendizado.
      </p>
      <p>
        O estudante acessa seus dados. Professores acompanham as próprias turmas e disciplina. A
        administração atende pedidos de privacidade e gerencia a instituição.
      </p>
      <nav aria-label="Acesso à plataforma">
        <a
          href="/"
          onClick={(event) => {
            event.preventDefault();
            stopOptionalTracking(false);
            cleanNavigation('/');
          }}
        >
          Entrar na plataforma
        </a>
      </nav>
      <h2>Privacidade e atendimento</h2>
      <p>
        Com uma conta, abra Meus dados para registrar e acompanhar seus pedidos. Sem conta, escreva
        para <a href="mailto:dig.mendes.baptista@gmail.com">dig.mendes.baptista@gmail.com</a>. A
        instituição confirma sua identidade antes de entregar dados.
      </p>
      <p>
        Menores e responsáveis são atendidos em{' '}
        <a href="mailto:dig.mendes.baptista.mb@gmail.com">dig.mendes.baptista.mb@gmail.com</a>.
        Enviar um e-mail não libera acesso automaticamente.
      </p>
      <p>
        As contas de estudantes e professores expiram 168 horas após a criação. Os controles do
        produto não comprovam exclusão em backups ou fornecedores externos.
      </p>
      <LegalDocuments />
      <h2>Acessibilidade</h2>
      <p>
        A navegação oferece controles por teclado e foco visível. Se encontrar uma barreira, informe
        a tela e a ação pretendida pelo canal de atendimento. A auditoria técnica registra o escopo
        testado e as pendências.
      </p>
    </main>
  );
}
