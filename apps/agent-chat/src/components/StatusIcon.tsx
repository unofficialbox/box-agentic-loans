/**
 * The one status glyph family for the page: plan items and trace steps use the
 * same 16px circle, so a state always looks the same wherever it appears.
 *
 *   pending   hollow ring
 *   active    ring with a turning arc (still under prefers-reduced-motion)
 *   done      filled green, white check
 *   warning   filled amber, white bar
 *   failed    filled red, white cross
 *   skipped   dashed ring
 */
export type StatusKind = "pending" | "active" | "done" | "warning" | "failed" | "skipped";

const LABELS: Record<StatusKind, string> = {
  pending: "Not started",
  active: "In progress",
  done: "Done",
  warning: "Done with a warning",
  failed: "Failed",
  skipped: "Skipped",
};

export function statusLabel(kind: StatusKind): string {
  return LABELS[kind];
}

/** Maps the transport's todo and run-step statuses onto the glyph family. */
export function toStatusKind(status: string): StatusKind {
  switch (status) {
    case "in_progress":
    case "running":
      return "active";
    case "completed":
    case "succeeded":
      return "done";
    case "warning":
      return "warning";
    case "failed":
      return "failed";
    case "skipped":
      return "skipped";
    default:
      return "pending";
  }
}

export function StatusIcon({ kind }: { kind: StatusKind }) {
  return (
    <svg className={`status-icon status-icon-${kind}`} viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
      {kind === "pending" && <circle cx="8" cy="8" r="6.25" className="status-ring" />}
      {kind === "skipped" && <circle cx="8" cy="8" r="6.25" className="status-ring status-ring-dashed" />}
      {kind === "active" && (
        <>
          <circle cx="8" cy="8" r="6.25" className="status-ring" />
          <path d="M8 1.75a6.25 6.25 0 0 1 6.25 6.25" className="status-arc" />
        </>
      )}
      {(kind === "done" || kind === "warning" || kind === "failed") && <circle cx="8" cy="8" r="7" className="status-fill" />}
      {kind === "done" && <path d="M5 8.25l2 2 4-4.5" className="status-mark" />}
      {kind === "warning" && <path d="M8 4.75v3.75M8 11h.01" className="status-mark" />}
      {kind === "failed" && <path d="M5.75 5.75l4.5 4.5M10.25 5.75l-4.5 4.5" className="status-mark" />}
    </svg>
  );
}
