import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { fileURLToPath } from "node:url";
import { ConfigError, loadRootEnv, readConfig, type AgentConfig, type ConnectorConfig } from "./config.js";
import { LoanAgent } from "./engine.js";
import { FixtureToolGateway } from "./fixtures.js";
import { McpToolGateway } from "./mcpTools.js";
import {
  BOX,
  FileTokenStore,
  OAuthClient,
  OAuthError,
  SALESFORCE,
  callbackPath,
  loginPath,
  type OAuthProvider,
} from "./oauth.js";
import type { ToolGateway } from "./tools.js";
import { TypeSafeClient } from "./typesafe.js";

/**
 * POST /chat             {message, sessionId, loan?} → NDJSON AgentEvent stream
 * POST /actions/resolve  {proposalId, decision, note?, sessionId} → Proposal
 * GET  /health
 * GET  /oauth/{salesforce,box}/login     → redirect to that sign-in
 * GET  /oauth/{salesforce,box}/callback  → the provider redirects back here
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
  });
}

const connectors =
  config.losMcp && config.boxMcp
    ? {
        salesforce: { config: config.losMcp, oauth: oauthClient(SALESFORCE, config.losMcp) },
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

const agent = new LoanAgent(
  tools(),
  new TypeSafeClient({
    apiKey: config.typesafe.apiKey,
    apiUrl: config.typesafe.apiUrl,
    model: config.typesafe.model,
    timeoutMs: config.typesafe.timeoutMs,
  }),
  {
    high: config.typesafe.high,
    medium: config.typesafe.medium,
    defaultSigner: config.defaultSigner,
  }
);

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
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  res.setHeader("Vary", "Origin");
}

async function chat(req: IncomingMessage, res: ServerResponse) {
  const body = await readJson(req);
  const message = requireString(body, "message");
  const sessionId = requireString(body, "sessionId", 200);
  const loan = typeof body.loan === "string" && body.loan ? body.loan : undefined;
  res.writeHead(200, { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" });
  await agent.handle(sessionId, message, loan, event => {
    if (!res.writableEnded) res.write(`${JSON.stringify(event)}\n`);
  });
  res.end();
}

async function resolveAction(req: IncomingMessage, res: ServerResponse) {
  const body = await readJson(req);
  const decision = body.decision;
  if (decision !== "approved" && decision !== "rejected") {
    throw new HttpError(400, "decision must be approved or rejected");
  }
  const note = typeof body.note === "string" ? body.note : undefined;
  try {
    const proposal = await agent.resolve(requireString(body, "sessionId", 200), requireString(body, "proposalId", 200), decision, note);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(proposal));
  } catch (error) {
    throw new HttpError(404, error instanceof Error ? error.message : "Unknown proposal");
  }
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
        })
      );
    } else if (req.method === "GET" && oauthClients.some(client => url.pathname === loginPath(client.provider))) {
      const client = oauthClients.find(entry => url.pathname === loginPath(entry.provider))!;
      res.writeHead(302, { Location: client.beginLogin(), "Cache-Control": "no-store" }).end();
    } else if (req.method === "GET" && oauthClients.some(client => url.pathname === callbackPath(client.provider))) {
      await oauthCallback(oauthClients.find(entry => url.pathname === callbackPath(entry.provider))!, url.searchParams, res);
    } else if (req.method === "POST" && url.pathname === "/chat") {
      await chat(req, res);
    } else if (req.method === "POST" && url.pathname === "/actions/resolve") {
      await resolveAction(req, res);
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
});
