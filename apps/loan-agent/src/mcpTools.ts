import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { parseExtraction, parseLoanList, parseLoanPackage, type Terms } from "./los.js";
import {
  COVENANT_FIELDS,
  type CovenantFields,
  type DocgenResult,
  type MetadataHit,
  type ToolGateway,
  type WriteResult,
} from "./tools.js";

import type { FetchLike } from "./salesforceOAuth.js";

/** An endpoint and the fetch that authenticates requests to it. */
export interface ServerConfig {
  url: string;
  fetch: FetchLike;
}

/** fetch that sends a fixed bearer token. */
export function bearerFetch(token: string): FetchLike {
  return (input, init) => {
    const headers = new Headers(init?.headers);
    headers.set("Authorization", `Bearer ${token}`);
    return fetch(input, { ...init, headers });
  };
}

/** One lazily connected MCP client per server. */
class McpServer {
  private client?: Promise<Client>;

  constructor(
    private readonly name: string,
    private readonly config: ServerConfig
  ) {}

  async call(tool: string, args: Record<string, unknown>): Promise<unknown> {
    const client = await this.connect();
    const result = await client.callTool({ name: tool, arguments: args });
    const text = (result.content as Array<{ type: string; text?: string }> | undefined)
      ?.filter(part => part.type === "text")
      .map(part => part.text ?? "")
      .join("");
    if (result.isError) {
      throw new Error(`${this.name} ${tool}: ${text || "tool error"}`);
    }
    if (result.structuredContent) {
      return result.structuredContent;
    }
    try {
      return JSON.parse(text ?? "");
    } catch {
      return text;
    }
  }

  private connect(): Promise<Client> {
    this.client ??= (async () => {
      const client = new Client({ name: "acme-loan-agent", version: "0.1.0" });
      await client.connect(new StreamableHTTPClientTransport(new URL(this.config.url), { fetch: this.config.fetch }));
      return client;
    })();
    this.client.catch(() => (this.client = undefined));
    return this.client;
  }
}

export class McpToolGateway implements ToolGateway {
  private readonly los: McpServer;
  private readonly box: McpServer;

  constructor(
    los: ServerConfig,
    box: ServerConfig,
    private readonly boxEnterpriseId: string,
    private readonly docgenTemplateFileId: string
  ) {
    this.los = new McpServer("LOS", los);
    this.box = new McpServer("Box", box);
  }

  async listLoans(filter: { borrower?: string; status?: string }) {
    const values = await this.losAction("listLoans", {
      ...(filter.borrower && { inputBorrower: filter.borrower }),
      ...(filter.status && { inputStatus: filter.status }),
    });
    return parseLoanList(String(values.outputSummary ?? ""));
  }

  async getLoanPackage(loan: string) {
    return parseLoanPackage(await this.losAction("getLoanPackage", { inputLoan: loan }));
  }

  async extractLoanTerms(loanId: string, fileId: string) {
    return parseExtraction(await this.losAction("extractLoanTerms", { loanReference: loanId, itemId: fileId }));
  }

  async findByPolicyRisk(folderId: string, risk: string): Promise<MetadataHit[]> {
    const scope = `enterprise_${this.boxEnterpriseId}.losDocument`;
    const result = await this.box.call("search_files_metadata", {
      from: scope,
      query: "policyRisk = :risk",
      query_params: { risk },
      ancestor_folder_id: folderId,
      fields: ["name", `${scope}.documentType`, `${scope}.policyRisk`],
    });
    const entries = findArray(result, "entries") ?? [];
    return entries.flatMap(entry => {
      const id = stringAt(entry, "id");
      if (!id) return [];
      return [
        {
          fileId: id,
          name: stringAt(entry, "name") ?? id,
          documentType: deepString(entry, "documentType"),
          policyRisk: deepString(entry, "policyRisk"),
        },
      ];
    });
  }

  async extractCovenants(fileId: string): Promise<CovenantFields> {
    const result = await this.box.call("ai_extract_structured_from_fields", {
      file_ids: [fileId],
      fields: COVENANT_FIELDS,
    });
    const answer = findObjectWithAny(unwrapAnswer(result), COVENANT_FIELDS.map(field => field.key));
    if (!answer) return {};
    const number = (key: string) => {
      const value = Number(answer[key]);
      return answer[key] === null || answer[key] === "" || !Number.isFinite(value) ? undefined : value;
    };
    const text = (key: string) => (typeof answer[key] === "string" && answer[key] ? String(answer[key]).toLowerCase() : undefined);
    return {
      ltvMax: number("ltvMax"),
      dscrMin: number("dscrMin"),
      testFrequency: text("testFrequency"),
      guarantyType: text("guarantyType"),
      guarantyCapPerPerson: number("guarantyCapPerPerson"),
    };
  }

