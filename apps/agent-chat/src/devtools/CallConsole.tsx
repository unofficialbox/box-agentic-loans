import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import {
  CALL_FILTERS,
  SERVICE_LABELS,
  applyCallEvent,
  formatCall,
  formatRequest,
  formatResponse,
  isFailure,
  matchesFilter,
  type CallEntry,
  type CallFilter,
} from "./calls";
import "./CallConsole.css";

const RATIO_KEY = "loan-copilot.devtools-ratio";

/** Per-viewer layout only; the page works without storage. */
function readRatio(): number {
  try {
    const stored = localStorage.getItem(RATIO_KEY);
    const value = Number(stored);
    return stored !== null && Number.isFinite(value) ? value : 0.42;
  } catch {
    return 0.42;
  }
}

function writeRatio(value: number) {
  try {
    localStorage.setItem(RATIO_KEY, value.toFixed(3));
  } catch {
    // Storage unavailable: the split just isn't remembered.
  }
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** "outdated": the agent answers but has no call log, i.e. it runs older code and needs a restart. */
type Connection = "connecting" | "live" | "reconnecting" | "outdated";

const CONNECTION_LABELS: Record<Connection, string> = {
  connecting: "Connecting",
  live: "Live",
  reconnecting: "Reconnecting",
  outdated: "Restart the loan agent",
};

/**
 * The API console, on its own page and out of the product UI (layout after
 * box-cmis-lab's HTTP inspector): every call the loan agent makes to
 * TypeSafe, Salesforce and Box, and each chat request it serves, live from
 * GET /calls/stream, with headers and bodies.
 */
export function CallConsole({ baseUrl }: { baseUrl: string }) {
  const [entries, setEntries] = useState<CallEntry[]>([]);
  const [connection, setConnection] = useState<Connection>("connecting");
  const [ratio, setRatio] = useState(() => clamp(readRatio(), 0.2, 0.8));
  const [filter, setFilter] = useState<CallFilter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const splitRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const source = new EventSource(`${baseUrl}/calls/stream`);
    const on = (type: "snapshot" | "call" | "clear") => (event: MessageEvent<string>) => {
      const data = JSON.parse(event.data) as unknown;
      setConnection("live");
      setEntries(current =>
        applyCallEvent(
          current,
          type === "snapshot"
            ? { type, entries: data as CallEntry[] }
            : type === "call"
              ? { type, entry: data as CallEntry }
              : { type }
        )
      );
    };
    const snapshot = on("snapshot");
    const call = on("call");
    const clear = on("clear");
    source.addEventListener("snapshot", snapshot);
    source.addEventListener("call", call);
    source.addEventListener("clear", clear);
    source.onopen = () => setConnection("live");
    // EventSource reconnects by itself and the server sends a fresh snapshot,
    // unless the agent is up but has no /calls: then retrying can't help.
    source.onerror = () => {
      setConnection("reconnecting");
      fetch(`${baseUrl}/calls`, { method: "GET" })
        .then(response => {
          if (response.status === 404) {
            source.close();
            setConnection("outdated");
          }
        })
        .catch(() => undefined);
    };
    return () => source.close();
  }, [baseUrl]);

  const shown = useMemo(() => entries.filter(entry => matchesFilter(entry, filter)), [entries, filter]);
  const selected = shown.find(entry => entry.id === selectedId) ?? shown[0] ?? null;
  const failures = useMemo(() => entries.filter(isFailure).length, [entries]);

  const clearLog = useCallback(() => {
    setSelectedId(null);
    void fetch(`${baseUrl}/calls`, { method: "DELETE" }).catch(() => setEntries([]));
  }, [baseUrl]);

  // Drag (or arrow-key) the divider between the list and the details.
  const setSplit = (next: number) => {
    const value = clamp(next, 0.2, 0.8);
    setRatio(value);
    writeRatio(value);
  };
  const onDividerPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    const box = splitRef.current?.getBoundingClientRect();
    if (!box || event.button !== 0) return;
    const move = (moveEvent: globalThis.PointerEvent) => setSplit((moveEvent.clientX - box.left) / box.width);
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };
  const onDividerKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowLeft") setSplit(ratio - 0.05);
    if (event.key === "ArrowRight") setSplit(ratio + 0.05);
  };

  const onRowKey = (event: KeyboardEvent<HTMLTableRowElement>, id: string) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setSelectedId(id);
    }
  };

  return (
    <section className="console" aria-label="API calls">
      <div className="console-bar">
        <span className="console-count">
          {entries.length} call{entries.length === 1 ? "" : "s"}
          {failures > 0 && <span className="console-badge-error">{failures} failed</span>}
        </span>
        <span
          className={`console-conn console-conn-${connection}`}
          title={
            connection === "outdated"
              ? "The loan agent answers but has no call log: it is running older code. Pull main and restart it (npm start in apps/loan-agent)."
              : `Call log: ${CONNECTION_LABELS[connection].toLowerCase()}`
          }
        >
          <span className="console-dot" aria-hidden="true" />
          {CONNECTION_LABELS[connection]}
        </span>
        <div className="console-actions">
          <label className="console-filter">
            <span className="visually-hidden">Show</span>
            <select value={filter} onChange={event => setFilter(event.target.value as CallFilter)}>
              {CALL_FILTERS.map(option => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <button type="button" className="button" onClick={clearLog}>
            Clear
          </button>
        </div>
      </div>

      <div className="console-body" ref={splitRef} style={{ gridTemplateColumns: `${ratio}fr auto ${1 - ratio}fr` }}>
        <div className="console-list">
          {shown.length === 0 && connection === "connecting" ? (
            <Skeleton />
          ) : shown.length === 0 ? (
            <p className="console-empty">
              {connection === "outdated"
                ? `The loan agent at ${baseUrl} has no call log, so it is running code from before the console. Pull main, then stop it and run npm start in apps/loan-agent again.`
                : entries.length === 0
                  ? "No calls yet. Ask the copilot something: its TypeSafe, Salesforce and Box calls appear here as they happen."
                  : "No calls match this filter."}
            </p>
          ) : (
            <table className="console-table">
              <thead>
                <tr>
                  <th scope="col">Status</th>
                  <th scope="col">Service</th>
                  <th scope="col">Call</th>
                  <th scope="col" className="console-num">
                    ms
                  </th>
                </tr>
              </thead>
              <tbody>
                {shown.map(entry => (
                  <tr
                    key={entry.id}
                    tabIndex={0}
                    aria-selected={entry.id === selected?.id}
                    className={isFailure(entry) ? "is-failure" : entry.expected ? "is-expected" : undefined}
                    onClick={() => setSelectedId(entry.id)}
                    onKeyDown={event => onRowKey(event, entry.id)}
                  >
                    <td className="console-status">{statusText(entry)}</td>
                    <td>
                      <span className="console-service">{SERVICE_LABELS[entry.service]}</span>
                    </td>
                    <td className="console-callcell" title={`${entry.method} ${entry.url}`}>
                      <span className="console-method">{entry.method}</span> {entry.summary}
                    </td>
                    <td className="console-num">{entry.pending ? "…" : entry.durationMs}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div
          className="console-divider"
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize the call list"
          aria-valuenow={Math.round(ratio * 100)}
          aria-valuemin={20}
          aria-valuemax={80}
          tabIndex={0}
          onPointerDown={onDividerPointerDown}
          onKeyDown={onDividerKey}
        />
        <div className="console-detail">
          {selected ? (
            <CallDetail entry={selected} />
          ) : (
            connection !== "connecting" && <p className="console-empty">Select a call.</p>
          )}
        </div>
      </div>
    </section>
  );
}

/** Placeholder rows while the call log connects, shaped like the rows that will replace them. */
function Skeleton() {
  return (
    <div className="console-skeleton" role="status">
      <span className="visually-hidden">Connecting to the call log…</span>
      {[62, 48, 70, 55].map((width, index) => (
        <div key={index} className="console-skeleton-row" aria-hidden="true">
          <span className="skeleton" style={{ width: "2rem" }} />
          <span className="skeleton" style={{ width: "4rem" }} />
          <span className="skeleton" style={{ width: `${width}%` }} />
        </div>
      ))}
    </div>
  );
}

function statusText(entry: CallEntry): string {
  if (entry.pending && !entry.status) return "…";
  return entry.status ? String(entry.status) : "ERR";
}

/** Clipboard API where allowed; a hidden textarea where it isn't (e.g. plain http on a LAN IP). */
async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    return;
  } catch {
    // Fall through to the legacy path.
  }
  const area = document.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "");
  area.style.position = "fixed";
  area.style.opacity = "0";
  document.body.append(area);
  area.select();
  const ok = document.execCommand("copy");
  area.remove();
  if (!ok) throw new Error("Copy failed");
}

type CopyPart = "request" | "response" | "both";

const COPY_LABELS: Record<CopyPart, string> = {
  request: "Copy request",
  response: "Copy response",
  both: "Copy both",
};

function CopyButtons({ entry }: { entry: CallEntry }) {
  const [done, setDone] = useState<{ part: CopyPart; ok: boolean } | null>(null);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    setDone(null);
    return () => window.clearTimeout(timer.current);
  }, [entry.id]);

  const copy = (part: CopyPart) => {
    const text = part === "request" ? formatRequest(entry) : part === "response" ? formatResponse(entry) : formatCall(entry);
    copyText(text).then(
      () => setDone({ part, ok: true }),
      () => setDone({ part, ok: false })
    );
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setDone(null), 1800);
  };

  return (
    <div className="console-copy" role="group" aria-label="Copy this call">
      {(Object.keys(COPY_LABELS) as CopyPart[]).map(part => (
        <button key={part} type="button" className="button button-compact" onClick={() => copy(part)}>
          {done?.part === part ? (done.ok ? "Copied" : "Copy failed") : COPY_LABELS[part]}
        </button>
      ))}
      <span className="visually-hidden" role="status">
        {done ? (done.ok ? `${COPY_LABELS[done.part].replace("Copy ", "")} copied` : "Copy failed") : ""}
      </span>
    </div>
  );
}

