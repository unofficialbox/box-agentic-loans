import { describe, expect, it } from "vitest";
import type { AgentChatMessage } from "@unofficialbox/box-open-elements/patterns/agent-chat";
import { newTurn } from "../src/activity";
import { MAX_CHATS, RELOADED_NOTICE, loadChats, prepareRestore, saveChats, storageKey, type StoredChat } from "../src/persistence";

const message = (id: string, role: "user" | "agent", status: AgentChatMessage["status"] = "complete"): AgentChatMessage => ({
  id,
  role,
  body: `${role} ${id}`,
  status,
  citations: [],
  proposals: [],
});

const chat = (id: string, messages = [message("user-1", "user"), message("agent-1", "agent")]): StoredChat => ({
  id,
  messages,
  turns: { "agent-1": { ...newTurn(1000), endedAt: 2000 } },
  loan: { loanId: "LN-2026-0042", status: "Underwriting", risk: "High" },
});

/** A Storage stand-in, optionally with a size limit. */
function memory(limit = Infinity) {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      if (value.length > limit) throw new DOMException("full", "QuotaExceededError");
      data.set(key, value);
    },
    removeItem: (key: string) => void data.delete(key),
  };
}

describe("saved chats", () => {
  it("keeps demo and each live agent apart", () => {
    expect(storageKey("demo", "http://localhost:8787")).toBe("loan-copilot.chats.v1:demo");
    expect(storageKey("live", "http://localhost:8787")).toBe("loan-copilot.chats.v1:http://localhost:8787");
  });

  it("round-trips, newest first, without empty chats", () => {
    const store = memory();
    saveChats("k", { version: 1, activeId: "b", chats: [chat("b"), chat("empty", []), chat("a")] }, store);
    const loaded = loadChats("k", store);
    expect(loaded?.activeId).toBe("b");
    expect(loaded?.chats.map(entry => entry.id)).toEqual(["b", "a"]);
    expect(loaded?.chats[0].loan).toEqual({ loanId: "LN-2026-0042", status: "Underwriting", risk: "High" });
  });

  it("keeps at most the newest chats, and drops the oldest when the browser is full", () => {
    const store = memory();
    const many = Array.from({ length: MAX_CHATS + 5 }, (_, i) => chat(`c${i}`));
    saveChats("k", { version: 1, activeId: "c0", chats: many }, store);
    expect(loadChats("k", store)?.chats).toHaveLength(MAX_CHATS);

    const one = JSON.stringify({ version: 1, activeId: "c0", chats: [chat("c0")] }).length;
    const tight = memory(one * 2);
    saveChats("k", { version: 1, activeId: "c0", chats: many.slice(0, 5) }, tight);
    const kept = loadChats("k", tight)?.chats.map(entry => entry.id) ?? [];
    expect(kept.length).toBeGreaterThan(0);
    expect(kept[0]).toBe("c0");
  });

  it("reads nothing rather than throwing on missing, old or broken data", () => {
    expect(loadChats("k", memory())).toBeUndefined();
    const store = memory();
    store.setItem("k", "{not json");
    expect(loadChats("k", store)).toBeUndefined();
    store.setItem("k", JSON.stringify({ version: 0, chats: [] }));
    expect(loadChats("k", store)).toBeUndefined();
    store.setItem("k", JSON.stringify({ version: 1, activeId: "gone", chats: [chat("a")] }));
    expect(loadChats("k", store)?.activeId).toBe("a");
  });

  it("gives restored messages ids a new controller can't reuse, and closes a reply cut off by the reload", () => {
    const cut = chat("a", [message("user-1", "user"), message("agent-1", "agent", "streaming")]);
    cut.turns = {
      "agent-1": {
        ...newTurn(1000),
        steps: [{ id: "s", title: "Box · search", status: "running", startedAt: new Date(1500).toISOString() }],
        todos: [{ id: "t", content: "Search", status: "in_progress" }],
      },
    };
    const { messages, turns } = prepareRestore(cut, "r1-");
    expect(messages.map(entry => entry.id)).toEqual(["r1-user-1", "r1-agent-1"]);
    expect(messages[1].status).toBe("complete");
    const turn = turns["r1-agent-1"];
    expect(turn.incomplete).toBe(RELOADED_NOTICE);
    expect(turn.endedAt).toBe(1500);
    expect(turn.steps[0].status).toBe("skipped");
    expect(turn.todos[0].status).toBe("skipped");
  });

  it("leaves a finished reply as it was", () => {
    const { turns } = prepareRestore(chat("a"), "r-");
    expect(turns["r-agent-1"]).toEqual({ ...newTurn(1000), endedAt: 2000 });
  });
});
