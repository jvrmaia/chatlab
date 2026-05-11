import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

export default defineConfig({
  root: resolve(process.cwd(), "src/ui"),
  base: "/ui/",
  plugins: [react()],
  build: {
    outDir: resolve(process.cwd(), "dist/ui"),
    emptyOutDir: true,
    sourcemap: true,
  },
  server: {
    port: 5173,
    // Separate HMR port so its WebSocket upgrade doesn't match the /ws proxy rule
    // and get forwarded to the chatlab WS server (which would reset the connection).
    hmr: { port: 5174 },
    proxy: {
      "/v1": "http://localhost:4480",
      "/healthz": "http://localhost:4480",
      "/readyz": "http://localhost:4480",
    },
  },
});
