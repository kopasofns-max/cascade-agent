import devServer from "@hono/vite-dev-server"
import path from "path"
const __dirname = import.meta.dirname
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"
import { inspectAttr } from 'kimi-plugin-inspect-react'
import { VitePWA } from "vite-plugin-pwa"

const basePath = process.env.VITE_BASE_PATH || "/";
const pagesBuild = process.env.VITE_STATIC_PREVIEW === "true";

// https://vite.dev/config/
export default defineConfig({
  base: basePath,
  plugins: [
    {
      name: "kimi-preview-host",
      config(config) {
        const hosts = config.server?.allowedHosts;
        if (hosts === true || hosts?.includes("3000.proxy.internal")) return;
        return { server: { allowedHosts: ["3000.proxy.internal"] } };
      },
    },
    devServer({ entry: "api/boot.ts", exclude: [/^\/(?!api\/).*$/] }),
    inspectAttr(),
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg", "icon.svg"],
      workbox: {
        globPatterns: ["**/*.js", "**/*.css", "**/*.html", "**/*.webmanifest"],
        maximumFileSizeToCacheInBytes: 3_000_000,
      },
      manifest: {
        name: "Каскад — проверяемый AI-код",
        short_name: "Каскад",
        description: "Gemini выполняет, автопроверки подтверждают, Kimi принимает финальное решение.",
        theme_color: "#0a0f0d",
        background_color: "#0a0f0d",
        display: "standalone",
        start_url: basePath,
        scope: basePath,
        icons: [
          { src: "icon.svg", sizes: "any", type: "image/svg+xml" },
          { src: "icon.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" },
        ],
      },
    }),
  ],
  server: {
    port: 3000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@contracts": path.resolve(__dirname, "./contracts"),
      "@db": path.resolve(__dirname, "./db"),
      "db": path.resolve(__dirname, "./db"),
    },
  },
  envDir: path.resolve(__dirname),
  build: {
    outDir: path.resolve(__dirname, pagesBuild ? "dist/pages" : "dist/public"),
    emptyOutDir: true,
  },
});
