import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { loadRootEnv, readConfig } from "./config.js";
import { LoanAgent } from "./engine.js";
import { FixtureToolGateway } from "./fixtures.js";
import { McpToolGateway } from "./mcpTools.js";
import type { ToolGateway } from "./tools.js";
import { TypeSafeClient } from "./typesafe.js";

/**
 * POST /chat             {message, sessionId, loan?} → NDJSON AgentEvent stream
 * POST /actions/resolve  {proposalId, decision, note?, sessionId} → Proposal
 * GET  /health
 *
 * The bearer token is the chat session ID, not a credential: this server has
 * no user auth, so it binds to localhost by default. Put it behind real auth
 * before exposing it.
 */

loadRootEnv();
const config = readConfig();

if (!config.typesafe.apiKey) {
  console.error("TYPESAFE_API_KEY is not set. Add it to the repo-root .env (see .env.sample).");
  process.exit(1);
}

function tools(): ToolGateway {
  if (config.fixtures) {
    return new FixtureToolGateway();
  }
  if (!config.losMcp.url || !config.boxMcp.url) {
    console.error("Set LOS_MCP_URL and BOX_MCP_URL, or LOAN_AGENT_FIXTURES=1 to use seeded fixtures.");
    process.exit(1);
  }
  return new McpToolGateway(
    { url: config.losMcp.url, token: config.losMcp.token },
    { url: config.boxMcp.url, token: config.boxMcp.token },
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
    boxEnterpriseId: config.boxEnterpriseId,
    docgenTemplateFileId: config.docgenTemplateFileId,
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

const server = createServer(async (req, res) => {
  cors(res);
  try {
    if (req.method === "OPTIONS") {
      res.writeHead(204).end();
    } else if (req.method === "GET" && req.url === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ ok: true, fixtures: config.fixtures }));
    } else if (req.method === "POST" && req.url === "/chat") {
      await chat(req, res);
    } else if (req.method === "POST" && req.url === "/actions/resolve") {
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
});
