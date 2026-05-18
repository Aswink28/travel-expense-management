import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// VITE_BASE controls the public subpath the build is served from in nginx
// (e.g. "/mw-travel/"). Must start AND end with a slash.
const base = process.env.VITE_BASE || "/moi-corp";

export default defineConfig({
  base,
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
    allowedHosts: ["demo.moiterworkz.com"],
    // Dev proxy — frontend code calls /api/* which Vite forwards to the backend.
    // Override the target with VITE_DEV_PROXY_TARGET if the backend is on another host.
    proxy: {
      "/api": {
        target: process.env.VITE_DEV_PROXY_TARGET || "http://localhost:5015",
        changeOrigin: true,
      },
      "/uploads": {
        target: process.env.VITE_DEV_PROXY_TARGET || "http://localhost:5015",
        changeOrigin: true,
      },
    },
  },
});
