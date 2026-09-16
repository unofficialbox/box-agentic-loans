import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { describe, expect, it } from "vitest";
import {
  BINDING_KEYS,
  bindingsTable,
  loadDefaults,
  summarizeBindings,
  validateBindings,
} from "../src/bindings.js";
import { ConfirmationStore, RESOURCE_URI, createServer } from "../src/server.js";
import {
  CONFIRM_ACTION_ID,
  SLACK_ALLOWED_BLOCK_TYPES,
  VALUE_LIMIT,
  type SlackBlock,
  demoSetupBlocks,
  serializeArguments,
} from "../src/slack-blocks.js";

const DEFAULTS = {
  boxEnterpriseId: "123456",
  creditPolicyHubId: "987654321",
  docgenCommitmentLetterTemplateId: "246822413",
  signerEmail: "dana.whitfield@example.com",
};
const CARD_HTML = "<!DOCTYPE html><html><body><h1>Demo Setup</h1></body></html>";

async function connect(store = new ConfirmationStore(), defaults = DEFAULTS, extra: { slackTextInputs?: boolean } = {}) {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const server = createServer({ defaults, readCardHtml: async () => CARD_HTML, store, slackTextInputs: false, ...extra });
  await server.connect(serverTransport);
  const client = new Client({ name: "test", version: "0.0.0" });
  await client.connect(clientTransport);
  return { client, server, store };
}

function text(result: { content?: Array<{ type: string; text?: string }> }): string {
  return result.content?.find((c) => c.type === "text")?.text ?? "";
}

function blocks(result: { _meta?: unknown }): SlackBlock[] {
  return (result._meta as { slack?: { blocks?: SlackBlock[] } } | undefined)?.slack?.blocks ?? [];
}

function walk(list: SlackBlock[]): SlackBlock[] {
  return list.flatMap((block) => [block, ...walk((block.child_blocks as SlackBlock[] | undefined) ?? [])]);
}

function buttons(list: SlackBlock[]): Array<{ action_id: string; value: string }> {
  return list
    .filter((block) => block.type === "actions")
    .flatMap((block) => block.elements as Array<{ type: string; action_id: string; value: string }>)
    .filter((element) => element.type === "button");
}

describe("bindings", () => {
  it("loads file defaults and lets environment variables override them", () => {
    const tmp = `${process.env.TMPDIR ?? "/tmp"}/los-demo-defaults-${process.pid}.json`;
    const fs = require("node:fs") as typeof import("node:fs");
    fs.writeFileSync(tmp, JSON.stringify({ ...DEFAULTS, _comment: "ignored" }));
    const loaded = loadDefaults({ LOS_DEMO_SIGNER_EMAIL: "override@example.com" }, tmp);
    fs.unlinkSync(tmp);
    expect(loaded).toEqual({ ...DEFAULTS, signerEmail: "override@example.com" });
    expect(loadDefaults({}, undefined)).toEqual({
      boxEnterpriseId: "",
      creditPolicyHubId: "",
      docgenCommitmentLetterTemplateId: "",
      signerEmail: "",
    });
  });

  it("validates numeric Box IDs and the signer email", () => {
    expect(validateBindings(DEFAULTS)).toEqual({ ok: true, bindings: DEFAULTS });
    const bad = validateBindings({ ...DEFAULTS, creditPolicyHubId: "hub-1", signerEmail: "dana" });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.errors).toEqual([
      "Credit Policy Hub ID must be a numeric Box ID.",
      "Signer email must be an email address.",
    ]);
    const missing = validateBindings({});
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.errors).toHaveLength(BINDING_KEYS.length);
  });

  it("summarizes every binding and never mentions a loan write", () => {
    const summary = summarizeBindings(DEFAULTS);
    for (const value of Object.values(DEFAULTS)) expect(summary).toContain(value);
    expect(summary).not.toMatch(/\b(apply|approve|generate|sign)\b/i);
    expect(bindingsTable({ ...DEFAULTS, signerEmail: "" })).toContain("| Signer email | (not set) |");
  });
});

