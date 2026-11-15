const URL_KEY = "cascade.apiUrl";
const TOKEN_KEY = "cascade.apiToken";

function readSession(key: string) {
  if (typeof window === "undefined") return "";
  try {
    return window.sessionStorage.getItem(key) || "";
  } catch {
    return "";
  }
}

export function normalizeApiBase(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  const url = new URL(trimmed);
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("API URL должен начинаться с http:// или https://");
  }
  url.hash = "";
  url.search = "";
  return url.toString().replace(/\/api\/trpc\/?$/, "").replace(/\/+$/, "");
}

const STATIC_BUILD = import.meta.env.VITE_STATIC_PREVIEW === "true";
const storedUrl = readSession(URL_KEY);
const configuredUrl = storedUrl || import.meta.env.VITE_API_URL || "";

export const API_BASE_URL = configuredUrl ? normalizeApiBase(configuredUrl) : "";
export const API_TOKEN = readSession(TOKEN_KEY);
export const TRPC_URL = API_BASE_URL ? `${API_BASE_URL}/api/trpc` : "/api/trpc";
export const STATIC_PREVIEW = STATIC_BUILD && !API_BASE_URL;
export const EXTERNAL_API = Boolean(API_BASE_URL);

export function saveApiConnection(url: string, token: string) {
  const normalized = normalizeApiBase(url);
  if (STATIC_BUILD && !normalized) throw new Error("Укажи URL отдельного backend");
  if (normalized) window.sessionStorage.setItem(URL_KEY, normalized);
  else window.sessionStorage.removeItem(URL_KEY);
  if (token.trim()) window.sessionStorage.setItem(TOKEN_KEY, token.trim());
  else window.sessionStorage.removeItem(TOKEN_KEY);
}

export function clearApiConnection() {
  window.sessionStorage.removeItem(URL_KEY);
  window.sessionStorage.removeItem(TOKEN_KEY);
}
