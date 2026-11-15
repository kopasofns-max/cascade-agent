import { createRouter, publicQuery } from "./middleware";
import { taskRouter } from "./taskRouter";
import { systemRouter } from "./systemRouter";

export const appRouter = createRouter({
  ping: publicQuery.query(() => ({ ok: true, ts: Date.now() })),
  tasks: taskRouter,
  system: systemRouter,
});

export type AppRouter = typeof appRouter;
