import { fileURLToPath } from "node:url";

/** Load the repo-root .env (gitignored; see .env.sample). Shell values win. */
export function loadRootEnv(): void {
  try {
    process.loadEnvFile(fileURLToPath(new URL("../../../.env", import.meta.url)));
  } catch {
    // No .env: rely on the shell environment.
  }
}

const text = (name: string): string | undefined => {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
};

const number = (name: string, fallback: number): number => {
  const value = text(name);
  const parsed = value === undefined ? NaN : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export interface AgentConfig {
  port: number;
  host: string;
  allowedOrigin: string;
  /** Serve seeded fixtures instead of calling the Box and LOS MCP servers. */
  fixtures: boolean;
  typesafe: {
    apiKey?: string;
    apiUrl: string;
    model: string;
    timeoutMs: number;
    /** At or above: act. Between: act, flagged in the trace. Below: ask. */
    high: number;
    medium: number;
  };
  losMcp: { url?: string; token?: string };
  boxMcp: { url?: string; token?: string };
  boxEnterpriseId?: string;
  docgenTemplateFileId?: string;
  defaultSigner?: { name?: string; email: string };
}

export function readConfig(): AgentConfig {
  const signerEmail = text("LOS_DEFAULT_SIGNER_EMAIL");
  return {
    port: number("LOAN_AGENT_PORT", 8787),
    host: text("LOAN_AGENT_HOST") ?? "127.0.0.1",
    allowedOrigin: text("LOAN_AGENT_ALLOWED_ORIGIN") ?? "http://localhost:3003",
    fixtures: text("LOAN_AGENT_FIXTURES") === "1",
    typesafe: {
      apiKey: text("TYPESAFE_API_KEY"),
      apiUrl: text("TYPESAFE_API_URL") ?? "https://api.typesafe.ai/v1/systemone",
      model: text("TYPESAFE_MODEL") ?? "jev-latest",
      timeoutMs: number("TYPESAFE_TIMEOUT_MS", 30000),
      high: number("TYPESAFE_HIGH_CONFIDENCE_THRESHOLD", 0.85),
      medium: number("TYPESAFE_MEDIUM_CONFIDENCE_THRESHOLD", 0.5),
    },
    losMcp: { url: text("LOS_MCP_URL"), token: text("LOS_MCP_TOKEN") },
    boxMcp: { url: text("BOX_MCP_URL"), token: text("BOX_MCP_TOKEN") },
    boxEnterpriseId: text("BOX_ENTERPRISE_ID"),
    docgenTemplateFileId: text("LOS_DOCGEN_TEMPLATE_FILE_ID"),
    defaultSigner: signerEmail
      ? { email: signerEmail, name: text("LOS_DEFAULT_SIGNER_NAME") }
      : undefined,
  };
}
