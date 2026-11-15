import { useMemo, useState } from "react";
import { Inbox, Plus } from "lucide-react";
import type { RouterOutputs } from "@/providers/trpc";
import { ACTIVE_STATUSES } from "@contracts/agent";
import { formatTime, shortRepository } from "@/lib/format";
import { StatusBadge } from "./StatusBadge";

const filters = [
  { id: "all", label: "Все" },
  { id: "active", label: "Активные" },
  { id: "done", label: "Готовые" },
] as const;

export function TaskQueue({
  tasks,
  selectedId,
  onSelect,
  onNew,
  live = true,
}: {
  tasks: RouterOutputs["tasks"]["list"];
  selectedId: number | null;
  onSelect: (id: number) => void;
  onNew: () => void;
  live?: boolean;
}) {
  const [filter, setFilter] = useState<(typeof filters)[number]["id"]>("all");
  const filtered = useMemo(() => tasks.filter((task) => {
    if (filter === "active") return ACTIVE_STATUSES.includes(task.status as (typeof ACTIVE_STATUSES)[number]);
    if (filter === "done") return task.status === "ready";
    return true;
  }), [filter, tasks]);

  return (
    <aside className="queue-panel" aria-label="Очередь задач">
      <div className="panel-heading">
        <div>
          <span className="section-label">Очередь</span>
          <strong>{tasks.length.toString().padStart(2, "0")}</strong>
        </div>
        <button className="icon-action" onClick={onNew} aria-label="Создать задачу" title="Создать задачу">
          <Plus size={18} />
        </button>
      </div>
      <div className="queue-filters" role="tablist" aria-label="Фильтр задач">
        {filters.map((item) => (
          <button
            key={item.id}
            role="tab"
            aria-selected={filter === item.id}
            className={filter === item.id ? "active" : ""}
            onClick={() => setFilter(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div className="task-list">
        {filtered.map((task) => (
          <button
            key={task.id}
            className={`task-list-item ${selectedId === task.id ? "selected" : ""}`}
            onClick={() => onSelect(task.id)}
          >
            <span className="task-list-meta">
              <span>#{task.id.toString().padStart(4, "0")}</span>
              <span>{formatTime(task.createdAt)}</span>
            </span>
            <strong>{task.title}</strong>
            <span className="task-repository">{shortRepository(task.repoUrl)}</span>
            <StatusBadge status={task.status} />
          </button>
        ))}
        {!filtered.length && (
          <div className="queue-empty">
            <Inbox size={22} />
            <p>{tasks.length ? "Под этот фильтр задач нет." : "Очередь пуста. Поставь первую задачу каскаду."}</p>
            {!tasks.length && <button onClick={onNew}>Создать задачу</button>}
          </div>
        )}
      </div>
      <div className="queue-footer">
        <span className={live ? "live-dot" : "live-dot paused"} aria-hidden="true" />
        {live ? "Обновление каждые 2,5 секунды" : "Локальный preview · polling выключен"}
      </div>
    </aside>
  );
}
