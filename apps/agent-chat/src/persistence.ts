import type { AgentChatMessage } from "@unofficialbox/box-open-elements/patterns/agent-chat";
import type { TurnDetails } from "./activity";
import type { LoanContext } from "./transport";

/** One conversation as saved in this browser. */
export interface StoredChat {
  id: string;
  messages: AgentChatMessage[];
  /** Keyed by agent message id, like the live conversation. */
  turns: Record<string, TurnDetails>;
  loan: LoanContext | null;
}

export interface StoredChats {
  version: 1;
  activeId: string;
  /** Newest first, as the sidebar lists them. */
  chats: StoredChat[];
}

/** Enough history to pick up where you left off, small enough for localStorage. */
export const MAX_CHATS = 20;

export const RELOADED_NOTICE = "The page reloaded before this reply finished, so it may be incomplete.";

/**
 * Chats persist per backend: the demo script and a live agent (per URL) keep
 * separate lists, so a demo conversation never shows up against a live agent.
 */
export function storageKey(mode: "demo" | "live", baseUrl: string | undefined): string {
  return `loan-copilot.chats.v1:${mode === "demo" ? "demo" : (baseUrl ?? "live")}`;
}

/** The saved chats, or undefined when there are none or they can't be read. Never throws. */
export function loadChats(key: string, storage: Pick<Storage, "getItem"> | undefined = safeStorage()): StoredChats | undefined {
  try {
    const raw = storage?.getItem(key);
    if (!raw) return undefined;
    const value = JSON.parse(raw) as Partial<StoredChats>;
    if (value.version !== 1 || !Array.isArray(value.chats) || typeof value.activeId !== "string") return undefined;
    const chats = value.chats.filter(isStoredChat);
    if (chats.length === 0) return undefined;
    return { version: 1, activeId: chats.some(chat => chat.id === value.activeId) ? value.activeId : chats[0].id, chats };
  } catch {
    return undefined;
  }
}

/**
 * Save, newest first, keeping at most MAX_CHATS. Empty chats aren't worth
 * keeping. If the browser is out of room, drop the oldest until it fits.
 * Never throws: saving is a convenience, not a requirement.
 */
export function saveChats(key: string, state: StoredChats, storage: Pick<Storage, "setItem" | "removeItem"> | undefined = safeStorage()): void {
  if (!storage) return;
  let chats = state.chats.filter(chat => chat.messages.length > 0).slice(0, MAX_CHATS);
  while (true) {
    try {
      if (chats.length === 0) {
        storage.removeItem(key);
      } else {
        storage.setItem(key, JSON.stringify({ version: 1, activeId: state.activeId, chats } satisfies StoredChats));
      }
      return;
    } catch {
      if (chats.length <= 1) return;
      chats = chats.slice(0, -1);
    }
  }
}

/**
 * Make a saved chat safe to resume in a fresh controller:
 * - message ids get a prefix, because a new controller numbers its own
 *   messages from agent-1 again and must never collide with restored ones;
 * - a reply that was still streaming when the page went away is closed and
 *   marked as possibly incomplete, rather than spinning forever.
 */
export function prepareRestore(chat: StoredChat, prefix: string): Pick<StoredChat, "messages" | "turns"> {
  const id = (messageId: string) => `${prefix}${messageId}`;
  const cutShort = new Set(chat.messages.filter(message => message.status === "streaming").map(message => message.id));
  const messages = chat.messages.map(message => ({
    ...message,
    id: id(message.id),
    ...(message.status === "streaming" ? { status: "complete" as const } : {}),
  }));
  const turns: Record<string, TurnDetails> = {};
  for (const [messageId, turn] of Object.entries(chat.turns)) {
    const unfinished = turn.endedAt === undefined || cutShort.has(messageId);
    turns[id(messageId)] = unfinished
      ? {
          ...turn,
          endedAt: turn.endedAt ?? lastStepTime(turn) ?? turn.startedAt,
          incomplete: turn.incomplete ?? RELOADED_NOTICE,
          steps: turn.steps.map(step => (step.status === "running" ? { ...step, status: "skipped" } : step)),
          todos: turn.todos.map(todo => (todo.status === "in_progress" ? { ...todo, status: "skipped" } : todo)),
        }
      : turn;
  }
  return { messages, turns };
}

function lastStepTime(turn: TurnDetails): number | undefined {
  const times = turn.steps.map(step => Date.parse(step.finishedAt ?? step.startedAt ?? "")).filter(Number.isFinite);
  return times.length ? Math.max(...times) : undefined;
}

function isStoredChat(value: unknown): value is StoredChat {
  if (!value || typeof value !== "object") return false;
  const chat = value as Partial<StoredChat>;
  return typeof chat.id === "string" && Array.isArray(chat.messages) && !!chat.turns && typeof chat.turns === "object";
}

function safeStorage(): Storage | undefined {
  try {
    return typeof localStorage === "undefined" ? undefined : localStorage;
  } catch {
    return undefined;
  }
}
