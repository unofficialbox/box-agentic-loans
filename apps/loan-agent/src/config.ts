import { fileURLToPath } from "node:url";

/** Load the repo-root .env (gitignored; see .env.sample). Shell values win. */
export function loadRootEnv(): void {
  try {
    process.loadEnvFile(fileURLToPath(new URL("../../../.env", import.meta.url)));
  } catch {
    // No .env file: the settings must then come from the shell.
  }
}

export class ConfigError extends Error {}

/** The connectors' fixed endpoints (MCP Streamable HTTP). */
export const LOS_MCP_URL = "https://api.salesforce.com/platform/mcp/v1/custom/LOSLoanTools";
export const BOX_MCP_URL = "https://mcp.box.com";

/**
 * Reads settings with no defaults: a required setting that is missing or
 * malformed is collected, and `check()` reports them all at once.
 */
class EnvReader {
  private readonly problems: string[] = [];

  constructor(private readonly env: NodeJS.ProcessEnv) {}

  optional(name: string): string | undefined {
    const value = this.env[name]?.trim();
    return value ? value : undefined;
  }

  required(name: string): string {
    const value = this.optional(name);
    if (value === undefined) {
      this.problems.push(`${name} is not set`);
      return "";
    }
    return value;
  }

  number(name: string): number {
    const raw = this.required(name);
    const value = Number(raw);
    if (raw && !Number.isFinite(value)) {
      this.problems.push(`${name} must be a number`);
    }
    return value;
  }

  check(): void {
    if (this.problems.length) {
      throw new ConfigError(
        `Missing or invalid settings in .env (see .env.sample):\n  ${this.problems.join("\n  ")}`
      );
    }
  }
}

export interface TypeSafeConfig {
  apiKey: string;
  apiUrl: string;
  model: string;
  timeoutMs: number;
  /** At or above: act. Between: act, flagged in the trace. Below: ask. */
  high: number;
  medium: number;
}

export interface AgentConfig {
  port: number;
  host: string;
  allowedOrigin: string;
  /** Serve seeded fixtures instead of calling the Box and LOS MCP servers. */
  fixtures: boolean;
  typesafe: TypeSafeConfig;
  /** Unset in fixtures mode. */
  losMcp?: { url: string; token: string };
  boxMcp?: { url: string; token: string };
  boxEnterpriseId: string;
  docgenTemplateFileId: string;
  /** Optional by design: without it the agent asks who should sign. */
  defaultSigner?: { name?: string; email: string };
}

function typesafe(read: EnvReader): TypeSafeConfig {
  return {
    apiKey: read.required("TYPESAFE_API_KEY"),
    apiUrl: read.required("TYPESAFE_API_URL"),
    model: read.required("TYPESAFE_MODEL"),
    timeoutMs: read.number("TYPESAFE_TIMEOUT_MS"),
    high: read.number("TYPESAFE_HIGH_CONFIDENCE_THRESHOLD"),
    medium: read.number("TYPESAFE_MEDIUM_CONFIDENCE_THRESHOLD"),
  };
}

/** Just the TypeSafe settings, for tools that only call TypeSafe. */
export function readTypeSafeConfig(env: NodeJS.ProcessEnv = process.env): TypeSafeConfig {
  const read = new EnvReader(env);
  const config = typesafe(read);
  read.check();
  return config;
}

export function readConfig(env: NodeJS.ProcessEnv = process.env): AgentConfig {
  const read = new EnvReader(env);
  const fixtures = read.optional("LOAN_AGENT_FIXTURES") === "1";
  const mcp = (url: string, tokenName: "LOS_MCP_TOKEN" | "BOX_MCP_TOKEN") =>
    fixtures ? undefined : { url, token: read.required(tokenName) };
  const signerEmail = read.optional("LOS_DEFAULT_SIGNER_EMAIL");

  const config: AgentConfig = {
    port: read.number("LOAN_AGENT_PORT"),
    host: read.required("LOAN_AGENT_HOST"),
    allowedOrigin: read.required("LOAN_AGENT_ALLOWED_ORIGIN"),
    fixtures,
    typesafe: typesafe(read),
    losMcp: mcp(LOS_MCP_URL, "LOS_MCP_TOKEN"),
    boxMcp: mcp(BOX_MCP_URL, "BOX_MCP_TOKEN"),
    boxEnterpriseId: read.required("BOX_ENTERPRISE_ID"),
    docgenTemplateFileId: read.required("LOS_DOCGEN_TEMPLATE_FILE_ID"),
    defaultSigner: signerEmail ? { email: signerEmail, name: read.optional("LOS_DEFAULT_SIGNER_NAME") } : undefined,
  };
  read.check();
  return config;
}
