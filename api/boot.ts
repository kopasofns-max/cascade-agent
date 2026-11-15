import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { cors } from "hono/cors";
import type { HttpBindings } from "@hono/node-server";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter } from "./router";
import { createContext } from "./context";
import { env } from "./lib/env";
import { log } from "./lib/logger";
import { handleClientLog } from "./lib/clientlog";
import { REQUEST_ID_HEADER, runWithRequestId } from "./lib/requestcontext";
import { startWorker } from "./agent/worker";

const app = new Hono<{ Bindings: HttpBindings }>();
startWorker();

app.use("*", async (c, next) => {
  const requestId = crypto.randomUUID();
  if (c.req.path === "/api/log") {
    await next();
    return;
  }
  const start = Date.now();
  await runWithRequestId(requestId, async () => {
    await next();
    c.res.headers.set(REQUEST_ID_HEADER, requestId);
    if (!c.req.path.startsWith("/api/")) return;
    log.info("request", {
      method: c.req.method,
      path: c.req.path,
      status: c.res.status,
      durationMs: Date.now() - start,
    });
  });
});

// Cross-origin access is opt-in. Pages never receives provider credentials; when
// it uses a separate API, the browser sends only CASCADE_API_TOKEN.
const allowedOrigins = (process.env.CORS_ORIGINS || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
app.use("/api/*", async (c, next) => {
  const origin = c.req.header("Origin");
  if (!origin) return next();
  const sameOrigin = new URL(c.req.url).origin === origin;
  const allowed = allowedOrigins.includes("*") || allowedOrigins.includes(origin);
  if (!sameOrigin && !allowed) return c.json({ error: "Origin не разрешён" }, 403);
  await next();
});
app.use("/api/*", cors({
  origin: (origin) => {
    if (!origin || !allowedOrigins.length) return undefined;
    return allowedOrigins.includes("*") || allowedOrigins.includes(origin) ? origin : undefined;
  },
  allowMethods: ["GET", "POST", "OPTIONS"],
  allowHeaders: ["Content-Type", "Authorization"],
  exposeHeaders: [REQUEST_ID_HEADER],
  maxAge: 600,
}));
app.use("/api/trpc/*", async (c, next) => {
  const expected = process.env.CASCADE_API_TOKEN;
  if (expected && c.req.header("Authorization") !== `Bearer ${expected}`) {
    return c.json({ error: "Нужен действительный CASCADE_API_TOKEN" }, 401);
  }
  await next();
});

app.use("/api/trpc/*", bodyLimit({ maxSize: 50 * 1024 * 1024 }));
app.use("/api/trpc/*", async (c) => {
  return fetchRequestHandler({
    endpoint: "/api/trpc",
    req: c.req.raw,
    router: appRouter,
    createContext,
  });
});
app.post(
  "/api/log",
  bodyLimit({ maxSize: 64 * 1024, onError: (c) => c.body(null, 413) }),
  handleClientLog,
);
app.all("/api/*", (c) => c.json({ error: "Not Found" }, 404));

app.onError((err, c) => {
  log.error("unhandled request error", {
    method: c.req.method,
    path: c.req.path,
    error: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack : undefined,
  });
  return c.json({ error: "Internal Server Error" }, 500);
});

export default app;

if (env.isProduction) {
  const { serve } = await import("@hono/node-server");
  const { serveStaticFiles } = await import("./lib/vite");
  serveStaticFiles(app);

  const port = parseInt(process.env.PORT || "3000");
  serve({ fetch: app.fetch, port }, () => {
    log.info(`Server running on http://localhost:${port}/`);
  });
}
