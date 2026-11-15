export function shortRepository(url: string) {
  if (url.startsWith("file://")) return `local/${url.split("/").filter(Boolean).pop() || "repo"}`;
  return url.replace(/^https:\/\/github\.com\//, "").replace(/\.git\/?$/, "");
}

export function formatTime(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function formatNumber(value: number) {
  return new Intl.NumberFormat("ru-RU").format(value);
}

export function statusTone(status: string) {
  if (status === "ready" || status === "approve" || status === "passed") return "positive";
  if (status === "failed" || status === "reject") return "critical";
  if (["waiting_input", "rework", "ask_user", "cancelled"].includes(status)) return "warning";
  if (["queued"].includes(status)) return "neutral";
  return "active";
}