describe("Demo Setup MCP App server", () => {
  it("exposes demoSetup and confirmDemoSetup to the model with the card resource and Block Kit support", async () => {
    const { client } = await connect();
    const { tools } = await client.listTools();
    const byName = Object.fromEntries(tools.map((t) => [t.name, t]));
    expect(Object.keys(byName).sort()).toEqual(["confirmDemoSetup", "demoBindings", "demoSetup"]);
    expect((byName.demoBindings._meta as { ui?: unknown } | undefined)?.ui).toBeUndefined();
    const ui = (name: string) => (byName[name]._meta as { ui: { resourceUri: string; visibility?: string[] } }).ui;
    expect(ui("demoSetup").resourceUri).toBe(RESOURCE_URI);
    expect(ui("demoSetup").visibility).toEqual(["model", "app"]);
    expect(ui("confirmDemoSetup").visibility).toEqual(["model", "app"]);
    expect(byName.demoSetup.annotations?.readOnlyHint).toBe(true);
    expect(byName.confirmDemoSetup.annotations?.readOnlyHint).toBe(true);
    const slack = (name: string) => (byName[name]._meta as { slack?: { supportsBlockKit?: boolean } } | undefined)?.slack;
    expect(slack("demoSetup")?.supportsBlockKit).toBe(true);
    expect(slack("confirmDemoSetup")?.supportsBlockKit).toBe(true);
    expect(slack("demoBindings")).toBeUndefined();
  });

  it("answers silently when the defaults are complete and asks for the card only when one is missing", async () => {
    const { client, store } = await connect();
    const complete = await client.callTool({ name: "demoBindings", arguments: {} });
    expect(complete.structuredContent).toEqual({ bindings: DEFAULTS, missing: [], complete: true, source: "defaults" });
    expect(text(complete)).toContain("Do not show Demo Setup");

    const overrides = { ...DEFAULTS, signerEmail: "priya.shah@example.com" };
    await client.callTool({ name: "confirmDemoSetup", arguments: overrides });
    const confirmed = await client.callTool({ name: "demoBindings", arguments: {} });
    expect(confirmed.structuredContent).toEqual({ bindings: overrides, missing: [], complete: true, source: "confirmed" });
    expect(store.get()).toEqual(overrides);

    const partial = await connect(new ConfirmationStore(), { ...DEFAULTS, creditPolicyHubId: "" });
    const needed = await partial.client.callTool({ name: "demoBindings", arguments: {} });
    expect(needed.structuredContent).toMatchObject({ complete: false, missing: ["Credit Policy Hub ID"], source: "defaults" });
    expect(text(needed)).toContain("Call demoSetup");
  });

  it("serves the card as an MCP Apps HTML resource", async () => {
    const { client } = await connect();
    const { resources } = await client.listResources();
    expect(resources.map((r) => r.uri)).toEqual([RESOURCE_URI]);
    const read = await client.readResource({ uri: RESOURCE_URI });
    expect(read.contents[0].mimeType).toBe("text/html;profile=mcp-app");
    expect((read.contents[0] as { text: string }).text).toContain("Demo Setup");
  });

  it("returns the defaults, then the confirmation once the card confirms", async () => {
    const { client, store } = await connect();
    const before = await client.callTool({ name: "demoSetup", arguments: {} });
    expect(before.structuredContent).toEqual({ defaults: DEFAULTS, confirmed: null });
    expect(text(before)).toContain("| Signer email | dana.whitfield@example.com |");

    const rejected = await client.callTool({ name: "confirmDemoSetup", arguments: { ...DEFAULTS, boxEnterpriseId: "" } });
    expect(rejected.isError).toBe(true);
    expect(store.get()).toBeUndefined();

    const overrides = { ...DEFAULTS, signerEmail: "priya.shah@example.com" };
    const confirmed = await client.callTool({ name: "confirmDemoSetup", arguments: overrides });
    expect(confirmed.isError).toBeFalsy();
    expect(text(confirmed)).toBe(summarizeBindings(overrides));
    expect(store.get()).toEqual(overrides);

    const after = await client.callTool({ name: "demoSetup", arguments: {} });
    expect(after.structuredContent).toEqual({ defaults: DEFAULTS, confirmed: overrides });
    expect(text(after)).toContain("already confirmed");
  });
});

