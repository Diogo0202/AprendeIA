import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { LegalDocuments, TERMS_OF_USE_VERSION } from './LegalDocuments';
import { PRIVACY_POLICY_VERSION } from './PrivacyPolicyAccess';

describe('Aba de termos e privacidade', () => {
  afterEach(cleanup);

  it('abre na Política de Privacidade vigente', () => {
    render(<LegalDocuments id="legal" />);
    expect(screen.getByRole('heading', { name: 'Termos e privacidade' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Política de Privacidade' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByText(`VERSÃO ${PRIVACY_POLICY_VERSION} · 04/11/2026`)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '8. Crianças e adolescentes' })).toBeInTheDocument();
  });

  it('mostra os Termos de Uso', () => {
    render(<LegalDocuments />);
    fireEvent.click(screen.getByRole('button', { name: 'Termos de Uso' }));
    expect(screen.getByText(`VERSÃO ${TERMS_OF_USE_VERSION} · 04/11/2026`)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '3. Condutas proibidas' })).toBeInTheDocument();
    expect(screen.getByText(/não definem nota nem\s+aprovação/)).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '8. Crianças e adolescentes' })).toBeNull();
  });

  it('lista a LGPD, os artigos relacionados e as orientações da ANPD', () => {
    render(<LegalDocuments />);
    fireEvent.click(screen.getByRole('button', { name: 'LGPD e referências' }));
    expect(screen.getByRole('link', { name: /Lei nº 13\.709\/2018/ })).toHaveAttribute(
      'href',
      'https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm',
    );
    for (const article of ['Art. 14', 'Art. 18', 'Art. 20', 'Arts. 33 a 36', 'Art. 48']) {
      expect(screen.getByText(article)).toBeInTheDocument();
    }
    const anpdLinks = screen
      .getAllByRole('link')
      .filter((link) => link.getAttribute('href')?.startsWith('https://www.gov.br/anpd/'));
    expect(anpdLinks).toHaveLength(4);
    for (const link of anpdLinks) expect(link).toHaveAttribute('rel', 'noreferrer');
  });
});
