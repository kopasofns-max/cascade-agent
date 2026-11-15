import { CheckCircle2, ExternalLink, GitBranch, ShieldCheck } from "lucide-react";
import type { RouterOutputs } from "@/providers/trpc";
import { formatTime } from "@/lib/format";
import { StatusBadge } from "./StatusBadge";

export function ReviewPanel({
  details,
  system,
}: {
  details: RouterOutputs["tasks"]["byId"];
  system?: RouterOutputs["system"]["status"];
}) {
  const { task, reviews } = details;
  const orderedReviews = [...reviews].reverse();

  return (
    <aside className="review-panel" aria-label="Ревью и параметры задачи">
      <section className="review-section task-brief">
        <div className="section-heading-row">
          <span className="section-label">Приёмка</span>
          <span>#{task.id}</span>
        </div>
        <p>{task.acceptanceCriteria}</p>
        <details>
          <summary>Исходная постановка <ChevronMarker /></summary>
          <p>{task.prompt}</p>
        </details>
        {task.repoUrl.startsWith("file://") ? (
          <div className="repo-link static"><GitBranch size={15} /> {task.baseBranch} → {task.branchName || "новая ветка"}</div>
        ) : (
          <a href={task.repoUrl} target="_blank" rel="noreferrer" className="repo-link">
            <GitBranch size={15} /> {task.baseBranch} → {task.branchName || "новая ветка"} <ExternalLink size={13} />
          </a>
        )}
      </section>

      <section className="review-section">
        <div className="section-heading-row">
          <span className="section-label">Вердикты моделей</span>
          <span>{reviews.length}</span>
        </div>
        <div className="verdict-list">
          {orderedReviews.map((review) => (
            <article key={review.id} className="verdict-item">
              <div className="verdict-heading">
                <div>
                  <strong>{review.role === "final" ? "Kimi · финал" : "Ревьюер"}</strong>
                  <span>Проход {review.attempt} · {formatTime(review.createdAt)}</span>
                </div>
                <StatusBadge status={review.verdict} />
              </div>
              <p>{review.summary}</p>
              {!!review.issues.length && (
                <ul>
                  {review.issues.map((issue, index) => <li key={`${review.id}-${index}`}>{issue}</li>)}
                </ul>
              )}
              <div className="confidence-row">
                <span>Уверенность</span>
                <div aria-label={`Уверенность ${review.confidence}%`}><i style={{ width: `${review.confidence}%` }} /></div>
                <strong>{review.confidence}%</strong>
              </div>
            </article>
          ))}
          {!orderedReviews.length && (
            <div className="review-empty">
              <ShieldCheck size={22} />
              <p>После автопроверок здесь появятся независимые вердикты.</p>
            </div>
          )}
        </div>
      </section>

      <section className="review-section runtime-section">
        <div className="section-heading-row">
          <span className="section-label">Контур выполнения</span>
          <span className={system?.worker.running ? "runtime-online" : ""}>{system?.worker.running ? "ONLINE" : "—"}</span>
        </div>
        <dl>
          <div><dt>Песочница</dt><dd>{system?.sandbox || "определяется"}</dd></div>
          <div><dt>GitHub PR</dt><dd>{system?.githubConfigured ? "token настроен" : "нужен token"}</dd></div>
          <div><dt>Merge</dt><dd>только вручную</dd></div>
        </dl>
        {system && !system.githubConfigured && (
          <p className="runtime-warning">Без GITHUB_TOKEN сервис выполнит задачу, но не сможет отправить ветку и создать PR на GitHub.</p>
        )}
        {task.status === "ready" && (
          <div className="ready-note"><CheckCircle2 size={16} /> Работа завершена. Проверь PR перед merge.</div>
        )}
      </section>
    </aside>
  );
}

function ChevronMarker() {
  return <span aria-hidden="true">+</span>;
}