describe("Slack Block Kit card", () => {
  it("uses only allowed block types and one confirm button routed to confirmDemoSetup", async () => {
    const { client } = await connect();
    const result = await client.callTool({ name: "demoSetup", arguments: {} });
    const card = blocks(result);
    expect(card.length).toBeGreaterThan(0);
    expect(card.length).toBeLessThanOrEqual(50);
    for (const block of walk(card)) expect(SLACK_ALLOWED_BLOCK_TYPES.has(block.type)).toBe(true);
    const pressable = buttons(card);
    expect(pressable).toHaveLength(1);
    expect(pressable[0].action_id).toBe(CONFIRM_ACTION_ID);
    expect(typeof pressable[0].value).toBe("string");
    expect(pressable[0].value.length).toBeLessThanOrEqual(VALUE_LIMIT);
    expect(JSON.parse(pressable[0].value)).toEqual(DEFAULTS);
    expect(Object.keys(JSON.parse(pressable[0].value)).sort()).toEqual([...BINDING_KEYS].sort());
    for (const value of Object.values(DEFAULTS)) expect(JSON.stringify(card)).toContain(value);
    expect(card.some((block) => block.type === "input")).toBe(false);
  });

  it("replays the button's value as a confirmation whose result replaces the card without a button", async () => {
    const { client, store } = await connect();
    const card = blocks(await client.callTool({ name: "demoSetup", arguments: {} }));
    const args = JSON.parse(buttons(card)[0].value) as typeof DEFAULTS;
    const confirmed = await client.callTool({ name: "confirmDemoSetup", arguments: args });
    expect(confirmed.isError).toBeFalsy();
    expect(store.get()).toEqual(DEFAULTS);
    const after = blocks(confirmed);
    expect(after.length).toBeGreaterThan(0);
    for (const block of walk(after)) expect(SLACK_ALLOWED_BLOCK_TYPES.has(block.type)).toBe(true);
    expect(buttons(after)).toHaveLength(0);
    expect(after.some((block) => block.type === "actions" || block.type === "input")).toBe(false);
    expect(text(confirmed)).toBe(summarizeBindings(DEFAULTS));
  });

  it("returns the card again with the errors when a confirmation is rejected", async () => {
    const { client } = await connect();
    const rejected = await client.callTool({ name: "confirmDemoSetup", arguments: { ...DEFAULTS, signerEmail: "dana" } });
    expect(rejected.isError).toBe(true);
    const card = blocks(rejected);
    const context = card.find((block) => block.type === "context" && JSON.stringify(block).includes("Signer email"));
    expect(context).toBeDefined();
    expect(JSON.stringify(context)).toContain("must be an email address");
  });

  it("offers no button while a binding is missing and no override inputs are enabled", () => {
    const card = demoSetupBlocks({ ...DEFAULTS, creditPolicyHubId: "" });
    expect(buttons(card)).toHaveLength(0);
    expect(JSON.stringify(card)).toContain("(not set)");
  });

  it("adds one plain-text input per binding when override inputs are enabled", async () => {
    const { client } = await connect(new ConfirmationStore(), DEFAULTS, { slackTextInputs: true });
    const card = blocks(await client.callTool({ name: "demoSetup", arguments: {} }));
    const inputs = card.filter((block) => block.type === "input");
    expect(inputs).toHaveLength(BINDING_KEYS.length);
    const ids = inputs.map((block) => (block.element as { action_id: string; type: string }));
    expect(ids.every((element) => element.type === "plain_text_input")).toBe(true);
    expect(ids.map((element) => element.action_id).sort()).toEqual([...BINDING_KEYS].map((key) => `input:${key}`).sort());
    expect(buttons(card)).toHaveLength(1);
    for (const block of walk(card)) expect(SLACK_ALLOWED_BLOCK_TYPES.has(block.type)).toBe(true);
  });

  it("serializes only the four arguments as a JSON string and never mentions a loan write", () => {
    const value = serializeArguments({ ...DEFAULTS, boxEnterpriseId: " 123456 " } as typeof DEFAULTS);
    expect(JSON.parse(value)).toEqual({ ...DEFAULTS, boxEnterpriseId: " 123456 " });
    expect(JSON.stringify(demoSetupBlocks(DEFAULTS))).not.toMatch(/\b(apply|approve|generate|sign)\b/i);
  });
});
