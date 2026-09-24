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
} from "../inspector/calls";
import "./ApiInspector.css";

const OPEN_KEY = "loan-copilot.inspector-open";
const HEIGHT_KEY = "loan-copilot.inspector-height";
const RATIO_KEY = "loan-copilot.inspector-ratio";

/** Per-viewer layout only; the page works without storage. */
function readNumber(key: string, fallback: number): number {
  try {
    const value = Number(localStorage.getItem(key));
    return localStorage.getItem(key) !== null && Number.isFinite(value) ? value : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage unavailable: the layout just isn't remembered.
  }
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const maxHeight = () => Math.round(window.innerHeight * 0.75);

/** "outdated": the agent answers but has no call log, i.e. it runs older code and needs a restart. */
type Connection = "connecting" | "live" | "reconnecting" | "outdated";

const CONNECTION_LABELS: Record<Connection, string> = {
  connecting: "connecting",
  live: "live",
  reconnecting: "reconnecting",
  outdated: "restart the loan agent",
};

/**
 * Bottom "API inspector" shelf, after box-cmis-lab's HTTP inspector: every call
 * the loan agent makes to TypeSafe, Salesforce and Box (and each chat request it
 * serves), live from GET /calls/stream, with headers and bodies.
 */
export function ApiInspector({ baseUrl }: { baseUrl: string }) {
  const [entries, setEntries] = useState<CallEntry[]>([]);
  const [connection, setConnection] = useState<Connection>("connecting");
  const [open, setOpen] = useState(() => readNumber(OPEN_KEY, 0) === 1);
  const [height, setHeight] = useState(() => clamp(readNumber(HEIGHT_KEY, 320), 180, maxHeight()));
  const [ratio, setRatio] = useState(() => clamp(readNumber(RATIO_KEY, 0.42), 0.2, 0.8));
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

  const toggle = () =>
    setOpen(current => {
      write(OPEN_KEY, current ? "0" : "1");
      return !current;
    });

  const clearLog = useCallback(() => {
    setSelectedId(null);
    void fetch(`${baseUrl}/calls`, { method: "DELETE" }).catch(() => setEntries([]));
  }, [baseUrl]);

  // Drag the title bar to resize the shelf.
  const onBarPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (!open || event.button !== 0 || (event.target as HTMLElement).closest("button, select")) return;
    const startY = event.clientY;
    const startHeight = height;
    const move = (moveEvent: globalThis.PointerEvent) => setHeight(clamp(startHeight + startY - moveEvent.clientY, 180, maxHeight()));
    const up = (upEvent: globalThis.PointerEvent) => {
      write(HEIGHT_KEY, String(Math.round(clamp(startHeight + startY - upEvent.clientY, 180, maxHeight()))));
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  // Drag (or arrow-key) the divider between the list and the details.
  const setSplit = (next: number) => {
    const value = clamp(next, 0.2, 0.8);
    setRatio(value);
    write(RATIO_KEY, value.toFixed(3));
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
    <section
      className={`inspector ${open ? "is-open" : ""}`}
      aria-label="API inspector"
      style={{ ["--inspector-height" as string]: `${height}px` }}
    >
      <div className="inspector-bar" onPointerDown={onBarPointerDown}>
        <button type="button" className="inspector-toggle" aria-expanded={open} onClick={toggle}>
          <span className="inspector-chevron" aria-hidden="true" />
          <span className="inspector-title">API inspector</span>
          <span className="inspector-badge">{entries.length}</span>
          {failures > 0 && <span className="inspector-badge inspector-badge-error">{failures} failed</span>}
        </button>
        <span
          className={`inspector-conn inspector-conn-${connection}`}
          title={
            connection === "outdated"
              ? "The loan agent answers but has no call log: it is running older code. Pull main and restart it (npm start in apps/loan-agent)."
              : `Call log: ${connection}`
          }
        >
          <span className="inspector-dot" aria-hidden="true" />
          {CONNECTION_LABELS[connection]}
        </span>
        {open && (
          <div className="inspector-actions">
            <label className="inspector-filter">
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
        )}
      </div>

      {open && (
        <div className="inspector-body" ref={splitRef} style={{ gridTemplateColumns: `${ratio}fr auto ${1 - ratio}fr` }}>
          <div className="inspector-list">
            {shown.length === 0 ? (
              <p className="inspector-empty">
                {connection === "outdated"
                  ? `The loan agent at ${baseUrl} has no call log, so it is running code from before the inspector. Pull main, then stop it and run npm start in apps/loan-agent again.`
                  : entries.length === 0
                    ? "No calls yet. Ask the copilot something: its TypeSafe, Salesforce and Box calls appear here."
                    : "No calls match this filter."}
              </p>
            ) : (
              <table className="inspector-table">
                <thead>
                  <tr>
                    <th scope="col">Status</th>
                    <th scope="col">Service</th>
                    <th scope="col">Call</th>
                    <th scope="col" className="inspector-num">
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
                      className={isFailure(entry) ? "is-failure" : undefined}
                      onClick={() => setSelectedId(entry.id)}
                      onKeyDown={event => onRowKey(event, entry.id)}
                    >
                      <td className="inspector-status">{statusText(entry)}</td>
                      <td>
                        <span className="inspector-service">{SERVICE_LABELS[entry.service]}</span>
                      </td>
                      <td className="inspector-callcell" title={`${entry.method} ${entry.url}`}>
                        <span className="inspector-method">{entry.method}</span> {entry.summary}
                      </td>
                      <td className="inspector-num">{entry.pending ? "…" : entry.durationMs}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          <div
            className="inspector-divider"
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
          <div className="inspector-detail">
            {selected ? <CallDetail entry={selected} /> : <p className="inspector-empty">Select a call.</p>}
          </div>
        </div>
      )}
    </section>
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
    <div className="inspector-copy" role="group" aria-label="Copy this call">
      {(Object.keys(COPY_LABELS) as CopyPart[]).map(part => (
        <button key={part} type="button" className="button inspector-copy-button" onClick={() => copy(part)}>
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
      <p className="inspector-call">{entry.summary}</p>
      <div className="inspector-detail-head">
        <div className="inspector-summary">
          <span className="inspector-pill">{entry.method}</span>
          <span className={`inspector-pill ${isFailure(entry) ? "inspector-pill-error" : "inspector-pill-ok"}`}>
            {statusText(entry)}
            {entry.statusText ? ` ${entry.statusText}` : ""}
          </span>
          <span className="inspector-service">{SERVICE_LABELS[entry.service]}</span>
          <span className="inspector-meta">
            {entry.pending ? "in progress" : `${entry.durationMs} ms`} · {new Date(entry.startedAt).toLocaleTimeString()}
          </span>
        </div>
        <CopyButtons entry={entry} />
      </div>
      <p className="inspector-url">
        <code>{entry.url}</code>
      </p>
      {entry.error && <p className="inspector-error">{entry.error}</p>}
      <Block label="Request headers" text={JSON.stringify(entry.requestHeaders, null, 2)} />
      <Block label="Request body" text={entry.requestBody} />
      <Block label="Response headers" text={JSON.stringify(entry.responseHeaders, null, 2)} />
      <Block label="Response body" text={entry.pending ? "(waiting for the response)" : entry.responseBody} />
    </>
  );
}

function Block({ label, text }: { label: string; text?: string }) {
  return (
    <div className="inspector-block">
      <div className="inspector-block-label">{label}</div>
      <pre className="inspector-code">{text || "(empty)"}</pre>
    </div>
  );
}
