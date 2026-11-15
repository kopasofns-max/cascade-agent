import { createRouter, publicQuery } from "./middleware";
import { getModelCatalog } from "./ai/models";
import { detectSandboxBackend } from "./agent/sandbox";
import { getWorkerState } from "./agent/worker";

export const systemRouter = createRouter({
  status: publicQuery.query(async () => {
    const [sandbox, models] = await Promise.all([
      detectSandboxBackend().catch(() => "unknown" as const),
      getModelCatalog().catch((error) => ({
        models: [],
        defaults: { executor: "", reviewer: "", final: "" },
        errors: [error instanceof Error ? error.message : "Модели недоступны"],
      })), 
    ]);
    return {
      worker: getWorkerState(),
      sandbox,
      githubConfigured: Boolean(process.env.GITHUB_TOKEN),
      localRepositories: process.env.ALLOW_LOCAL_REPOS === "true",
      models: models.models,
      defaults: models.defaults,
      modelError: models.errors.join(" · ") || null,
      geminiConfigured: Boolean(process.env.GEMINI_API_KEY),
      kimiConfigured: Boolean(process.env.KIMI_API_KEY || process.env.KIMI_AGENTGW_API_KEY),
    };
  }),
});
