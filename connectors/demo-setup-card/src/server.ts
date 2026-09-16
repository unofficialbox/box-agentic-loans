/**
 * MCP Apps server for the LOS demo's Demo Setup decision card.
 *
 * `demoBindings` (model-visible, no UI) answers silently: when every default is set it hands
 * the bindings back as complete and the demo runs without a setup step. `demoSetup` renders
 * the card, and is meant only for a missing value or an operator who asks for Demo Setup.
 * `confirmDemoSetup` validates what the operator confirmed and records it for the process;
 * in Claude Desktop the card then posts the confirmation into the chat as the operator's
 * message, so the presenter skill caches the bindings exactly as it would after a typed reply.
 *
 * The same tools also carry Block Kit in `_meta.slack.blocks` for the Slackbot MCP client:
 * `demoSetup` renders the card with one "Use these bindings" button whose click Slack routes
 * to `confirmDemoSetup`, and that tool's result replaces the card in place. The blocks are
 * always attached, because the stateless HTTP mode serves each request from a fresh server
 * that never saw the client's `initialize` capabilities; other hosts ignore the extra `_meta`.
 * The card never offers a loan write; those stay typed.
 */
import {
  registerAppResource,
  registerAppTool,
  RESOURCE_MIME_TYPE,
} from "@modelcontextprotocol/ext-apps/server";
import { McpServer } from "@modelcontextprotocol/server";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import {
  BINDING_KEYS,
  type Bindings,
  bindingsTable,
  emptyBindings,
  loadDefaults,
  missingBindings,
  summarizeBindings,
  validateBindings,
} from "./bindings.js";
import { confirmedBlocks, demoSetupBlocks, slackMeta, textInputsEnabled } from "./slack-blocks.js";

export const RESOURCE_URI = "ui://los-demo-setup/card.html";
export const SERVER_NAME = "LOS Demo Setup";
export const SERVER_VERSION = "0.1.0";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BUILT_CARD = path.resolve(HERE, "..", "mcp-app.html");

export interface ServerOptions {
  defaults?: Bindings;
  readCardHtml?: () => Promise<string>;
  store?: ConfirmationStore;
  /** Add free-text override inputs to the Slack card. Defaults to LOS_DEMO_SLACK_TEXT_INPUTS. */
  slackTextInputs?: boolean;
}

/** Process-wide memory of the last confirmation, shared across stateless HTTP requests. */
export class ConfirmationStore {
  private confirmed: Bindings | undefined;
  get(): Bindings | undefined {
    return this.confirmed;
  }
  set(bindings: Bindings): void {
    this.confirmed = bindings;
  }
  clear(): void {
    this.confirmed = undefined;
  }
}

export const defaultStore = new ConfirmationStore();

async function readBuiltCard(): Promise<string> {
  return fs.readFile(BUILT_CARD, "utf8");
}

const bindingsSchema = z.object({
  boxEnterpriseId: z.string().describe("Box enterprise ID"),
  creditPolicyHubId: z.string().describe("Credit Policy Hub ID"),
  docgenCommitmentLetterTemplateId: z.string().describe("Doc Gen commitment-letter template ID"),
  signerEmail: z.string().describe("Signer email"),
});

