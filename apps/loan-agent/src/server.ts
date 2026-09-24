import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { fileURLToPath } from "node:url";
import { CallLog, MAX_BODY_CHARS, formatCallLine, loggedFetch, redactBody, redactHeaders, truncate, type CallEntry } from "./callLog.js";
import { ConfigError, loadRootEnv, readConfig, type AgentConfig, type ConnectorConfig } from "./config.js";
import { LoanAgent } from "./engine.js";
import { FixtureToolGateway } from "./fixtures.js";
import { FileSessionStore } from "./sessionStore.js";
import { McpToolGateway } from "./mcpTools.js";
import {
  BOX,
  FileTokenStore,
  OAuthClient,
  OAuthError,
  salesforce,
  callbackPath,
  loginPath,
  type OAuthProvider,
} from "./oauth.js";
import type { DocGenCheck, ToolGateway } from "./tools.js";
import { TypeSafeClient } from "./typesafe.js";

/**
 * POST /chat             {message, sessionId, loan?} → NDJSON AgentEvent stream
 * POST /actions/resolve  {proposalId, decision, note?, sessionId} → Proposal
 * GET  /health
 * GET  /oauth/{salesforce,box}/login     → redirect to that sign-in
 * GET  /oauth/{salesforce,box}/callback  → the provider redirects back here
 * GET  /calls            → every recorded API call, newest first (credentials redacted)
 * GET  /calls/stream     → the same as server-sent events: a snapshot, then each call
 * DELETE /calls          → clear the log
 *
 * The bearer token is the chat session ID, not a credential: this server has
 * no user auth, so bind it to localhost (LOAN_AGENT_HOST). Put it behind real auth
 * before exposing it.
 */

loadRootEnv();
let config: AgentConfig;
try {
  config = readConfig();
} catch (error) {
  console.error(error instanceof ConfigError ? error.message : error);
  process.exit(1);
}

// Every call to TypeSafe, Salesforce and Box, and every chat request, for the
// API inspector and the terminal. Credentials are redacted before storage.
const calls = new CallLog();
calls.subscribe(event => {
  if (event.type === "call" && !event.entry.pending) console.log(formatCallLine(event.entry));
});

// The browser reaches the server as localhost; these exact callback URLs must
// be registered on the Salesforce External Client App and the Box integration.
const baseUrl = `http://localhost:${config.port}`;

function oauthClient(provider: OAuthProvider, connector: ConnectorConfig): OAuthClient {
  return new OAuthClient({
    provider,
    clientId: connector.clientId,
    clientSecret: connector.clientSecret,
    redirectUri: `${baseUrl}${callbackPath(provider)}`,
    loginPageUrl: `${baseUrl}${loginPath(provider)}`,
    store: new FileTokenStore(fileURLToPath(new URL(`../.data/${provider.id}-token.json`, import.meta.url))),
    // Token requests and MCP calls alike go through this fetch.
    fetch: loggedFetch(calls, provider.id),
  });
}

const connectors =
  config.losMcp && config.boxMcp
    ? {
        salesforce: { config: config.losMcp, oauth: oauthClient(salesforce(config.losMcp.loginUrl), config.losMcp) },
        box: { config: config.boxMcp, oauth: oauthClient(BOX, config.boxMcp) },
      }
    : undefined;
const oauthClients = connectors ? [connectors.salesforce.oauth, connectors.box.oauth] : [];

function tools(): ToolGateway {
  if (!connectors) {
    return new FixtureToolGateway();
  }
  return new McpToolGateway(
    { url: connectors.salesforce.config.url, fetch: connectors.salesforce.oauth.authorizedFetch },
    { url: connectors.box.config.url, fetch: connectors.box.oauth.authorizedFetch },
    config.boxEnterpriseId,
    config.docgenTemplateFileId
  );
}

const gateway = tools();

/**
 * The Doc Gen template, checked as the signed-in Box user when Box connects
 * (at startup, or right after sign-in), so a scope or sharing problem shows
 * up in the terminal and on /health, not only when the officer approves.
 * Each letter request checks again, with the loan's folder.
 */
let docgen: (DocGenCheck & { checkedAt: string }) | undefined;

async function checkDocGen() {
  try {
    const result = await gateway.checkDocGen();
    docgen = { ...result, checkedAt: new Date().toISOString() };
    for (const item of result.items) {
      console.log(item.ok ? `[docgen] Template ready: ${item.detail}` : `[docgen] ${item.detail}\n[docgen] To fix: ${item.fix}`);
    }
  } catch (error) {
    console.log(`[docgen] Not checked: ${error instanceof Error ? error.message : String(error)}`);
  }
}

