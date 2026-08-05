import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

// https://vitejs.dev/config/
export default defineConfig({
  root: path.resolve(__dirname, "."),
  server: {
    host: "::",
    port: 8080,
    fs: {
      allow: [path.resolve(__dirname, "."), path.resolve(__dirname, "../shared")],
      deny: [".env", ".env.*", "*.{crt,pem}", "**/.git/**"],
    },
    // Forward all /api/* requests to the standalone Express backend
    proxy: {
      "/api": {
        target: "http://localhost:3000",
        changeOrigin: true,
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
