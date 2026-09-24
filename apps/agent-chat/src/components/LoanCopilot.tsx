import { useCallback, useEffect, useMemo, useState } from "react";
import { EMPTY_SUMMARY, type ChatSummary } from "../conversations";
import { createTransport } from "../transport";
import { ChatList } from "./ChatList";
import { ChatSession } from "./ChatSession";
import { DetailsPanel } from "./DetailsPanel";
import { PanelIcon } from "./icons";
import "./LoanCopilot.css";

const newSessionId = () => `session-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

type Side = "left" | "right";

/** Below this width both sidebars are drawers over the chat; at or above WIDE the details stay open too. */
const NARROW = "(max-width: 899px)";
const WIDE = "(min-width: 1200px)";

const storageKey = (side: Side) => `loan-copilot.${side}-pane`;

function readPane(side: Side): boolean | null {
  try {
    const value = localStorage.getItem(storageKey(side));
    return value === null ? null : value === "open";
  } catch {
    return null;
  }
}

function writePane(side: Side, open: boolean) {
  try {
    localStorage.setItem(storageKey(side), open ? "open" : "closed");
  } catch {
    // Not remembered; the toggle still works.
  }
}

const matches = (query: string) => window.matchMedia(query).matches;

/**
 * Sidebars, the way Claude and ChatGPT lay them out: on a wide window both sit
 * beside the chat and remember whether you closed them; on a narrow one they
 * are drawers, closed until asked for, and close again with Escape or a tap
 * outside.
 */
function usePanes() {
  const [narrow, setNarrow] = useState(() => matches(NARROW));
  const [open, setOpen] = useState<Record<Side, boolean>>(() => ({
    left: !matches(NARROW) && (readPane("left") ?? true),
    right: !matches(NARROW) && (readPane("right") ?? matches(WIDE)),
  }));

  useEffect(() => {
    const query = window.matchMedia(NARROW);
    const onChange = () => {
      setNarrow(query.matches);
      setOpen(
        query.matches
          ? { left: false, right: false }
          : { left: readPane("left") ?? true, right: readPane("right") ?? matches(WIDE) }
      );
    };
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  const toggle = useCallback(
    (side: Side) =>
      setOpen(current => {
        const next = !current[side];
        if (!narrow) writePane(side, next);
        // A drawer opens alone.
        return narrow ? { left: false, right: false, [side]: next } : { ...current, [side]: next };
      }),
    [narrow]
  );
  const closeDrawers = useCallback(() => {
    if (narrow) setOpen({ left: false, right: false });
  }, [narrow]);

  useEffect(() => {
    if (!narrow || (!open.left && !open.right)) return;
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && closeDrawers();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [narrow, open, closeDrawers]);

  return { narrow, open, toggle, closeDrawers };
}

export function LoanCopilot({ loan }: { loan?: string }) {
  const isDemo = useMemo(() => createTransport(loan).mode === "demo", [loan]);
  const [sessions, setSessions] = useState<string[]>(() => [newSessionId()]);
  const [activeId, setActiveId] = useState(sessions[0]);
  const [summaries, setSummaries] = useState<Record<string, ChatSummary>>({});
  const { narrow, open, toggle, closeDrawers } = usePanes();

  const onSummary = useCallback(
    (id: string, summary: ChatSummary) => setSummaries(current => ({ ...current, [id]: summary })),
    []
  );

  const active = summaries[activeId] ?? EMPTY_SUMMARY;

  const newChat = () => {
    // An untouched chat is already a new chat: go to it rather than stacking empties.
    const empty = sessions.find(id => !(summaries[id]?.started ?? false));
    if (empty) {
      setActiveId(empty);
    } else {
      const id = newSessionId();
      setSessions(current => [id, ...current]);
      setActiveId(id);
    }
    closeDrawers();
  };

  const select = (id: string) => {
    setActiveId(id);
    closeDrawers();
  };

  const chats = sessions.map(id => ({ id, summary: summaries[id] ?? EMPTY_SUMMARY }));
  const heading = active.loan?.name ?? (active.started ? active.title : "Loan Copilot");
  const meta = active.loan
    ? [active.loan.loanId, active.loan.status, active.loan.risk && `${active.loan.risk} risk`].filter(Boolean).join(" · ")
    : undefined;

  return (
    <div
      className="copilot"
      data-left={open.left ? "open" : "closed"}
      data-right={open.right ? "open" : "closed"}
      data-layout={narrow ? "drawers" : "panes"}
    >
      <nav className="pane pane-left" id="pane-left" aria-label="Chats" inert={!open.left}>
        <ChatList chats={chats} activeId={activeId} isDemo={isDemo} onSelect={select} onNew={newChat} />
      </nav>

      <main className="main">
        <header className="main-head">
          <button
            type="button"
            className="icon-button pane-toggle"
            aria-controls="pane-left"
            aria-expanded={open.left}
            onClick={() => toggle("left")}
            title={open.left ? "Close chats" : "Open chats"}
          >
            <PanelIcon side="left" />
            <span className="visually-hidden">{open.left ? "Close chats" : "Open chats"}</span>
          </button>
          <div className="main-title">
            <h1 className="main-heading">{heading}</h1>
            {meta && <span className="main-meta">{meta}</span>}
          </div>
          <button
            type="button"
            className="icon-button pane-toggle"
            aria-controls="pane-right"
            aria-expanded={open.right}
            onClick={() => toggle("right")}
            title={open.right ? "Close details" : "Open details"}
          >
            <PanelIcon side="right" />
            <span className="visually-hidden">{open.right ? "Close details" : "Open details"}</span>
          </button>
        </header>

        {sessions.map(id => (
          <ChatSession key={id} sessionId={id} loanHint={loan} active={id === activeId} onSummary={onSummary} />
        ))}
      </main>

      <aside className="pane pane-right" id="pane-right" aria-label="Details" inert={!open.right}>
        <DetailsPanel sessionId={activeId} summary={active} />
      </aside>

      {narrow && (open.left || open.right) && <div className="scrim" aria-hidden="true" onClick={closeDrawers} />}
    </div>
  );
}
