import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import fs from "node:fs";

function getBackendTarget(): string {
  const envPort = process.env.BACKEND_PORT || process.env.PORT;
  if (envPort) return `http://localhost:${envPort}`;
  try {
    const portFile = path.resolve(__dirname, "../.backend-port");
    if (fs.existsSync(portFile)) {
      const p = fs.readFileSync(portFile, "utf-8").trim();
      if (p && !isNaN(Number(p))) {
        return `http://localhost:${p}`;
      }
    }
  } catch {}
  try {
    const backendEnv = path.resolve(__dirname, "../backend/.env");
    if (fs.existsSync(backendEnv)) {
      const content = fs.readFileSync(backendEnv, "utf-8");
      const match = content.match(/^PORT\s*=\s*(\d+)/m);
      if (match && match[1]) {
        return `http://localhost:${match[1]}`;
      }
    }
  } catch {}
  return "http://localhost:3000";
}

// https://vitejs.dev/config/
export default defineConfig({
  root: path.resolve(__dirname, "."),
  server: {
    host: "::",
    port: 8080,
    strictPort: false, // Automatically fallback to 8081, 8082, etc. if 8080 is already used
    fs: {
      allow: [path.resolve(__dirname, "."), path.resolve(__dirname, "../shared")],
      deny: [".env", ".env.*", "*.{crt,pem}", "**/.git/**"],
    },
    // Forward all /api/* requests to the standalone Express backend (dynamically targets whichever port backend bound to)
    proxy: {
      "/api": {
        target: getBackendTarget(),
        changeOrigin: true,
        router: () => getBackendTarget(),
      },
    },
  },
  build: {
    outDir: path.resolve(__dirname, "../dist/spa"),
    emptyOutDir: true,
  },
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@shared": path.resolve(__dirname, "../shared"),
    },
  },
});
