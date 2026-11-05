import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AdminPrivacyRequests, PrivacyRequests } from './PrivacyRequests';
import { apiFetch } from '../lib/api';

const configuration = vi.hoisted(() => ({ enabled: true }));
vi.mock('../lib/supabase', () => ({
  get isSupabaseConfigured() {
    return configuration.enabled;
  },
}));
vi.mock('../lib/api', () => ({
  apiFetch: vi.fn(),
  apiError: vi.fn(
    async (response: Response, fallback: string) => (await response.json()).detail || fallback,
  ),
}));
const fetchMock = vi.mocked(apiFetch);
const request = {
  id: 'request-1',
  kind: 'access',
  status: 'pending',
  details: 'Preciso de uma cópia.',
  corrections: null,
  response: null,
  created_at: '2026-11-02T12:00:00Z',
  resolved_at: null,
  expires_at: null,
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

beforeEach(() => {
  configuration.enabled = true;
  fetchMock.mockReset();
  // O jsdom recebe apenas o comportamento nativo necessário para testar abertura e fechamento.
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
    configurable: true,
    value: function (this: HTMLDialogElement) {
      this.setAttribute('open', '');
    },
  });
  Object.defineProperty(HTMLDialogElement.prototype, 'close', {
    configurable: true,
    value: function (this: HTMLDialogElement) {
      this.removeAttribute('open');
    },
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

async function openPersonal() {
  render(<PrivacyRequests />);
  fireEvent.click(screen.getByRole('button', { name: 'Meus dados' }));
  await waitFor(() => expect(screen.queryByText('Carregando pedidos...')).not.toBeInTheDocument());
}

describe('RF08: pedidos pessoais', () => {
  it('permite limpar a etapa escolar sem omitir o campo no pedido', async () => {
    fetchMock
      .mockResolvedValueOnce(json([]))
      .mockResolvedValueOnce(json(request))
      .mockResolvedValueOnce(json([request]));
    await openPersonal();
    fireEvent.change(screen.getByLabelText('Tipo de pedido'), { target: { value: 'correction' } });
    const grade = screen.getByLabelText('Etapa escolar');
    fireEvent.change(grade, { target: { value: '8º ano' } });
    fireEvent.change(grade, { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar pedido' }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith('/privacy/requests', {
        method: 'POST',
        body: JSON.stringify({ kind: 'correction', details: '', corrections: { grade: '' } }),
      }),
    );
  });

  it('não envia pedido de correção sem um campo editado', async () => {
    fetchMock.mockResolvedValue(json([]));
    await openPersonal();
    fireEvent.change(screen.getByLabelText('Tipo de pedido'), { target: { value: 'correction' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar pedido' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Edite ao menos um campo');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('envia correções declaradas e respeita o limite de detalhes', async () => {
    fetchMock
      .mockResolvedValueOnce(json([]))
      .mockResolvedValueOnce(json(request))
      .mockResolvedValueOnce(json([request]));
    await openPersonal();
    expect(screen.getByRole('dialog', { name: 'Meus dados' })).toHaveAttribute('open');
    fireEvent.change(screen.getByLabelText('Tipo de pedido'), { target: { value: 'correction' } });
    const details = screen.getByLabelText('Detalhes (até 1000 caracteres)');
    expect(details).toHaveAttribute('maxlength', '1000');
    fireEvent.change(details, { target: { value: 'Corrigir meu cadastro.' } });
    fireEvent.change(screen.getByLabelText('Nome completo'), {
      target: { value: 'Pessoa de teste' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar pedido' }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith('/privacy/requests', {
        method: 'POST',
        body: JSON.stringify({
          kind: 'correction',
          details: 'Corrigir meu cadastro.',
          corrections: { full_name: 'Pessoa de teste' },
        }),
      }),
    );
    expect(await screen.findByText('Operação registrada.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Fechar meus dados' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it.each(['deletion', 'anonymization'])(
    'explica consequências de %s antes de enviar',
    async (kind) => {
      fetchMock.mockResolvedValue(json([]));
      await openPersonal();
      fireEvent.change(screen.getByLabelText('Tipo de pedido'), { target: { value: kind } });
      expect(
        screen.getByText(/encerra a conta e remove o histórico identificável e as conversas/),
      ).toBeInTheDocument();
      expect(screen.getByText(/Abrir o pedido não executa essa ação/)).toBeInTheDocument();
      expect(
        screen.getByText(/Turmas e materiais docentes permanecem sem vínculo/),
      ).toBeInTheDocument();
      if (kind === 'anonymization')
        expect(screen.getByText(/totais globais não identificáveis/)).toBeInTheDocument();
      expect(fetchMock).toHaveBeenCalledTimes(1);
    },
  );

  it.each([
    'confirmation',
    'sharing',
    'opposition',
    'revocation',
    'portability',
    'automated_review',
  ])('envia %s como atendimento assistido sem correções residuais', async (kind) => {
    fetchMock.mockResolvedValue(json([]));
    await openPersonal();
    fireEvent.change(screen.getByLabelText('Tipo de pedido'), { target: { value: 'correction' } });
    fireEvent.change(screen.getByLabelText('Etapa escolar'), { target: { value: '8º ano' } });
    fireEvent.change(screen.getByLabelText('Tipo de pedido'), { target: { value: kind } });
    expect(screen.getByText(/Atendimento assistido/)).toBeInTheDocument();
    if (kind === 'portability') expect(screen.getByText(/formato e entrega/)).toBeInTheDocument();
    if (kind === 'opposition' || kind === 'revocation')
      expect(screen.getByText(/não altera automaticamente o tratamento/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Enviar pedido' }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith('/privacy/requests', {
        method: 'POST',
        body: JSON.stringify({ kind, details: '' }),
      }),
    );
    await screen.findByText('Operação registrada.');
  });

  it('cancela pedido pendente e recarrega o estado confirmado', async () => {
    fetchMock
      .mockResolvedValueOnce(json([request]))
      .mockResolvedValueOnce(json({ ...request, status: 'cancelled' }))
      .mockResolvedValueOnce(json([{ ...request, status: 'cancelled' }]));
    await openPersonal();
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar pedido' }));
    expect(await screen.findByText('Acesso aos dados · Cancelado')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith('/privacy/requests/request-1/cancel', {
      method: 'POST',
    });
    expect(screen.queryByRole('button', { name: 'Cancelar pedido' })).not.toBeInTheDocument();
  });

  it('baixa JSON apenas para acesso concluído e ainda válido', async () => {
    fetchMock
      .mockResolvedValueOnce(
        json([
          { ...request, status: 'completed' },
          { ...request, id: 'expired', status: 'completed', expires_at: '2000-01-01T00:00:00Z' },
          { ...request, id: 'correction', kind: 'correction', status: 'completed' },
          ...[
            'confirmation',
            'sharing',
            'opposition',
            'revocation',
            'portability',
            'automated_review',
          ].map((kind) => ({ ...request, id: kind, kind, status: 'completed' })),
        ]),
      )
      .mockResolvedValueOnce(json({ profile: {} }));
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: vi.fn(() => 'blob:privacy'),
    });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
    const create = vi.mocked(URL.createObjectURL);
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    await openPersonal();
    const buttons = screen.getAllByRole('button', { name: 'Baixar JSON' });
    expect(buttons).toHaveLength(2);
    expect(buttons[1]).toBeDisabled();
    fireEvent.click(buttons[0]);
    expect(await screen.findByText('Download iniciado.')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith('/privacy/requests/request-1/export');
    expect(create).toHaveBeenCalledOnce();
    expect(click).toHaveBeenCalledOnce();
  });

  it('mantém falha da API visível sem alegar sucesso', async () => {
    fetchMock
      .mockResolvedValueOnce(json([]))
      .mockResolvedValueOnce(json({ detail: 'Pedido já pendente.' }, 409));
    await openPersonal();
    fireEvent.click(screen.getByRole('button', { name: 'Enviar pedido' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Pedido já pendente.');
    expect(screen.queryByText('Operação registrada.')).not.toBeInTheDocument();
  });

  it('informa indisponibilidade no demo sem chamar a API', async () => {
    configuration.enabled = false;
    await openPersonal();
    expect(screen.getByRole('status')).toHaveTextContent('persistência indisponível');
    expect(screen.getByRole('button', { name: 'Enviar pedido' })).toBeDisabled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('RF08: análise administrativa', () => {
  it.each([
    ['deletion', 'EXCLUIR'],
    ['anonymization', 'ANONIMIZAR'],
    ['opposition', 'MEDIDA CONFIRMADA'],
    ['revocation', 'MEDIDA CONFIRMADA'],
  ])('exige confirmação exata para %s', async (kind, word) => {
    // As listas distintas garantem que o teste não permita resolver o próprio pedido.
    fetchMock.mockImplementation(async (path) =>
      json(path === '/privacy/requests' ? [] : [{ ...request, kind }]),
    );
    render(<AdminPrivacyRequests />);
    const form = await screen.findByRole('form', { name: 'Analisar pedido' });
    fireEvent.change(within(form).getByLabelText('Resposta ao titular'), {
      target: { value: 'Pedido analisado.' },
    });
    const button = within(form).getByRole('button', { name: 'Enviar decisão' });
    expect(button).toBeDisabled();
    const confirmation = within(form).getByLabelText(`Digite ${word} para confirmar`);
    fireEvent.change(confirmation, { target: { value: word.toLowerCase() } });
    fireEvent.submit(form);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    fireEvent.change(confirmation, { target: { value: word } });
    expect(button).toBeEnabled();
    fireEvent.click(button);
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith('/admin/privacy-requests/request-1/resolve', {
        method: 'POST',
        body: JSON.stringify({
          decision: 'complete',
          response: 'Pedido analisado.',
          confirmation: word,
        }),
      }),
    );
    await screen.findByText('Operação registrada.');
  });

  it('recusa sem executar a ação destrutiva ou pedir palavra de confirmação', async () => {
    fetchMock.mockImplementation(async (path) =>
      json(path === '/privacy/requests' ? [] : [{ ...request, kind: 'deletion' }]),
    );
    render(<AdminPrivacyRequests />);
    const form = await screen.findByRole('form', { name: 'Analisar pedido' });
    fireEvent.change(within(form).getByLabelText('Decisão'), { target: { value: 'reject' } });
    fireEvent.change(within(form).getByLabelText('Resposta ao titular'), {
      target: { value: 'Não autorizado.' },
    });
    expect(within(form).queryByText(/Digite EXCLUIR/)).not.toBeInTheDocument();
    fireEvent.click(within(form).getByRole('button', { name: 'Enviar decisão' }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith('/admin/privacy-requests/request-1/resolve', {
        method: 'POST',
        body: JSON.stringify({ decision: 'reject', response: 'Não autorizado.' }),
      }),
    );
    await screen.findByText('Operação registrada.');
  });

  it('bloqueia pedido próprio', async () => {
    fetchMock.mockImplementation(async () => json([request]));
    render(<AdminPrivacyRequests />);
    expect(await screen.findByText('Pedido próprio: análise bloqueada.')).toBeInTheDocument();
    expect(screen.queryByRole('form', { name: 'Analisar pedido' })).not.toBeInTheDocument();
  });

  it('não libera análise quando a lista pessoal falha', async () => {
    fetchMock.mockImplementation(async (path) =>
      path === '/privacy/requests' ? json({ detail: 'Acesso negado.' }, 403) : json([request]),
    );
    render(<AdminPrivacyRequests />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Acesso negado.');
    expect(screen.queryByRole('form', { name: 'Analisar pedido' })).not.toBeInTheDocument();
  });
});
