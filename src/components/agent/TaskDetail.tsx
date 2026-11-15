import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  Ban,
  Check,
  ChevronDown,
  ChevronRight,
  Circle,
  Clipboard,
  ExternalLink,
  FileDiff,
  ListChecks,
  LoaderCircle,
  RotateCcw,
  TerminalSquare,
  X,
} from "lucide-react";
import { trpc, type RouterOutputs } from "@/providers/trpc";
import { ACTIVE_STATUSES, STAGE_LABELS } from "@contracts/agent";
import { formatNumber, formatTime, shortRepository } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "./StatusBadge";

function DiffView({ diff }: { diff: string }) {
  if (!diff) return <div className="content-empty">Diff появится после работы исполнителя.</div>;
  return (
    <pre className="diff-view" aria-label="Изменения в репозитории">
      {diff.split("\n").map((line, index) => {
        const tone = line.startsWith("+") && !line.startsWith("+++")
          ? "added"
          : line.startsWith("-") && !line.startsWith("---")
            ? "removed"
            : line.startsWith("@@")
              ? "hunk"
              : "";
        return <div key={`${index}-${line.slice(0, 12)}`} className={tone}>{line || " "}</div>;
      })}
    </pre>
  );
}

export function TaskDetail({ details }: { details: RouterOutputs["tasks"]["byId"] }) {
  const { task, stages } = details;
  const [tab, setTab] = useState<"activity" | "diff" | "checks">("activity");
  const [openStage, setOpenStage] = useState<number | null>(null);
  const [answer, setAnswer] = useState("");
  const [actionError, setActionError] = useState("");
  const [copied, setCopied] = useState(false);
  const utils = trpc.useUtils();

  const invalidate = async () => {
    await Promise.all([
      utils.tasks.list.invalidate(),
      utils.tasks.byId.invalidate({ id: task.id }),
    ]);
  };
  const cancel = trpc.tasks.cancel.useMutation({ onSuccess: invalidate, onError: (error) => setActionError(error.message) });
  const retry = trpc.tasks.retry.useMutation({ onSuccess: invalidate, onError: (error) => setActionError(error.message) });
  const respond = trpc.tasks.respond.useMutation({
    onSuccess: async () => {
      setAnswer("");
      await invalidate();
    },
    onError: (error) => setActionError(error.message),
  });

  useEffect(() => {
    setTab("activity");
    setOpenStage(null);
    setActionError("");
  }, [task.id]);

  const latestDiff = useMemo(() => [...stages].reverse().find((stage) => stage.diff)?.diff || "", [stages]);
  const latestChecks = useMemo(() => [...stages].reverse().find((stage) => stage.kind === "checks"), [stages]);
  const isActive = ACTIVE_STATUSES.includes(task.status as (typeof ACTIVE_STATUSES)[number]);

  const submitAnswer = (event: FormEvent) => {
    event.preventDefault();
    setActionError("");
    respond.mutate({ id: task.id, answer });
  };

  const copyLogs = async () => {
    if (!latestChecks?.logs) return;
    await navigator.clipboard.writeText(latestChecks.logs);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1_500);
  };

  return (
    <section className="run-panel" aria-label={`Задача ${task.title}`}>
      <div className="run-header">
        <div className="run-kicker">
          <span>RUN #{task.id.toString().padStart(4, "0")}</span>
          <span>{shortRepository(task.repoUrl)}</span>
        </div>
        <div className="run-title-row">
          <div>
            <h1>{task.title}</h1>
            <p>{task.taskType === "code" ? "Изменение кода" : "Аналитическая задача"} · создана {formatTime(task.createdAt)}</p>
          </div>
          <StatusBadge status={task.status} />
        </div>
        <div className="run-metrics">
          <div><span>Проход</span><strong>{Math.max(task.attempt, 1)} / {task.maxAttempts}</strong></div>
          <div><span>Токены</span><strong>{formatNumber(task.totalTokens)}</strong></div>
          <div><span>Ветка</span><strong>{task.branchName || "ещё не создана"}</strong></div>
        </div>
        <div className="run-actions">
          {task.prUrl && (
            <a className="primary-action button-link" href={task.prUrl} target="_blank" rel="noreferrer">
              Открыть PR <ExternalLink size={16} />
            </a>
          )}
          {isActive && (
            <Button
              variant="outline"
              className="secondary-action"
              disabled={cancel.isPending}
              onClick={() => {
                if (window.confirm("Остановить задачу? Текущая стадия завершится, новые запускаться не будут.")) {
                  setActionError("");
                  cancel.mutate({ id: task.id });
                }
              }}
            >
              <Ban size={16} /> Остановить
            </Button>
          )}
          {["failed", "cancelled"].includes(task.status) && (
            <Button
              className="primary-action"
              disabled={retry.isPending}
              onClick={() => {
                setActionError("");
                retry.mutate({ id: task.id });
              }}
            >
              <RotateCcw size={16} /> Запустить заново
            </Button>
          )}
        </div>
      </div>

      {task.error && (
        <div className="run-error" role="alert">
          <span>Задача остановилась</span>
          <pre>{task.error}</pre>
        </div>
      )}
      {actionError && <div className="run-error" role="alert">{actionError}</div>}

      {task.status === "waiting_input" && (
        <form className="answer-form" onSubmit={submitAnswer}>
          <div>
            <span className="section-label">Нужно уточнение</span>
            <p>{task.summary || "Финальный контролёр запросил ответ пользователя."}</p>
          </div>
          <textarea
            value={answer}
            onChange={(event) => setAnswer(event.target.value)}
            placeholder="Ответь по сути вопроса…"
            required
            minLength={2}
            rows={3}
          />
          <Button className="primary-action" disabled={respond.isPending}>Отправить и перезапустить</Button>
        </form>
      )}

      <div className="run-tabs" role="tablist" aria-label="Результаты задачи">
        <button role="tab" aria-selected={tab === "activity"} className={tab === "activity" ? "active" : ""} onClick={() => setTab("activity")}>
          <ListChecks size={16} /> Ход выполнения <span>{stages.length}</span>
        </button>
        <button role="tab" aria-selected={tab === "diff"} className={tab === "diff" ? "active" : ""} onClick={() => setTab("diff")}>
          <FileDiff size={16} /> Diff
        </button>
        <button role="tab" aria-selected={tab === "checks"} className={tab === "checks" ? "active" : ""} onClick={() => setTab("checks")}>
          <TerminalSquare size={16} /> Проверки
        </button>
      </div>

      <div className="run-content">
        {tab === "activity" && (
          <div className="stage-list">
            {!stages.length && (
              <div className="content-empty">
                <LoaderCircle className="spin" size={20} />
                Воркер скоро возьмёт задачу в работу.
              </div>
            )}
            {stages.map((stage) => {
              const expanded = openStage === stage.id;
              return (
                <article key={stage.id} className={`stage-row stage-${stage.status}`}>
                  <button
                    className="stage-summary"
                    onClick={() => setOpenStage(expanded ? null : stage.id)}
                    aria-expanded={expanded}
                  >
                    <span className="stage-icon">
                      {stage.status === "running" ? <LoaderCircle className="spin" size={16} /> : stage.status === "passed" ? <Check size={16} /> : <X size={16} />}
                    </span>
                    <span className="stage-title">
                      <strong>{STAGE_LABELS[stage.kind] || stage.kind}</strong>
                      <span>Проход {stage.attempt} · {formatTime(stage.createdAt)}</span>
                    </span>
                    <span className="stage-state">{stage.status === "running" ? "В работе" : stage.status === "passed" ? "Пройдено" : "Есть проблема"}</span>
                    {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  </button>
                  {expanded && (
                    <div className="stage-details">
                      {stage.summary && <p>{stage.summary}</p>}
                      {stage.logs ? <pre>{stage.logs}</pre> : !stage.summary && <p>Дополнительных логов нет.</p>}
                      {stage.tokens > 0 && <span className="token-note">{formatNumber(stage.tokens)} токенов</span>}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
        {tab === "diff" && <DiffView diff={latestDiff} />}
        {tab === "checks" && (
          <div className="checks-view">
            <div className="checks-toolbar">
              <span>{latestChecks?.summary || "Команды ещё не запускались"}</span>
              {latestChecks?.logs && (
                <button className="text-action" onClick={copyLogs}>
                  {copied ? <Check size={15} /> : <Clipboard size={15} />}
                  {copied ? "Скопировано" : "Копировать"}
                </button>
              )}
            </div>
            {latestChecks?.logs ? <pre>{latestChecks.logs}</pre> : (
              <div className="content-empty"><Circle size={18} /> Логи появятся после первой автопроверки.</div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
