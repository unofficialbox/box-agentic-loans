import { useEffect, useId, useState } from "react";
import { formatDuration, progress, splitStepTitle, type TurnDetails } from "../activity";
import { StatusIcon, statusLabel, toStatusKind } from "./StatusIcon";

/**
 * The line above each reply. While the agent works it names the step in
 * flight; once done it reads "Worked for 2.4 s". Opening it shows the plan
 * and every step (routing, tool calls, approval holds) with their timings.
 * Collapsed by default: the answer is the content, the work is on request.
 */
export function TurnProgress({ turn, failed }: { turn: TurnDetails; failed: boolean }) {
  const [open, setOpen] = useState(false);
  const detailId = useId();
  const working = turn.endedAt === undefined;
  const now = useClock(working);
  const { kind, label, elapsed } = progress(turn, failed, now);
  const hasDetail = turn.todos.length > 0 || turn.steps.length > 0;

  const summary = (
    <>
      {kind !== "done" && <StatusIcon kind={kind} />}
      <span className="progress-label">{label}</span>
      {elapsed && <span className="progress-elapsed">{elapsed}</span>}
    </>
  );

  return (
    <div className={`progress progress-${kind}`}>
      {hasDetail ? (
        <button
          type="button"
          className="progress-toggle"
          aria-expanded={open}
          aria-controls={detailId}
          onClick={() => setOpen(value => !value)}
        >
          {summary}
          <span className="progress-chevron" aria-hidden="true" />
        </button>
      ) : (
        <p className="progress-toggle progress-static">{summary}</p>
      )}
      {kind === "active" && (
        <span className="visually-hidden" role="status">
          {label}
        </span>
      )}

      {/* Always rendered so it can open and close smoothly; inert while closed. */}
      <div className="progress-panel" data-open={open} inert={!open}>
        <div className="progress-detail" id={detailId}>
          {turn.todos.length > 0 && (
            <ol className="activity-list" aria-label="Plan">
              {turn.todos.map(todo => {
                const status = toStatusKind(todo.status);
                return (
                  <li key={todo.id} className={`activity-item activity-item-${status}`}>
                    <StatusIcon kind={status} />
                    <span className="activity-text activity-action">{todo.content}</span>
                    <span className="visually-hidden">, {statusLabel(status)}</span>
                  </li>
                );
              })}
            </ol>
          )}
          {turn.steps.length > 0 && (
            <ol className="activity-list activity-list-steps" aria-label="Steps">
              {turn.steps.map(step => {
                const status = toStatusKind(step.status ?? "pending");
                const { source, action } = splitStepTitle(step.title);
                const took = formatDuration(step.startedAt, step.finishedAt);
                return (
                  <li key={step.id} className={`activity-item activity-item-${status}`}>
                    <StatusIcon kind={status} />
                    <span className="activity-text">
                      <span className="activity-action">
                        {source && <span className="activity-source">{source} · </span>}
                        {action}
                      </span>
                      {step.description && <span className="activity-detail">{step.description}</span>}
                    </span>
                    {took && <span className="activity-time">{took}</span>}
                    <span className="visually-hidden">, {statusLabel(status)}</span>
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      </div>
    </div>
  );
}

/** Now, re-read every second while `running`, so a long wait shows a counting clock. */
function useClock(running: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!running) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [running]);
  return now;
}
