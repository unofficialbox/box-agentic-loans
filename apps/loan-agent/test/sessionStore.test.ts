import { mkdtempSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { AgentSnapshot } from "../src/engine.js";
import { FileSessionStore } from "../src/sessionStore.js";

const snapshot: AgentSnapshot = {
  version: 1,
  proposalCounter: 3,
  sessions: [{ id: "s1", usedAt: "2026-09-24T12:00:00.000Z", state: { borrowers: ["Harborview Logistics"] } }],
  pending: [],
};

describe("file session store", () => {
  it("starts empty when there is no file, and reads back what it saved, owner-only", () => {
    const path = join(mkdtempSync(join(tmpdir(), "sessions-")), ".data", "sessions.json");
    const store = new FileSessionStore(path);
    expect(store.load()).toBeUndefined();
    store.save(snapshot);
    expect(store.load()).toEqual(snapshot);
    expect(statSync(path).mode & 0o777).toBe(0o600);
    expect(readdirSync(join(path, ".."))).toEqual(["sessions.json"]);
  });

  it("sets an unreadable file aside and starts empty", () => {
    const dir = mkdtempSync(join(tmpdir(), "sessions-"));
    const path = join(dir, "sessions.json");
    writeFileSync(path, "{not json");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(new FileSessionStore(path).load()).toBeUndefined();
    expect(readdirSync(dir)).toEqual([expect.stringMatching(/^sessions\.json\.unreadable-\d+$/)]);
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });
});
