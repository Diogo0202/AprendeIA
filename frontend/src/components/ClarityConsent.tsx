import { useEffect, useState } from "react";
import {
  isClarityConfigured,
  loadClarity,
  readAnalyticsConsent,
  saveAnalyticsConsent,
} from "../lib/clarity";

/**
 * A caixa só existe quando alguém habilita o Clarity conscientemente. O padrão
 * do projeto continua sem rastreamento, adequado para um aplicativo estudantil.
 */
export function ClarityConsent() {
  const [isOpen, setIsOpen] = useState(
    isClarityConfigured && readAnalyticsConsent() === null,
  );

  useEffect(() => {
    if (readAnalyticsConsent() === "granted") loadClarity();
  }, []);

  if (!isOpen) return null;

  const choose = (consent: "granted" | "denied") => {
    saveAnalyticsConsent(consent);
    setIsOpen(false);
  };

  return (
    <aside className="analytics-consent" role="dialog" aria-label="Preferências de privacidade">
      <div>
        <strong>Podemos usar dados anônimos de navegação?</strong>
        <p>
          Eles ajudam a encontrar problemas na experiência. Conteúdos, respostas
          e dados do perfil não são gravados.
        </p>
      </div>
      <div className="analytics-consent-actions">
        <button type="button" className="secondary-button" onClick={() => choose("denied")}>
          Agora não
        </button>
        <button type="button" className="primary-button" onClick={() => choose("granted")}>
          Aceitar
        </button>
      </div>
    </aside>
  );
}
