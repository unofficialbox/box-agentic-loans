import { useState } from "react";
import type { RunStep } from "@unofficialbox/box-open-elements";
import { formatDuration, splitStepTitle, summarize } from "../activity";
import type { Todo } from "../transport";
import { StatusIcon, statusLabel, toStatusKind } from "./StatusIcon";

const STEPS_OPEN_KEY = "loan-copilot.steps-open";

function readStepsOpen(): boolean {
  try {
    return localStorage.getItem(STEPS_OPEN_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * The turn at a glance: one card, one status language. The plan (what the
 * agent is doing) is always visible; the steps (how: routing, tool calls,
 * approval holds) are collapsed by default, with the step in flight shown
 * even when collapsed. Every state uses the same StatusIcon.
 */
export function TurnActivity({
  todos,
  steps,
  awaitingApproval,
  isDemo,
}: {
  todos: Todo[];
  steps: RunStep[];
  awaitingApproval: boolean;
  isDemo: boolean;
}) {
  const [stepsOpen, setStepsOpen] = useState(readStepsOpen);
  const summary = summarize(steps, todos, awaitingApproval);
  const running = steps.filter(step => toStatusKind(step.status ?? "pending") === "active");
  const shownSteps = stepsOpen ? steps : running;

  const toggleSteps = () =>
    setStepsOpen(open => {
      try {
        localStorage.setItem(STEPS_OPEN_KEY, open ? "0" : "1");
      } catch {
        // Not remembered; the toggle still works.
      }
      return !open;
    });

  return (
    <section className="card activity" aria-labelledby="activity-title">
      <header className="activity-head">
        <h2 className="card-title" id="activity-title">
          This turn
        </h2>
        {summary.kind !== "idle" && (
          <span className={`activity-summary activity-summary-${summary.kind}`} role="status">
            {summary.label}
          </span>
        )}
      </header>

      {summary.kind === "idle" ? (
        <p className="empty">
          {isDemo
            ? "Routing is simulated in demo mode."
            : "Each reply shows its plan, how TypeSafe routed it, which tools ran, and what waits for your approval."}
        </p>
      ) : (
        <>
          {todos.length > 0 && (
            <ol className="activity-list" aria-label="Plan">
              {todos.map(todo => {
                const kind = toStatusKind(todo.status);
                return (
                  <li key={todo.id} className={`activity-item activity-item-${kind}`}>
                    <StatusIcon kind={kind} />
                    <span className="activity-text">{todo.content}</span>
                    <span className="visually-hidden">, {statusLabel(kind)}</span>
                  </li>
                );
              })}
            </ol>
          )}

          {steps.length > 0 && (
            <div className="activity-steps">
              <button type="button" className="activity-toggle" aria-expanded={stepsOpen} onClick={toggleSteps}>
                <span className="activity-chevron" aria-hidden="true" />
                {stepsOpen ? "Hide steps" : `Show ${steps.length} step${steps.length === 1 ? "" : "s"}`}
              </button>
              {shownSteps.length > 0 && (
                <ol className="activity-list activity-list-steps" aria-label="Steps">
                  {shownSteps.map(step => {
                    const kind = toStatusKind(step.status ?? "pending");
                    const { source, action } = splitStepTitle(step.title);
                    const took = formatDuration(step.startedAt, step.finishedAt);
                    return (
                      <li key={step.id} className={`activity-item activity-item-${kind}`}>
                        <StatusIcon kind={kind} />
                        <span className="activity-text">
                          <span className="activity-action">
                            {source && <span className="activity-source">{source} </span>}
                            {action}
                          </span>
                          {step.description && <span className="activity-detail">{step.description}</span>}
                        </span>
                        {took && <span className="activity-time">{took}</span>}
                        <span className="visually-hidden">, {statusLabel(kind)}</span>
                      </li>
                    );
                  })}
                </ol>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}