  async applyLoanTerms(loanId: string, terms: Terms): Promise<WriteResult> {
    return this.losWrite("applyLoanTerms", { loanReference: loanId, confirmed: true, ...terms });
  }

  async generateCommitmentLetter(input: { folderId: string; fileName: string; userInput: Record<string, unknown> }): Promise<DocgenResult> {
    const result = await this.box.call("create_docgen_batch", {
      file_id: this.docgenTemplateFileId,
      destination_folder_id: input.folderId,
      output_type: "pdf",
      document_generation_data: [{ generated_file_name: input.fileName, user_input: input.userInput }],
    });
    // Only an ID the response ties to the *output*; never the template's own file ID.
    const output = findObjectUnder(result, /^(output_file|generated_file|output)$/);
    return { outputFileId: output ? stringAt(output, "id") : undefined, raw: JSON.stringify(result) };
  }

  async prepareSignatureRequest(input: { loanId: string; fileId: string; signerEmail: string; signerName?: string }) {
    return this.losWrite("prepareSignatureRequest", {
      loanReference: input.loanId,
      itemId: input.fileId,
      signerEmail: input.signerEmail,
      ...(input.signerName && { signerName: input.signerName }),
    });
  }

  /** LOS tools are Salesforce invocable actions: `{inputs: [...]}` in, `outputValues` out. */
  private async losAction(tool: string, input: Record<string, unknown>): Promise<Record<string, unknown>> {
    const result = await this.los.call(tool, { inputs: [input] });
    const action = findObjectWithAny(result, ["outputValues"]);
    if (!action) {
      throw new Error(`LOS ${tool}: unexpected response`);
    }
    if (action.isSuccess === false) {
      throw new Error(`LOS ${tool}: ${JSON.stringify(action.errors ?? "failed")}`);
    }
    return (action.outputValues ?? {}) as Record<string, unknown>;
  }

  private async losWrite(tool: string, input: Record<string, unknown>): Promise<WriteResult> {
    const values = await this.losAction(tool, input);
    const message =
      Object.values(values).find((value): value is string => typeof value === "string" && value.length > 20) ??
      "Done.";
    const refused = Object.entries(values).some(([key, value]) => /success|applied|created/i.test(key) && value === false);
    return { ok: !refused, message };
  }
}

// ── Defensive readers for tool JSON ───────────────────────────────────────

type Json = Record<string, unknown>;

const isObject = (value: unknown): value is Json => typeof value === "object" && value !== null && !Array.isArray(value);

function walk(value: unknown, visit: (node: Json, key?: string) => boolean, key?: string): boolean {
  if (Array.isArray(value)) return value.some(item => walk(item, visit, key));
  if (!isObject(value)) return false;
  if (visit(value, key)) return true;
  return Object.entries(value).some(([childKey, child]) => walk(child, visit, childKey));
}

function findObjectWithAny(value: unknown, keys: readonly string[]): Json | undefined {
  let found: Json | undefined;
  walk(value, node => {
    if (keys.some(key => key in node)) found = node;
    return Boolean(found);
  });
  return found;
}

function findObjectUnder(value: unknown, keyPattern: RegExp): Json | undefined {
  let found: Json | undefined;
  walk(value, (node, key) => {
    if (key && keyPattern.test(key) && typeof node.id === "string") found = node;
    return Boolean(found);
  });
  return found;
}

function findArray(value: unknown, key: string): Json[] | undefined {
  let found: Json[] | undefined;
  walk(value, node => {
    if (Array.isArray(node[key])) found = (node[key] as unknown[]).filter(isObject);
    return Boolean(found);
  });
  return found;
}

function stringAt(node: Json, key: string): string | undefined {
  const value = node[key];
  return typeof value === "string" || typeof value === "number" ? String(value) : undefined;
}

function deepString(value: unknown, key: string): string | undefined {
  const node = findObjectWithAny(value, [key]);
  return node ? stringAt(node, key) : undefined;
}

/** Box AI extract answers may arrive as a JSON string under `answer`. */
function unwrapAnswer(result: unknown): unknown {
  const holder = findObjectWithAny(result, ["answer"]);
  if (holder && typeof holder.answer === "string") {
    try {
      return JSON.parse(holder.answer);
    } catch {
      return result;
    }
  }
  return result;
}
