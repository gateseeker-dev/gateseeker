import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";
import { defineConfig } from "vite";

/** The gateseeker package version this page is built with (the update notice compares it with the service's). */
const corePackage = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { version: string };

export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: { __GATESEEKER_VERSION__: JSON.stringify(corePackage.version) },
  build: { outDir: "dist", emptyOutDir: true, sourcemap: false },
  server: {
    // Development only: proxy the API to the local server (`node dist/web/local-server.js`).
    proxy: { "/api": "http://127.0.0.1:4320" },
  },
});
