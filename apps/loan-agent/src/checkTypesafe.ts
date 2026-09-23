/**
 * Measures how repeatable TypeSafe's routing is: sends each demo prompt N
 * times (bypassing the in-process cache) and reports how often the choice
 * and confidence change.
 *
 *   npm run check:typesafe -- 5
 */
import { loadRootEnv, readConfig } from "./config.js";
import { TypeSafeClient } from "./typesafe.js";
import { INTENTS } from "./understand.js";

loadRootEnv();
const config = readConfig();
if (!config.typesafe.apiKey) {
  console.error("TYPESAFE_API_KEY is not set. Add it to the repo-root .env (see .env.sample).");
  process.exit(1);
}

const PROMPTS = [
  "What's the latest loan for Harborview Logistics? Which documents in that loan are flagged critical policy risk?",
  "Extract loan terms from the marked-up term sheet for that loan and check them against credit policy.",
  "Validate those terms against the Salesforce record.",
  "apply the amount, rate and term to the record, confirm",
  "Compare the covenant terms across Harborview's prior executed loans and this 2026 markup.",
  "Generate the commitment letter for this loan",
  "Send it for signature",
];

const runs = Math.max(1, Number(process.argv[2] ?? 3));
let unstable = 0;

for (const prompt of PROMPTS) {
  const choices = new Map<string, number>();
  const confidences: number[] = [];
  for (let i = 0; i < runs; i++) {
    // A fresh client per run so the process cache cannot mask variation.
    const client = new TypeSafeClient({
      apiKey: config.typesafe.apiKey,
      apiUrl: config.typesafe.apiUrl,
      model: config.typesafe.model,
      timeoutMs: config.typesafe.timeoutMs,
    });
    const decision = await client.choose(
      { message: prompt, loanInContext: null, termsExtracted: false, letterGenerated: false },
      "Which operation does the loan officer's message ask for?",
      INTENTS
    );
    choices.set(decision.choice, (choices.get(decision.choice) ?? 0) + 1);
    confidences.push(decision.confidence);
  }
  const spread = Math.max(...confidences) - Math.min(...confidences);
  const stable = choices.size === 1;
  if (!stable) unstable++;
  console.log(
    `${stable ? "stable  " : "UNSTABLE"} ${[...choices].map(([c, n]) => `${c}×${n}`).join(", ")} · confidence spread ${spread.toFixed(3)} · ${prompt.slice(0, 60)}`
  );
}

console.log(`\n${PROMPTS.length - unstable}/${PROMPTS.length} prompts routed identically across ${runs} runs.`);
process.exit(unstable ? 1 : 0);
