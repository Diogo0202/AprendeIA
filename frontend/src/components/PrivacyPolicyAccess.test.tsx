import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  PrivacyConsentCheckbox,
  PrivacyPolicyAccess,
  PRIVACY_POLICY_VERSION,
} from './PrivacyPolicyAccess';

describe('Política de Privacidade e consentimento', () => {
  afterEach(() => vi.restoreAllMocks());

  it('exige uma marcação afirmativa no formulário', () => {
    render(<PrivacyConsentCheckbox label="Li e aceito a política" />);
    const checkbox = screen.getByRole('checkbox', { name: 'Li e aceito a política' });
    expect(checkbox).toBeRequired();
    expect(checkbox).toHaveAttribute('value', 'true');
  });

  it('permite consultar a versão vigente da política', () => {
    Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
      configurable: true,
      value: function (this: HTMLDialogElement) {
        this.setAttribute('open', '');
      },
    });
    render(<PrivacyPolicyAccess />);
    fireEvent.click(screen.getByRole('button', { name: 'Política de Privacidade' }));
    expect(screen.getByRole('dialog')).toHaveAttribute('open');
    expect(
      screen.getByRole('heading', { name: 'Política de Privacidade do AprendeIA' }),
    ).toBeInTheDocument();
    expect(screen.getByText(`VERSÃO ${PRIVACY_POLICY_VERSION} · 23/09/2026`)).toBeInTheDocument();
  });
});