function CallDetail({ entry }: { entry: CallEntry }) {
  return (
    <>
      <p className="console-call">{entry.summary}</p>
      <div className="console-detail-head">
        <div className="console-summary">
          <span className="console-pill">{entry.method}</span>
          <span
            className={`console-pill ${
              isFailure(entry) ? "console-pill-error" : entry.expected ? "console-pill-neutral" : "console-pill-ok"
            }`}
          >
            {statusText(entry)}
            {entry.statusText ? ` ${entry.statusText}` : ""}
          </span>
          <span className="console-service">{SERVICE_LABELS[entry.service]}</span>
          <span className="console-meta">
            {entry.pending ? "in progress" : `${entry.durationMs} ms`} · {new Date(entry.startedAt).toLocaleTimeString()}
          </span>
        </div>
        <CopyButtons entry={entry} />
      </div>
      <p className="console-url">
        <code>{entry.url}</code>
      </p>
      {entry.error && <p className="console-error">{entry.error}</p>}
      {entry.expected && <p className="console-note">{entry.expected}</p>}
      <Block key={`${entry.id}-rqh`} label="Request headers" text={JSON.stringify(entry.requestHeaders, null, 2)} />
      <Block key={`${entry.id}-rqb`} label="Request body" text={entry.requestBody} />
      <Block key={`${entry.id}-rsh`} label="Response headers" text={JSON.stringify(entry.responseHeaders, null, 2)} />
      <Block key={`${entry.id}-rsb`} label="Response body"
        text={entry.pending ? undefined : entry.responseBody}
        placeholder={entry.pending ? "(waiting for the response)" : "(empty)"}
      />
    </>
  );
}

