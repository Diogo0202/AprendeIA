import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CommunicationCenter } from './CommunicationCenter';
import { NavigationDock } from './NavigationDock';

vi.mock('../lib/supabase', () => ({ isSupabaseConfigured: false }));
afterEach(cleanup);

describe('CommunicationCenter', () => {
  it('mantem o aluno entre professor autorizado e tutor de IA', () => {
    render(<CommunicationCenter role="student" requestedMode="direct" />);

    expect(screen.getByRole('button', { name: /Prof. Carlos Lima/i })).toBeInTheDocument();
    expect(screen.queryByText('Ana Souza')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Tutor IA/i })).toBeInTheDocument();
  });

  it('renderiza mensagens de demonstracao como texto', () => {
    render(<CommunicationCenter role="student" requestedMode="ai" />);

    fireEvent.change(screen.getByLabelText('Mensagem'), {
      target: { value: 'Como estudo fracoes?' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar' }));

    expect(screen.getByText('Como estudo fracoes?')).toBeInTheDocument();
    expect(screen.getByText(/Vamos por partes/i)).toBeInTheDocument();
  });
});

describe('NavigationDock', () => {
  it('mantem rotulo acessivel e executa a acao do item', () => {
    const onSelect = vi.fn();
    render(
      <NavigationDock
        ariaLabel="Menu de teste"
        items={[{ id: 'study', label: 'Estudo', glyph: 'ES', onSelect }]}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Estudo/i }));
    expect(onSelect).toHaveBeenCalledOnce();
  });
});
