import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DiagnosticAssessment } from "./DiagnosticAssessment";
import { apiFetch } from "../../lib/api";

vi.mock("../../lib/api", () => ({
  apiFetch: vi.fn(),
  apiError: vi.fn(async () => "erro"),
}));

const question = {
  id: "10000000-0000-0000-0000-000000000001",
  subject: "Matemática",
  topic: "Frações",
  difficulty: "basic",
  question: "Qual fração representa a metade?",
  options: ["1/2", "1/3", "2/3", "3/4"],
};

describe("DiagnosticAssessment", () => {
  beforeEach(() => vi.mocked(apiFetch).mockReset());

  it("salva a alternativa sem corrigir a questão no navegador", async () => {
    vi.mocked(apiFetch).mockResolvedValue(new Response(JSON.stringify({ saved: true, answered: 1, total: 1 }), { status: 200 }));
    render(
      <DiagnosticAssessment
        diagnostic={{ status: "open", session_id: "session", answered_question_ids: [], questions: [question] }}
        onComplete={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /1\/2/i }));
    fireEvent.click(screen.getByRole("button", { name: "Confirmar e continuar" }));

    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith(
      `/student/diagnostic/${question.id}/answer`,
      expect.objectContaining({ method: "POST" }),
    ));
    expect(screen.queryByText(/resposta correta/i)).not.toBeInTheDocument();
  });
});
