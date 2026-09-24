import type { ChatSummary } from "../conversations";
import { agentBaseUrl } from "../transport";
import { BrandMark } from "./BrandMark";
import { CloseIcon, ExternalIcon, NewChatIcon } from "./icons";

export interface ChatEntry {
  id: string;
  summary: ChatSummary;
}

/**
 * The left sidebar: the product, New chat, and this tab's conversations,
 * newest first. A row says when its chat is working or waiting on the officer,
 * so a turn left running in another chat is never lost. Chats are kept in
 * this browser; each can be deleted from its row.
 */
export function ChatList({
  chats,
  activeId,
  isDemo,
  onSelect,
  onNew,
  onDelete,
}: {
  chats: ChatEntry[];
  activeId: string;
  isDemo: boolean;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
}) {
  const baseUrl = agentBaseUrl();
  return (
    <div className="pane-inner sidebar">
      <p className="wordmark wordmark-stacked">
        <BrandMark />
        <span>
          <span className="wordmark-bank">Acme Bank</span>
          <span className="wordmark-product">Loan Copilot</span>
        </span>
      </p>

      <button type="button" className="sidebar-action" onClick={onNew}>
        <NewChatIcon />
        New chat
      </button>

      <h2 className="pane-heading">Chats</h2>
      <ul className="chat-list">
        {chats.map(({ id, summary }) => {
          const waiting = summary.approvals.filter(approval => !approval.decision).length;
          const status = summary.streaming ? "Working…" : waiting ? "Needs your approval" : undefined;
          return (
            <li key={id} className="chat-row">
              <button
                type="button"
                className="chat-item"
                aria-current={id === activeId ? "page" : undefined}
                onClick={() => onSelect(id)}
              >
                <span className="chat-title">{summary.title}</span>
                {(status || summary.loan) && (
                  <span className={`chat-meta ${summary.streaming ? "is-working" : waiting ? "is-waiting" : ""}`}>
                    {status && <span className="chat-dot" aria-hidden="true" />}
                    {status ?? summary.loan?.loanId}
                  </span>
                )}
              </button>
              {summary.started && (
                <button
                  type="button"
                  className="chat-delete"
                  onClick={() => onDelete(id)}
                  aria-label={`Delete chat: ${summary.title}`}
                  title="Delete chat"
                >
                  <CloseIcon />
                </button>
              )}
            </li>
          );
        })}
      </ul>

      <div className="sidebar-foot">
        {isDemo ? (
          <span className="mode-demo" title="Scripted replies; no Box or Salesforce calls. Set VITE_AGENT_API_URL for a live agent.">
            Demo script
          </span>
        ) : (
          baseUrl && (
            // Developer tooling lives on its own page, opened beside the copilot.
            <a className="sidebar-action" href="devtools.html" target="loan-copilot-devtools">
              <ExternalIcon />
              API calls
              <span className="visually-hidden"> (opens in a new tab)</span>
            </a>
          )
        )}
      </div>
    </div>
  );
}
