import { describe, expect, it } from "vitest";
import type { AgentChatMessage } from "@unofficialbox/box-open-elements/patterns/agent-chat";
import { chatTitle, collectApprovals, collectSources, proposalAnchor, summarize } from "../src/conversations";

const user = (body: string): AgentChatMessage => ({ id: `u-${body}`, role: "user", body, status: "complete", citations: [], proposals: [] });
const agent = (extra: Partial<AgentChatMessage>): AgentChatMessage => ({
  id: `a-${Math.random()}`,
  role: "agent",
  body: "",
  status: "complete",
  citations: [],
  proposals: [],
  ...extra,
});

describe("chat titles", () => {
  it("is New chat until the officer writes, then their first message", () => {
    expect(chatTitle([])).toBe("New chat");
    expect(chatTitle([user("Validate the record"), user("then apply")])).toBe("Validate the record");
  });

  it("cuts a long first message at a word", () => {
    const title = chatTitle([user("What's the latest loan for Harborview Logistics? Which documents are flagged?")]);
    expect(title).toBe("What's the latest loan for Harborview…");
    expect(title.length).toBeLessThanOrEqual(49);
  });
});

describe("conversation summary", () => {
  const messages = [
    user("find risk"),
    agent({ citations: [{ id: "f1", label: "term-sheet.pdf", href: "https://app.box.com/file/f1" }, { id: "LOS-LTV-001", label: "LOS-LTV-001 · LTV" }] }),
    user("apply"),
    agent({ citations: [{ id: "f1", label: "term-sheet.pdf" }], proposals: [{ id: "p1", title: "Apply 3 terms", decision: "approved" }] }),
    agent({ proposals: [{ id: "p2", title: "Generate letter" }] }),
  ];

  it("keeps each source once, in the order first cited", () => {
    expect(collectSources(messages).map(source => source.id)).toEqual(["f1", "LOS-LTV-001"]);
    expect(collectSources(messages)[0].href).toBe("https://app.box.com/file/f1");
  });

  it("lists every approval with its decision", () => {
    expect(collectApprovals(messages)).toEqual([
      { id: "p1", title: "Apply 3 terms", decision: "approved" },
      { id: "p2", title: "Generate letter" },
    ]);
  });

  it("summarizes for the sidebars", () => {
    expect(summarize(messages, null, true)).toMatchObject({ title: "find risk", started: true, streaming: true });
    expect(summarize([], null, false)).toMatchObject({ title: "New chat", started: false });
  });

  it("makes a safe DOM id for a proposal, unique across chats", () => {
    expect(proposalAnchor("session-a", "proposal-1")).toBe("proposal-session-a-proposal-1");
    expect(proposalAnchor("session-a", "proposal-1")).not.toBe(proposalAnchor("session-b", "proposal-1"));
    expect(proposalAnchor("s", "a b/c")).toBe("proposal-s-a-b-c");
  });
});
