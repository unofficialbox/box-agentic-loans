import type {
  AgentActionProposal,
  AgentResolveActionRequest,
  AgentSendRequest,
} from "@unofficialbox/box-open-elements/patterns/agent-chat";
import { routeIntent, type DemoBeat } from "./demoScript";
import type { LoanAgentTransport, RunStep, TraceListener } from "./types";

export interface DemoTimings {
  /** Delay before each streamed chunk, and per trace step. */
  chunkMs: number;
  stepMs: number;
}

const DEFAULT_TIMINGS: DemoTimings = { chunkMs: 35, stepMs: 280 };

/**
 * Offline transport: routes each prompt to a scripted demo beat, replays the
 * decision trace (routing → tool calls → governance gate), then streams the
 * reply, citations, and any approval card. No network calls.
 */
export class DemoLoanAgentTransport implements LoanAgentTransport {
  readonly mode = "demo" as const;
  onTurnStart?: () => void;
  onTrace?: TraceListener;

  private readonly pending = new Map<string, DemoBeat>();
  private proposalCounter = 0;

  constructor(private readonly timings: DemoTimings = DEFAULT_TIMINGS) {}

  async sendMessage(request: AgentSendRequest): Promise<void> {
    this.onTurnStart?.();
    const { beat, confidence } = routeIntent(request.body);
    const aborted = () => request.signal?.aborted ?? false;

    await this.step(
      {
        id: "route",
        title: `Route intent → ${beat.intent}`,
        description: `Simulated TypeSafe choice · confidence ${Math.round(confidence * 100)}%`,
      },
      confidence >= 0.5 ? "succeeded" : "warning"
    );

    for (const [index, call] of beat.tools.entries()) {
      if (aborted()) {
        return;
      }
      await this.step(
        { id: `tool-${index}`, title: `${call.connector} · ${call.tool}`, description: call.detail },
        call.gated ? "warning" : "succeeded"
      );
    }

    for (const chunk of chunks(beat.reply)) {
      if (aborted()) {
        return;
      }
      await sleep(this.timings.chunkMs);
      request.onEvent({ kind: "delta", text: chunk });
    }

    for (const citation of beat.citations) {
      request.onEvent({ kind: "citation", citation });
    }

    if (beat.proposal) {
      const id = `proposal-${++this.proposalCounter}`;
      this.pending.set(id, beat);
      request.onEvent({ kind: "proposal", proposal: { id, ...beat.proposal } });
    }
  }

  async resolveAction(request: AgentResolveActionRequest): Promise<AgentActionProposal> {
    const beat = this.pending.get(request.proposalId);
    if (!beat?.proposal) {
      throw new Error(`Unknown proposal ${request.proposalId}`);
    }
    this.pending.delete(request.proposalId);
    const approved = request.decision === "approved";
    this.emit({
      id: `gate-${request.proposalId}`,
      title: `Approval · ${beat.proposal.title}`,
      description: approved ? "Approved by reviewer" : "Rejected by reviewer",
      status: approved ? "succeeded" : "skipped",
    });
    return {
      id: request.proposalId,
      ...beat.proposal,
      decision: request.decision,
      note: request.note ?? (approved ? beat.approvedNote : beat.rejectedNote),
    };
  }

  // No timestamps: scripted timings are not real latencies, so no durations.
  private async step(step: Omit<RunStep, "status">, finalStatus: RunStep["status"]) {
    this.emit({ ...step, status: "running" });
    await sleep(this.timings.stepMs);
    this.emit({ ...step, status: finalStatus });
  }

  private emit(step: RunStep) {
    this.onTrace?.({ kind: "trace", step });
  }
}

/** Split into a few words at a time, keeping every space and newline. */
function chunks(text: string): string[] {
  return text.match(/\S+\s*/g)?.reduce<string[]>((out, word, index) => {
    if (index % 3 === 0) {
      out.push(word);
    } else {
      out[out.length - 1] += word;
    }
    return out;
  }, []) ?? [];
}

function sleep(ms: number) {
  return ms > 0 ? new Promise(resolve => setTimeout(resolve, ms)) : Promise.resolve();
}
