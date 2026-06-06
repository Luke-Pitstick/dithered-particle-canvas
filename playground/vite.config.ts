import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@dithered-particle-canvas/react": resolve(__dirname, "../packages/react/src/index.ts")
    }
  }
});