const agent = new LoanAgent(
  gateway,
  new TypeSafeClient({
    apiKey: config.typesafe.apiKey,
    apiUrl: config.typesafe.apiUrl,
    model: config.typesafe.model,
    timeoutMs: config.typesafe.timeoutMs,
    fetch: loggedFetch(calls, "typesafe"),
  }),
  {
    high: config.typesafe.high,
    medium: config.typesafe.medium,
    defaultSigner: config.defaultSigner,
    // Fixture conversations never mix with live ones.
    store: new FileSessionStore(fileURLToPath(new URL(`../.data/${config.fixtures ? "sessions-fixtures" : "sessions"}.json`, import.meta.url))),
  }
);
if (agent.restored.sessions) {
  console.log(`[sessions] Restored ${agent.restored.sessions} conversation(s) and ${agent.restored.pending} pending approval(s).`);
}

const MAX_BODY = 64 * 1024;

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY) throw new HttpError(413, "Request body too large");
    chunks.push(chunk as Buffer);
  }
  try {
    const value = JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
    if (typeof value === "object" && value !== null) return value as Record<string, unknown>;
  } catch {
    // fall through
  }
  throw new HttpError(400, "Body must be a JSON object");
}

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message);
  }
}

function requireString(body: Record<string, unknown>, key: string, max = 4000): string {
  const value = body[key];
  if (typeof value !== "string" || !value.trim() || value.length > max) {
    throw new HttpError(400, `${key} must be a non-empty string of at most ${max} characters`);
  }
  return value;
}

function cors(res: ServerResponse) {
  res.setHeader("Access-Control-Allow-Origin", config.allowedOrigin);
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, DELETE, OPTIONS");
  res.setHeader("Vary", "Origin");
}

/** Records a request this server answered, like the outbound calls. */
function inbound(req: IncomingMessage, url: URL, summary: string, body: Record<string, unknown>) {
  const entry: CallEntry = {
    id: calls.nextId(),
    startedAt: Date.now(),
    durationMs: 0,
    pending: true,
    service: "agent",
    summary,
    method: req.method ?? "GET",
    url: url.href,
    requestHeaders: redactHeaders(req.headers),
    requestBody: redactBody(JSON.stringify(body), "application/json"),
    status: 0,
    statusText: "",
    responseHeaders: {},
  };
  calls.put(entry);
  return (res: ServerResponse, responseBody: string) =>
    calls.put({
      ...entry,
      pending: false,
      durationMs: Date.now() - entry.startedAt,
      status: res.statusCode,
      statusText: res.statusMessage ?? "",
      responseHeaders: redactHeaders(res.getHeaders()),
      responseBody: truncate(responseBody),
    });
}

