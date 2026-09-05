import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// O plugin transforma JSX/TSX e mantém atualização rápida no desenvolvimento.
export default defineConfig({ plugins: [react()] });