export function createServer(options: ServerOptions = {}): McpServer {
  const defaults = options.defaults ?? loadDefaults();
  const readCardHtml = options.readCardHtml ?? readBuiltCard;
  const store = options.store ?? defaultStore;
  const textInputs = options.slackTextInputs ?? textInputsEnabled();

  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION });

  const effective = () => {
    const confirmed = store.get();
    const bindings = confirmed ?? defaults;
    const missing = missingBindings(bindings);
    return { bindings, missing, complete: missing.length === 0, source: confirmed ? "confirmed" : "defaults" };
  };

  server.registerTool(
    "demoBindings",
    {
      title: "Demo bindings",
      description:
        "Returns the LOS demo's four session bindings (Box enterprise ID, Credit Policy Hub ID, " +
        "Doc Gen commitment-letter template ID, signer email) without showing anything. Call it once at " +
        "session start. If it reports complete, use the values silently and do not run Demo Setup; " +
        "only when it reports missing values, or the operator asks for Demo Setup, call demoSetup to show the card. " +
        "It writes nothing to Box or Salesforce.",
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async () => {
      const state = effective();
      const text = state.complete
        ? `Demo Setup is complete for this session (${state.source}). ${summarizeBindings(state.bindings)} Do not show Demo Setup unless the operator asks.`
        : `Demo Setup is needed: ${state.missing.join(", ")} ${state.missing.length === 1 ? "is" : "are"} not set. Call demoSetup to show the card.\n\n${bindingsTable(state.bindings)}`;
      return { content: [{ type: "text", text }], structuredContent: state };
    },
  );

  registerAppTool(
    server,
    "demoSetup",
    {
      title: "Demo Setup",
      description:
        "Shows the Demo Setup card with the four environment bindings the LOS demo needs " +
        "(Box enterprise ID, Credit Policy Hub ID, Doc Gen commitment-letter template ID, signer email) " +
        "and their defaults, for the operator to confirm or override once per session. " +
        "Call it only when demoBindings reports a missing value or the operator asks for Demo Setup; " +
        "when the defaults are complete the demo runs without it. It writes nothing to Box or Salesforce.",
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true, openWorldHint: false },
      _meta: { ui: { resourceUri: RESOURCE_URI, visibility: ["model", "app"] }, slack: { supportsBlockKit: true } },
    },
    async () => {
      const confirmed = store.get();
      const text = confirmed
        ? `Demo Setup already confirmed this session.\n\n${bindingsTable(confirmed)}\n\nThe card lets the operator change any value.`
        : `Demo Setup defaults for this environment.\n\n${bindingsTable(defaults)}\n\n` +
          "The operator confirms or overrides them on the card. If the card is not shown, ask the operator " +
          "to reply \"use these defaults\" or give replacement values, then cache the result for the session. " +
          "Loan ID and loan folder ID are resolved from the live record, not here.";
      return {
        content: [{ type: "text", text }],
        structuredContent: { defaults, confirmed: confirmed ?? null },
        _meta: slackMeta(demoSetupBlocks(confirmed ?? defaults, { confirmed: Boolean(confirmed), textInputs })),
      };
    },
  );

  registerAppTool(
    server,
    "confirmDemoSetup",
    {
      title: "Confirm Demo Setup",
      description:
        "Records the four bindings the operator confirmed for this session, from the Demo Setup card's " +
        "button or from a typed reply. Call it only with values the operator confirmed or typed; never guess " +
        "or invent a binding. It writes nothing to Box or Salesforce.",
      inputSchema: bindingsSchema,
      annotations: { readOnlyHint: true, openWorldHint: false },
      // Listed to the model as well as the app: Slack routes the card's button click here by name.
      _meta: { ui: { resourceUri: RESOURCE_URI, visibility: ["model", "app"] }, slack: { supportsBlockKit: true } },
    },
    async (args) => {
      const result = validateBindings(args);
      if (!result.ok) {
        const attempted = { ...emptyBindings(), ...(args as Partial<Bindings>) };
        return {
          isError: true,
          content: [{ type: "text", text: `Demo Setup not confirmed: ${result.errors.join(" ")}` }],
          structuredContent: { errors: result.errors },
          _meta: slackMeta(demoSetupBlocks(attempted, { textInputs, errors: result.errors })),
        };
      }
      store.set(result.bindings);
      return {
        content: [{ type: "text", text: summarizeBindings(result.bindings) }],
        structuredContent: { bindings: result.bindings, summary: summarizeBindings(result.bindings) },
        _meta: slackMeta(confirmedBlocks(result.bindings)),
      };
    },
  );

  registerAppResource(
    server,
    "Demo Setup card",
    RESOURCE_URI,
    { mimeType: RESOURCE_MIME_TYPE, _meta: { ui: { prefersBorder: true } } },
    async () => ({
      contents: [{ uri: RESOURCE_URI, mimeType: RESOURCE_MIME_TYPE, text: await readCardHtml() }],
    }),
  );

  return server;
}

export { BINDING_KEYS };
