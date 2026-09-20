import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import App from "./App";

vi.mock("./lib/supabase", () => ({
  apiUrl: "http://localhost:8000",
  isSupabaseConfigured: false,
  supabase: null,
  turnstileSiteKey: "",
  accessToken: vi.fn(async () => null),
}));

describe("App", () => {
  it("abre a recuperação de senha pela tela de login", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Esqueci minha senha" }));
    expect(screen.getByRole("heading", { name: "Recuperar senha" })).toBeInTheDocument();
  });
});
