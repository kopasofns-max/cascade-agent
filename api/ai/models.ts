import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { createKimiGateway, listModels } from "./ai-client";

export type ModelProvider = "gateway" | "gemini" | "kimi";
export type ModelRole = "executor" | "reviewer" | "final";

export type CatalogModel = {
  id: string;
  label: string;
  provider: ModelProvider;
};

type CatalogResult = {
  models: CatalogModel[];
  defaults: Record<ModelRole, string>;
  errors: string[];
};

function kimiConfig() {
  return {
    baseURL: (process.env.KIMI_BASE_URL || "https://api.moonshot.ai/v1").replace(/\/+$/, ""),
    apiKey: process.env.KIMI_API_KEY,
  };
}

export function resolveModel(reference?: string | null, fallback = "gateway:auto") {
  const value = reference || fallback;
  const separator = value.indexOf(":");
  const provider = (separator > 0 ? value.slice(0, separator) : "gateway") as ModelProvider;
  const modelId = separator > 0 ? value.slice(separator + 1) : value;

  if (!modelId || modelId === "auto") {
    throw new Error("Модель не выбрана. Проверь каталог и серверные настройки ролей.");
  }

  if (provider === "gateway") {
    return createKimiGateway()(modelId);
  }

  if (provider === "gemini") {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY не настроен на сервере");
    return createGoogleGenerativeAI({ apiKey })(modelId);
  }

  if (provider === "kimi") {
    const config = kimiConfig();
    if (!config.apiKey) throw new Error("KIMI_API_KEY не настроен на сервере");
    return createOpenAICompatible({
      name: "kimi-api",
      baseURL: config.baseURL,
      apiKey: config.apiKey,
      includeUsage: true,
      supportsStructuredOutputs: true,
    })(modelId);
  }

  throw new Error(`Неизвестный провайдер модели: ${provider}`);
}

async function geminiModels(): Promise<CatalogModel[]> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return [];
  const baseURL = (process.env.GEMINI_BASE_URL || "https://generativelanguage.googleapis.com/v1beta").replace(/\/+$/, "");
  const response = await fetch(`${baseURL}/models`, {
    headers: { "x-goog-api-key": apiKey },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 500);
    throw new Error(`Gemini API: HTTP ${response.status}. ${detail}`);
  }
  const body = await response.json() as {
    models?: Array<{
      name?: string;
      displayName?: string;
      supportedGenerationMethods?: string[];
    }>;
  };
  return (body.models || []).flatMap((model) => {
    const id = model.name?.replace(/^models\//, "");
    if (!id || !model.supportedGenerationMethods?.includes("generateContent")) return [];
    if (/(tts|image|embedding|live|robotics|aqa)/i.test(id)) return [];
    return [{
      id: `gemini:${id}`,
      label: `Gemini · ${model.displayName || id}`,
      provider: "gemini" as const,
    }];
  });
}

async function externalKimiModels(): Promise<CatalogModel[]> {
  const config = kimiConfig();
  if (!config.apiKey) return [];
  const response = await fetch(`${config.baseURL}/models`, {
    headers: { Authorization: `Bearer ${config.apiKey}` },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`Kimi API: HTTP ${response.status}`);
  const body = await response.json() as { data?: Array<{ id?: string }> };
  return (body.data || []).flatMap((model) => model.id ? [{
    id: `kimi:${model.id}`,
    label: `Kimi API · ${model.id}`,
    provider: "kimi" as const,
  }] : []);
}

function envReference(role: ModelRole) {
  const key = `${role.toUpperCase()}_MODEL`;
  return process.env[key] || "";
}

function pickGemini(models: CatalogModel[], role: "executor" | "reviewer") {
  const candidates = models.filter((model) => model.provider === "gemini");
  if (!candidates.length) return "";
  const patterns = role === "executor"
    ? [/flash.?lite/i, /gemma/i, /flash/i]
    : [/hydrogen|3\.8|pro|argon/i, /flash(?!.?lite)/i, /gemini/i];
  for (const pattern of patterns) {
    const match = candidates.find((model) => pattern.test(model.id));
    if (match) return match.id;
  }
  return candidates[0].id;
}

export async function getModelCatalog(): Promise<CatalogResult> {
  const [gatewayResult, geminiResult, kimiResult] = await Promise.allSettled([
    listModels(),
    geminiModels(),
    externalKimiModels(),
  ]);

  const errors: string[] = [];
  const gatewayModels = gatewayResult.status === "fulfilled" ? gatewayResult.value : undefined;
  if (gatewayResult.status === "rejected" && (process.env.KIMI_AGENTGW_API_KEY || process.env.KIMI_AGENTGW_BASE_URL)) {
    errors.push(gatewayResult.reason instanceof Error ? gatewayResult.reason.message : "Kimi gateway недоступен");
  }
  const gemini = geminiResult.status === "fulfilled" ? geminiResult.value : [];
  if (geminiResult.status === "rejected") {
    errors.push(geminiResult.reason instanceof Error ? geminiResult.reason.message : "Gemini API недоступен");
  }
  const externalKimi = kimiResult.status === "fulfilled" ? kimiResult.value : [];
  if (kimiResult.status === "rejected") {
    errors.push(kimiResult.reason instanceof Error ? kimiResult.reason.message : "Kimi API недоступен");
  }

  const gateway = (gatewayModels?.models || []).map((model) => ({
    id: `gateway:${model.id}`,
    label: `Kimi · ${model.displayName || model.id}`,
    provider: "gateway" as const,
  }));
  const models = [...gemini, ...gateway, ...externalKimi];
  const gatewayDefault = gatewayModels?.defaultModelId ? `gateway:${gatewayModels.defaultModelId}` : "";
  const kimiDefault = gatewayDefault || externalKimi[0]?.id || "";
  const fallback = gemini[0]?.id || kimiDefault;

  return {
    models,
    defaults: {
      executor: envReference("executor") || pickGemini(models, "executor") || fallback,
      reviewer: envReference("reviewer") || pickGemini(models, "reviewer") || fallback,
      final: envReference("final") || kimiDefault,
    },
    errors,
  };
}

export async function withDefaultModel(reference: string | null | undefined, role: ModelRole) {
  if (reference && reference !== "gateway:auto") return reference;
  const catalog = await getModelCatalog();
  const selected = catalog.defaults[role];
  if (!selected) {
    const requirement = role === "final" ? "Kimi API или встроенный Kimi gateway" : "GEMINI_API_KEY";
    throw new Error(`Для роли ${role} не выбрана модель. Настрой ${requirement}.`);
  }
  return selected;
}
