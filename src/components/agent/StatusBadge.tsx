import { STATUS_LABELS, VERDICT_LABELS } from "@contracts/agent";
import { statusTone } from "@/lib/format";

export function StatusBadge({ status, label }: { status: string; label?: string }) {
  const tone = statusTone(status);
  return (
    <span className={`status-badge status-${tone}`}>
      <span className="status-dot" aria-hidden="true" />
      {label || STATUS_LABELS[status] || VERDICT_LABELS[status] || status}
    </span>
  );
}
