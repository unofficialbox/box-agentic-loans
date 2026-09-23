/**
 * TypeSafe System One over REST (the npm `typesafe-sdk` name is an unrelated
 * placeholder, so there is no SDK dependency).
 *
 * TypeSafe only ever answers from a closed set: a `choice` picks one of the
 * keys we offer, `noul` is a probability. It cannot invent an option, a tool,
 * or an argument. That is what makes the agent's behaviour enumerable: every
 * branch the engine can take is a key we wrote.
 */

export interface ChoiceDecision<K extends string> {
  choice: K;
  confidence: number;
  /** Probability per option, when TypeSafe returns them. */
  probabilities: Partial<Record<K, number>>;
}

export interface Decider {
  choose<K extends string>(
    state: unknown,
    instructions: string,
    criteria: Record<K, string>
  ): Promise<ChoiceDecision<K>>;
}

export class TypeSafeError extends Error {}

interface ChoiceAnswer {
  choice?: string;
  confidence?: number;
  probabilities?: Record<string, number>;
}

export class TypeSafeClient implements Decider {
  /**
   * Same state + question → same answer for the life of the process, so a
   * retried or repeated turn cannot flip a decision.
   */
  private readonly cache = new Map<string, Promise<ChoiceDecision<string>>>();

  constructor(
    private readonly options: { apiKey: string; apiUrl: string; model: string; timeoutMs: number }
  ) {}

  choose<K extends string>(
    state: unknown,
    instructions: string,
    criteria: Record<K, string>
  ): Promise<ChoiceDecision<K>> {
    const key = JSON.stringify([state, instructions, criteria]);
    let pending = this.cache.get(key);
    if (!pending) {
      pending = this.request(state, instructions, criteria);
      pending.catch(() => this.cache.delete(key));
      this.cache.set(key, pending);
    }
    return pending as Promise<ChoiceDecision<K>>;
  }

  private async request<K extends string>(
    state: unknown,
    instructions: string,
    criteria: Record<K, string>
  ): Promise<ChoiceDecision<K>> {
    const response = await fetch(this.options.apiUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.options.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.options.model,
        state,
        questions: { decision: { type: "choice", instructions, criteria } },
      }),
      signal: AbortSignal.timeout(this.options.timeoutMs),
    });
    if (!response.ok) {
      throw new TypeSafeError(`TypeSafe returned ${response.status} ${response.statusText}`.trim());
    }
    const body = (await response.json()) as { answers?: { decision?: ChoiceAnswer } };
    return toDecision(body.answers?.decision, Object.keys(criteria) as K[]);
  }
}

/** Reject anything outside the offered keys rather than trusting the payload. */
export function toDecision<K extends string>(
  answer: ChoiceAnswer | undefined,
  keys: K[]
): ChoiceDecision<K> {
  const choice = answer?.choice;
  if (!choice || !keys.includes(choice as K)) {
    throw new TypeSafeError(`TypeSafe answered outside the offered options: ${String(choice)}`);
  }
  const probabilities: Partial<Record<K, number>> = {};
  for (const key of keys) {
    const value = answer?.probabilities?.[key];
    if (typeof value === "number") {
      probabilities[key] = value;
    }
  }
  const confidence =
    typeof answer?.confidence === "number" ? answer.confidence : (probabilities[choice as K] ?? 0);
  return { choice: choice as K, confidence, probabilities };
}

/** The runner-up, for "did you mean" clarifications. */
export function runnerUp<K extends string>(decision: ChoiceDecision<K>): K | undefined {
  return (Object.entries(decision.probabilities) as Array<[K, number]>)
    .filter(([key]) => key !== decision.choice)
    .sort((a, b) => b[1] - a[1])[0]?.[0];
}
