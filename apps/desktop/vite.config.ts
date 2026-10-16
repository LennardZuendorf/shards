import { readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const host = process.env.TAURI_DEV_HOST;

// shards-host requires `x-shards-token` on /api/call and /api/events: a per-launch secret it
// writes (mode 0600) to $SHARDS_HOST_TOKEN_FILE, else ~/.shards/run/host-<port>.token. The proxy
// adds it here so the browser never holds it. Read on every request: a restarted host has a new one.
const hostUrl = process.env.SHARDS_HOST_URL ?? "http://127.0.0.1:7878";
const tokenFile =
  process.env.SHARDS_HOST_TOKEN_FILE ||
  path.join(os.homedir(), ".shards", "run", `host-${new URL(hostUrl).port || "80"}.token`);
function hostToken(): string | null {
  try {
    return readFileSync(tokenFile, "utf8").trim() || null;
  } catch {
    return null;
  }
}

// https://v2.tauri.app/start/frontend/vite/ — with build.target raised for Tailwind v4.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "./src") } },
  clearScreen: false,
  server: {
    port: 5173,
    strictPort: true,
    host: host || false,
    hmr: host ? { protocol: "ws", host, port: 1421 } : undefined,
    watch: { ignored: ["**/src-tauri/**"] },
    // SHARDS_HOST_URL lets several dev servers point at different shards-host instances.
    proxy: {
      "/api": {
        target: hostUrl,
        // SSE: send the upstream status + headers right away (the proxy otherwise holds them
        // until the first event), so EventSource reports "open" immediately.
        // When the host exits, end the downstream stream too: otherwise the browser keeps a dead
        // EventSource "open" forever and live updates stop silently.
        configure: (proxy) => {
          proxy.on("proxyReq", (proxyReq) => {
            const token = hostToken();
            if (token) proxyReq.setHeader("x-shards-token", token);
          });
          proxy.on("proxyRes", (proxyRes, _req, res) => {
            if (!String(proxyRes.headers["content-type"] ?? "").startsWith("text/event-stream")) return;
            res.writeHead(proxyRes.statusCode ?? 200, proxyRes.headers);
            res.flushHeaders();
            const end = () => {
              if (!res.destroyed) res.destroy();
            };
            proxyRes.on("close", end);
            proxyRes.on("aborted", end);
            proxyRes.on("error", end);
          });
          // Upstream reset mid-stream: Vite's own handler only answers 502 before headers are
          // sent, so cut a stream that already started.
          proxy.on("error", (_err, _req, res) => {
            if ("headersSent" in res && res.headersSent && !res.destroyed) res.destroy();
          });
        },
      },
    },
  },
  envPrefix: ["VITE_", "TAURI_ENV_*"],
  build: {
    // Not 'safari13' as the Tauri guide says: Tailwind v4 needs Safari 16.4.
    target: process.env.TAURI_ENV_PLATFORM === "windows" ? "chrome111" : "safari16.4",
    minify: !process.env.TAURI_ENV_DEBUG,
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
  },
});