const CopyIcon = () => (
  <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
    <rect x="5.5" y="5.5" width="8" height="8" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
    <path d="M10.5 3.5v-.5a1.5 1.5 0 0 0-1.5-1.5H4A1.5 1.5 0 0 0 2.5 3v5A1.5 1.5 0 0 0 4 9.5h.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
  </svg>
);

const CheckIcon = () => (
  <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
    <path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/** A code block with a copy icon in its corner that copies exactly what it shows. */
function Block({ label, text, placeholder = "(empty)" }: { label: string; text?: string; placeholder?: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const copy = () => {
    if (!text) return;
    copyText(text).then(
      () => setState("copied"),
      () => setState("failed")
    );
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setState("idle"), 1600);
  };

  const name = label.toLowerCase();
  return (
    <div className="console-block">
      <div className="console-block-label">{label}</div>
      <div className="console-code-wrap">
        <pre className="console-code">{text || placeholder}</pre>
        {text && (
          <button
            type="button"
            className={`console-code-copy ${state === "copied" ? "is-copied" : ""}`}
            aria-label={`Copy ${name}`}
            title={state === "copied" ? "Copied" : state === "failed" ? "Copy failed" : `Copy ${name}`}
            onClick={copy}
          >
            {state === "copied" ? <CheckIcon /> : <CopyIcon />}
          </button>
        )}
        <span className="visually-hidden" role="status">
          {state === "copied" ? `${label} copied` : state === "failed" ? "Copy failed" : ""}
        </span>
      </div>
    </div>
  );
}
