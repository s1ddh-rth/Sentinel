import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// SENTINEL frontend — Vite + React 18
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // Local dev convenience: forward /api to the predict service.
      // In production Traefik handles /api routing at the edge.
      "/api": {
        target: "http://localhost:8000",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api/, ""),
      },
    },
  },
});