async function chat(req: IncomingMessage, res: ServerResponse, url: URL) {
  const body = await readJson(req);
  const message = requireString(body, "message");
  const sessionId = requireString(body, "sessionId", 200);
  const loan = typeof body.loan === "string" && body.loan ? body.loan : undefined;
  const done = inbound(req, url, `chat: ${message.length > 60 ? `${message.slice(0, 60)}…` : message}`, body);
  const lines: string[] = [];
  let size = 0;
  res.writeHead(200, { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" });
  try {
    await agent.handle(sessionId, message, loan, event => {
      const line = JSON.stringify(event);
      if (size <= MAX_BODY_CHARS) {
        lines.push(line);
        size += line.length;
      }
      if (!res.writableEnded) res.write(`${line}\n`);
    });
    res.end();
  } finally {
    done(res, lines.join("\n"));
  }
}

async function resolveAction(req: IncomingMessage, res: ServerResponse, url: URL) {
  const body = await readJson(req);
  const decision = body.decision;
  if (decision !== "approved" && decision !== "rejected") {
    throw new HttpError(400, "decision must be approved or rejected");
  }
  const note = typeof body.note === "string" ? body.note : undefined;
  const done = inbound(req, url, `resolve: ${decision}`, body);
  try {
    const proposal = await agent.resolve(requireString(body, "sessionId", 200), requireString(body, "proposalId", 200), decision, note);
    const json = JSON.stringify(proposal);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(json);
    done(res, json);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown proposal";
    res.statusCode = 404;
    done(res, JSON.stringify({ error: message }));
    throw new HttpError(404, message);
  }
}

/** Server-sent events: the current log, then every change, until the page closes. */
function callStream(req: IncomingMessage, res: ServerResponse) {
  res.writeHead(200, { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-store", Connection: "keep-alive" });
  res.write(`event: snapshot\ndata: ${JSON.stringify(calls.list())}\n\n`);
  const unsubscribe = calls.subscribe(event => {
    res.write(event.type === "clear" ? "event: clear\ndata: {}\n\n" : `event: call\ndata: ${JSON.stringify(event.entry)}\n\n`);
  });
  const heartbeat = setInterval(() => res.write(": keep-alive\n\n"), 25_000);
  req.on("close", () => {
    clearInterval(heartbeat);
    unsubscribe();
  });
}

function page(res: ServerResponse, status: number, title: string, message: string) {
  const escape = (text: string) =>
    text.replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
  res.writeHead(status, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
  res.end(
    `<!doctype html><meta charset="utf-8"><title>${escape(title)}</title>` +
      `<body style="font-family:system-ui,sans-serif;max-width:32rem;margin:4rem auto;padding:0 1rem">` +
      `<h1 style="font-size:1.25rem">${escape(title)}</h1><p>${escape(message)}</p></body>`
  );
}

async function oauthCallback(oauth: OAuthClient, params: URLSearchParams, res: ServerResponse) {
  const { label } = oauth.provider;
  try {
    await oauth.completeLogin(params);
    page(res, 200, `${label} connected`, `The loan agent can now use its ${label} tools. You can close this tab.`);
    if (oauth.provider.id === "box") void checkDocGen();
  } catch (error) {
    if (!(error instanceof OAuthError)) throw error;
    page(res, 400, `${label} sign-in failed`, error.message);
  }
}

const server = createServer(async (req, res) => {
  cors(res);
  try {
    const url = new URL(req.url ?? "/", baseUrl);
    if (req.method === "OPTIONS") {
      res.writeHead(204).end();
    } else if (req.method === "GET" && url.pathname === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" }).end(
        JSON.stringify({
          ok: true,
          fixtures: config.fixtures,
          connectors: Object.fromEntries(oauthClients.map(client => [client.provider.id, client.connected ? "connected" : "not_connected"])),
          docgen: docgen ?? "not_checked",
        })
      );
    } else if (req.method === "GET" && oauthClients.some(client => url.pathname === loginPath(client.provider))) {
      const client = oauthClients.find(entry => url.pathname === loginPath(entry.provider))!;
      res.writeHead(302, { Location: client.beginLogin(), "Cache-Control": "no-store" }).end();
    } else if (req.method === "GET" && oauthClients.some(client => url.pathname === callbackPath(client.provider))) {
      await oauthCallback(oauthClients.find(entry => url.pathname === callbackPath(entry.provider))!, url.searchParams, res);
    } else if (req.method === "POST" && url.pathname === "/chat") {
      await chat(req, res, url);
    } else if (req.method === "POST" && url.pathname === "/actions/resolve") {
      await resolveAction(req, res, url);
    } else if (req.method === "GET" && url.pathname === "/calls") {
      res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" }).end(JSON.stringify(calls.list()));
    } else if (req.method === "GET" && url.pathname === "/calls/stream") {
      callStream(req, res);
    } else if (req.method === "DELETE" && url.pathname === "/calls") {
      calls.clear();
      res.writeHead(204).end();
    } else {
      throw new HttpError(404, "Not found");
    }
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    if (!res.headersSent) {
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: error instanceof Error ? error.message : "Server error" }));
    } else if (!res.writableEnded) {
      res.end();
    }
    if (status === 500) console.error(error);
  }
});

server.listen(config.port, config.host, () => {
  console.log(
    `Loan agent on http://${config.host}:${config.port} (${config.fixtures ? "fixtures" : "Box + LOS MCP"}, TypeSafe ${config.typesafe.model})`
  );
  const registerOn = { salesforce: "the LOS Claude MCP External Client App", box: "the Box MCP Server integration" };
  for (const client of oauthClients) {
    const { id, label } = client.provider;
    console.log(`${label} callback URL (register on ${registerOn[id]}): ${baseUrl}${callbackPath(client.provider)}`);
    if (!client.connected) {
      console.log(`${label} is not connected yet. Sign in: ${baseUrl}${loginPath(client.provider)}`);
    }
  }
  if (connectors?.box.oauth.connected) void checkDocGen();
});
