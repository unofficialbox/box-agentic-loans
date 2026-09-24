import { chmodSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { AgentSnapshot, SessionStore } from "./engine.js";

/**
 * Conversations on disk, owner-only like the sign-in tokens. They hold loan
 * data from your org, so the file stays under the gitignored .data/.
 */
export class FileSessionStore implements SessionStore {
  constructor(private readonly path: string) {}

  load(): AgentSnapshot | undefined {
    let raw: string;
    try {
      raw = readFileSync(this.path, "utf8");
    } catch {
      return undefined; // No file yet: a first run.
    }
    try {
      const value = JSON.parse(raw) as Partial<AgentSnapshot>;
      if (value.version !== 1 || !Array.isArray(value.sessions) || !Array.isArray(value.pending) || typeof value.proposalCounter !== "number") {
        throw new Error("not a version 1 snapshot");
      }
      return value as AgentSnapshot;
    } catch (error) {
      // Set it aside rather than lose it or refuse to start: the agent starts empty.
      const aside = `${this.path}.unreadable-${Date.now()}`;
      renameSync(this.path, aside);
      console.warn(`[sessions] Couldn't read ${this.path} (${error instanceof Error ? error.message : String(error)}); moved it to ${aside} and started with no saved conversations.`);
      return undefined;
    }
  }

  /** Written to a temporary file and renamed, so a crash mid-write never leaves half a file. */
  save(snapshot: AgentSnapshot): void {
    mkdirSync(dirname(this.path), { recursive: true, mode: 0o700 });
    const temporary = `${this.path}.tmp`;
    writeFileSync(temporary, JSON.stringify(snapshot), { mode: 0o600 });
    chmodSync(temporary, 0o600);
    renameSync(temporary, this.path);
  }
}
