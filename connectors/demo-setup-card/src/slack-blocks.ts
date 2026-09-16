/**
 * Block Kit for the Slackbot MCP client.
 *
 * Slack renders a tool result's `_meta.slack.blocks` as native UI and routes a click on an
 * element whose `action_id` is `tool:<name>` back to this server as a `tools/call` for that
 * tool, with the element's JSON-string `value` as the arguments. A response to that call that
 * carries new blocks replaces the card in place. The card confirms the four session bindings
 * only; it never offers a loan write.
 *
 * Only block types on Slack's allowlist for MCP responses are used here; a single disallowed
 * type makes Slack drop the whole payload (the text content still shows).
 */
import { BINDING_KEYS, BINDING_LABELS, type BindingKey, type Bindings } from "./bindings.js";

export const CONFIRM_TOOL = "confirmDemoSetup";
export const CONFIRM_ACTION_ID = `tool:${CONFIRM_TOOL}`;
/** Slack's cap on an interactive element's `value`. */
export const VALUE_LIMIT = 2000;
/** Set to 1 or true to add free-text override inputs to the card (unverified on Slack; rehearse first). */
export const TEXT_INPUTS_ENV = "LOS_DEMO_SLACK_TEXT_INPUTS";

/** Block types Slack accepts in MCP tool responses. Anything else rejects the payload in full. */
export const SLACK_ALLOWED_BLOCK_TYPES: ReadonlySet<string> = new Set([
  "context", "divider", "header", "markdown", "rich_text", "section",
  "file", "image", "video",
  "actions", "carousel", "input",
  "data_table", "data_visualization", "table",
  "card", "container",
]);

export type SlackBlock = { type: string; [key: string]: unknown };

export interface DemoSetupBlockOptions {
  /** The values shown are a confirmation already made this session. */
  confirmed?: boolean;
  /** Add one plain-text input per binding so the operator can override on the card. */
  textInputs?: boolean;
  /** Validation errors from a rejected confirmation, shown above the button. */
  errors?: string[];
}

export function textInputsEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const value = (env[TEXT_INPUTS_ENV] ?? "").trim().toLowerCase();
  return value === "1" || value === "true";
}

/**
 * The button's `value`: only the tool's arguments, as a JSON string, so the keys land in
 * `confirmDemoSetup`'s inputSchema unchanged. Slack ignores any routing fields placed here.
 */
export function serializeArguments(bindings: Bindings): string {
  const args: Partial<Bindings> = {};
  for (const key of BINDING_KEYS) args[key] = bindings[key] ?? "";
  const value = JSON.stringify(args);
  if (value.length > VALUE_LIMIT) {
    throw new Error(`Demo Setup button value is ${value.length} characters; Slack allows ${VALUE_LIMIT}.`);
  }
  return value;
}

function plain(text: string): { type: "plain_text"; text: string } {
  return { type: "plain_text", text };
}

function bindingFields(bindings: Bindings): Array<{ type: "mrkdwn"; text: string }> {
  return BINDING_KEYS.map((key) => ({
    type: "mrkdwn",
    text: `*${BINDING_LABELS[key]}*\n${bindings[key] || "_(not set)_"}`,
  }));
}

function textInputBlock(key: BindingKey, current: string): SlackBlock {
  const element: Record<string, unknown> = {
    type: "plain_text_input",
    action_id: `input:${key}`,
    placeholder: plain(BINDING_LABELS[key]),
  };
  if (current) element.initial_value = current;
  return { type: "input", block_id: `demo_setup_${key}`, label: plain(BINDING_LABELS[key]), element };
}

/** The Demo Setup card: the four bindings, an optional override form, and one confirm button. */
export function demoSetupBlocks(bindings: Bindings, options: DemoSetupBlockOptions = {}): SlackBlock[] {
  const complete = BINDING_KEYS.every((key) => (bindings[key] ?? "").trim());
  const blocks: SlackBlock[] = [
    { type: "header", text: plain(options.confirmed ? "Demo Setup (confirmed this session)" : "Demo Setup") },
    { type: "section", fields: bindingFields(bindings) },
  ];
  if (options.errors?.length) {
    blocks.push({ type: "context", elements: [{ type: "mrkdwn", text: `:warning: ${options.errors.join(" ")}` }] });
  }
  if (options.textInputs) {
    for (const key of BINDING_KEYS) blocks.push(textInputBlock(key, bindings[key] ?? ""));
  }
  if (complete || options.textInputs) {
    blocks.push({
      type: "actions",
      elements: [
        {
          type: "button",
          text: plain(options.textInputs ? "Confirm bindings" : "Use these bindings"),
          style: "primary",
          action_id: CONFIRM_ACTION_ID,
          value: serializeArguments(bindings),
        },
      ],
    });
  }
  const hint = complete
    ? "To change a value, reply in this conversation with the replacement."
    : "Reply in this conversation with the missing value to confirm.";
  blocks.push({
    type: "context",
    elements: [{ type: "mrkdwn", text: `${hint} This confirms session bindings only; the loan and its folder come from the live record.` }],
  });
  return blocks;
}

/** Replaces the card once the bindings are confirmed. No interactive element remains. */
export function confirmedBlocks(bindings: Bindings): SlackBlock[] {
  return [
    { type: "header", text: plain("Demo Setup confirmed") },
    { type: "section", fields: bindingFields(bindings) },
    {
      type: "context",
      elements: [{ type: "mrkdwn", text: "These bindings are cached for the rest of this session. The loan and its folder are resolved from the live record." }],
    },
  ];
}

/** The `_meta` fragment a tool result carries for Slack. */
export function slackMeta(blocks: SlackBlock[]): { slack: { blocks: SlackBlock[] } } {
  return { slack: { blocks } };
}
