export const ACTIVE_STATUSES = [
  "queued",
  "cloning",
  "executing",
  "checking",
  "reviewing",
  "final_review",
  "creating_pr",
] as const;

export const STATUS_LABELS: Record<string, string> = {
  queued: "В очереди",
  cloning: "Клонирование",
  executing: "Исполнитель",
  checking: "Автопроверки",
  reviewing: "Ревьюер",
  final_review: "Финальное ревью",
  creating_pr: "Создание PR",
  waiting_input: "Нужен твой ответ",
  ready: "Готово",
  failed: "Ошибка",
  cancelled: "Остановлено",
};

export const STAGE_LABELS: Record<string, string> = {
  clone: "Репозиторий",
  execute: "Исполнитель",
  checks: "Автопроверки",
  review: "Сильный ревьюер",
  final: "Kimi · финальный контроль",
  pr: "Ветка и Pull Request",
};

export const VERDICT_LABELS: Record<string, string> = {
  approve: "Принято",
  rework: "На доработку",
  ask_user: "Нужен ответ",
  reject: "Отклонено",
};

export const REVIEW_ISSUES_SCHEMA_DESCRIPTION = `Верни verdict:
- approve — задача решена, проверки и diff это подтверждают;
- rework — есть конкретные исправимые ошибки;
- ask_user — нужен продуктовый ответ пользователя;
- reject — решение опасно или задачу нельзя корректно выполнить.
В issues перечисляй только конкретные проблемы с файлами и способом исправления.`;
