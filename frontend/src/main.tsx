import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";
import { ClarityConsent } from "./components/ClarityConsent";

// StrictMode ajuda a detectar efeitos sem limpeza durante o desenvolvimento.
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
    <ClarityConsent />
  </StrictMode>,
);
