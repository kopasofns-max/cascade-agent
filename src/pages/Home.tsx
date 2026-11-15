import { useEffect, useState } from "react";
import { ArrowRight, ExternalLink, GitPullRequest, Plus, Server, ShieldCheck, Workflow } from "lucide-react";
import { trpc } from "@/providers/trpc";
import { STATIC_PREVIEW } from "@/lib/runtime";
import { ConnectionDialog } from "@/components/agent/ConnectionDialog";
import { NewTaskDialog } from "@/components/agent/NewTaskDialog";
import { ReviewPanel } from "@/components/agent/ReviewPanel";
import { TaskDetail } from "@/components/agent/TaskDetail";
import { TaskQueue } from "@/components/agent/TaskQueue";
import { Button } from "@/components/ui/button";
import "../App.css";

const pipeline = ["Gemini исполняет", "Автопроверки", "Gemini ревьюит", "Kimi решает", "Pull Request"];

export default function Home() {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [newTaskOpen, setNewTaskOpen] = useState(false);
  const [connectionOpen, setConnectionOpen] = useState(false);
  const tasksQuery = trpc.tasks.list.useQuery(undefined, { enabled: !STATIC_PREVIEW, refetchInterval: 2_500 });
  const systemQuery = trpc.system.status.useQuery(undefined, { enabled: !STATIC_PREVIEW, refetchInterval: 15_000 });
  const tasks = tasksQuery.data || [];

  useEffect(() => {
    if (selectedId !== null && tasks.some((task) => task.id === selectedId)) return;
    setSelectedId(tasks[0]?.id ?? null);
  }, [selectedId, tasks]);

  const detailsQuery = trpc.tasks.byId.useQuery(
    { id: selectedId || 0 },
    { enabled: !STATIC_PREVIEW && selectedId !== null, refetchInterval: 2_500 },
  );

  return (
    <div className="control-room">
      <header className="app-header">
        <div className="brand-block">
          <div className="brand-mark" aria-hidden="true"><Workflow size={21} strokeWidth={1.8} /></div>
          <div>
            <span className="brand-name">CASCADE</span>
            <span className="brand-subtitle">контур проверяемого кода</span>
          </div>
        </div>
        <div className="header-runtime" aria-label="Состояние сервиса">
          {STATIC_PREVIEW ? (
            <button className="runtime-preview" onClick={() => setConnectionOpen(true)}><i /> Static preview · API не подключён</button>
          ) : (
            <>
              <span className={systemQuery.data?.geminiConfigured ? "configured" : "not-configured"}>
                <i /> Gemini {systemQuery.data?.geminiConfigured ? "подключён" : "нужен ключ"}
              </span>
              <span className={systemQuery.data?.kimiConfigured ? "configured" : "not-configured"}>
                <i /> Kimi {systemQuery.data?.kimiConfigured ? "подключён" : "нужен ключ"}
              </span>
            </>
          )}
        </div>
        <button className="icon-action header-connection" onClick={() => setConnectionOpen(true)} aria-label="Настроить backend" title="Настроить backend">
          <Server size={18} />
        </button>
        <Button className="primary-action header-action" onClick={() => setNewTaskOpen(true)}>
          <Plus size={17} /> Новая задача
        </Button>
      </header>

      <div className="pipeline-strip" aria-label="Конвейер задачи">
        {pipeline.map((step, index) => (
          <div className="pipeline-step" key={step}>
            <span>{String(index + 1).padStart(2, "0")}</span>
            <strong>{step}</strong>
            {index < pipeline.length - 1 && <ArrowRight size={14} aria-hidden="true" />}
          </div>
        ))}
        <div className="pipeline-rule"><ShieldCheck size={15} /> merge только вручную</div>
      </div>

      {STATIC_PREVIEW && (
        <section className="static-notice" aria-label="Ограничения статической версии">
          <div>
            <span className="section-label">GitHub Pages · интерфейс</span>
            <p>Модели, база задач, sandbox и Pull Request работают на отдельном backend. Здесь ничего не выполняется и не имитируется.</p>
          </div>
          <Button className="secondary-action" onClick={() => setConnectionOpen(true)}><Server size={16} /> Подключить API</Button>
          <a className="static-repo-link" href="https://github.com/kopasofns-max/cascade-agent" target="_blank" rel="noreferrer">Исходники <ExternalLink size={14} /></a>
        </section>
      )}

      <main className="workspace-grid">
        <TaskQueue
          tasks={tasks}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onNew={() => setNewTaskOpen(true)}
          live={!STATIC_PREVIEW}
        />

        {detailsQuery.data ? (
          <TaskDetail details={detailsQuery.data} />
        ) : (
          <section className="run-panel empty-run-panel">
            {tasksQuery.isLoading || detailsQuery.isLoading ? (
              <div className="empty-state"><span className="loading-line" /> Загружаем контур задач…</div>
            ) : tasksQuery.isError || detailsQuery.isError ? (
              <div className="empty-state error-state">
                <strong>Не удалось получить задачи</strong>
                <p>{tasksQuery.error?.message || detailsQuery.error?.message}</p>
                <Button variant="outline" className="secondary-action" onClick={() => void Promise.all([tasksQuery.refetch(), detailsQuery.refetch()])}>Повторить</Button>
              </div>
            ) : (
              <div className="empty-state">
                <GitPullRequest size={34} strokeWidth={1.4} />
                <span className="section-label">{STATIC_PREVIEW ? "Точка подключения" : "Первый запуск"}</span>
                <h1>{STATIC_PREVIEW ? <>Интерфейс здесь.<br />Вычисления — на backend.</> : <>Поставь задачу.<br />Получи доказательства.</>}</h1>
                <p>{STATIC_PREVIEW ? "Подключи свой сервер, чтобы ставить задачи. Или открой исходники и разверни полный контур локально." : "Исполнитель изменит репозиторий, система прогонит проверки, два независимых ревью решат, достоин ли результат Pull Request."}</p>
                <Button className="primary-action" onClick={() => STATIC_PREVIEW ? setConnectionOpen(true) : setNewTaskOpen(true)}>
                  {STATIC_PREVIEW ? <Server size={17} /> : <Plus size={17} />} {STATIC_PREVIEW ? "Подключить backend" : "Создать задачу"}
                </Button>
              </div>
            )}
          </section>
        )}

        {detailsQuery.data ? (
          <ReviewPanel details={detailsQuery.data} system={systemQuery.data} />
        ) : (
          <aside className="review-panel review-panel-placeholder">
            <span className="section-label">Принцип контура</span>
            <h2>Не верим отчёту модели.</h2>
            <p>Решение опирается на diff, логи тестов и критерии приёмки. У каждого этапа остаётся след.</p>
            <dl>
              <div><dt>Исполнитель</dt><dd>меняет только рабочую ветку</dd></div>
              <div><dt>Проверки</dt><dd>запускаются без API-ключей</dd></div>
              <div><dt>Ревьюеры</dt><dd>видят факты, а не обещания</dd></div>
              <div><dt>Финал</dt><dd>PR или доработка, никакого auto-merge</dd></div>
            </dl>
          </aside>
        )}
      </main>

      <NewTaskDialog
        open={newTaskOpen}
        onOpenChange={setNewTaskOpen}
        onCreated={setSelectedId}
        onConnect={() => { setNewTaskOpen(false); setConnectionOpen(true); }}
      />
      <ConnectionDialog open={connectionOpen} onOpenChange={setConnectionOpen} />
    </div>
  );
}
