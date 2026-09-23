import { createHash, randomBytes } from "node:crypto";
import { chmodSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { ActionRequiredError } from "./tools.js";

/**
 * OAuth 2.0 authorization-code sign-in for the two MCP connectors. The
 * refresh token is kept on disk so a restart does not need a new sign-in; the
 * access token is renewed when the MCP server answers 401.
 */

export interface OAuthProvider {
  /** Route segment and token file name: /oauth/<id>/login, .data/<id>-token.json */
  id: "salesforce" | "box";
  label: string;
  authorizeUrl: string;
  tokenUrl: string;
  /** Space-separated scopes to request. */
  scope: string;
  pkce: boolean;
}

/**
 * The "LOS Claude MCP" External Client App: PKCE required, refresh tokens on.
 * Scope names as Setup shows them (metadata: MCP, RefreshToken).
 */
export const SALESFORCE: OAuthProvider = {
  id: "salesforce",
  label: "Salesforce",
  authorizeUrl: "https://login.salesforce.com/services/oauth2/authorize",
  tokenUrl: "https://login.salesforce.com/services/oauth2/token",
  scope: "mcp_api refresh_token",
  pkce: true,
};

/**
 * Box MCP Server integration credentials (Admin Console → Integrations → Box
 * MCP Server → Integration Credentials), per developer.box.com/guides/box-mcp/setup.
 * docgen.readwrite needs Enterprise Advanced; the commitment letter uses it.
 */
export const BOX: OAuthProvider = {
  id: "box",
  label: "Box",
  authorizeUrl: "https://account.box.com/api/oauth2/authorize",
  tokenUrl: "https://api.box.com/oauth2/token",
  scope: "root_readwrite ai.readwrite docgen.readwrite",
  pkce: false,
};

export const loginPath = (provider: OAuthProvider) => `/oauth/${provider.id}/login`;
export const callbackPath = (provider: OAuthProvider) => `/oauth/${provider.id}/callback`;

/** Pending sign-ins expire so an old state value can never be replayed. */
const PENDING_TTL_MS = 10 * 60 * 1000;

export type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export interface StoredToken {
  accessToken: string;
  refreshToken: string;
}

export interface TokenStore {
  load(): StoredToken | undefined;
  save(token: StoredToken): void;
  clear(): void;
}

export class NotConnectedError extends ActionRequiredError {}
export class OAuthError extends Error {}

/** Owner-only JSON file. The directory is gitignored. */
export class FileTokenStore implements TokenStore {
  constructor(private readonly path: string) {}

  load(): StoredToken | undefined {
    try {
      const value = JSON.parse(readFileSync(this.path, "utf8")) as Partial<StoredToken>;
      return value.accessToken && value.refreshToken
        ? { accessToken: value.accessToken, refreshToken: value.refreshToken }
        : undefined;
    } catch {
      return undefined;
    }
  }

  save(token: StoredToken): void {
    mkdirSync(dirname(this.path), { recursive: true, mode: 0o700 });
    writeFileSync(this.path, JSON.stringify(token), { mode: 0o600 });
    chmodSync(this.path, 0o600);
  }

  clear(): void {
    rmSync(this.path, { force: true });
  }
}

export class MemoryTokenStore implements TokenStore {
  private token?: StoredToken;
  load() {
    return this.token;
  }
  save(token: StoredToken) {
    this.token = token;
  }
  clear() {
    this.token = undefined;
  }
}

const base64url = (buffer: Buffer) => buffer.toString("base64url");

export interface OAuthClientOptions {
  provider: OAuthProvider;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  /** Where a person goes to sign in; named in errors. */
  loginPageUrl: string;
  store: TokenStore;
  fetch?: FetchLike;
  now?: () => number;
}

export class OAuthClient {
  private readonly pending = new Map<string, { verifier?: string; createdAt: number }>();
  private token: StoredToken | undefined;
  private refreshing?: Promise<StoredToken>;
  private readonly fetchImpl: FetchLike;
  private readonly now: () => number;

  constructor(private readonly options: OAuthClientOptions) {
    this.token = options.store.load();
    this.fetchImpl = options.fetch ?? fetch;
    this.now = options.now ?? Date.now;
  }

  get provider(): OAuthProvider {
    return this.options.provider;
  }

  get connected(): boolean {
    return Boolean(this.token);
  }

  /** Start a sign-in: the provider's authorize URL to send the browser to. */
  beginLogin(): string {
    this.prunePending();
    const { provider } = this.options;
    const state = base64url(randomBytes(24));
    const verifier = provider.pkce ? base64url(randomBytes(48)) : undefined;
    this.pending.set(state, { verifier, createdAt: this.now() });
    const params = new URLSearchParams({
      response_type: "code",
      client_id: this.options.clientId,
      redirect_uri: this.options.redirectUri,
      state,
    });
    params.set("scope", provider.scope);
    if (verifier) {
      params.set("code_challenge", base64url(createHash("sha256").update(verifier).digest()));
      params.set("code_challenge_method", "S256");
    }
    return `${provider.authorizeUrl}?${params}`;
  }

  /** Finish a sign-in from the callback's query parameters. */
  async completeLogin(params: URLSearchParams): Promise<void> {
    const { label } = this.options.provider;
    const error = params.get("error");
    if (error) {
      throw new OAuthError(`${label} refused the sign-in: ${params.get("error_description") ?? error}`);
    }
    const state = params.get("state") ?? "";
    const code = params.get("code");
    this.prunePending();
    const pending = this.pending.get(state);
    // One use only, whatever happens next.
    this.pending.delete(state);
    if (!pending || !code) {
      throw new OAuthError(`This sign-in link is unknown or expired. Start again at ${this.options.loginPageUrl}.`);
    }
    const body = await this.tokenRequest({
      grant_type: "authorization_code",
      code,
      redirect_uri: this.options.redirectUri,
      ...(pending.verifier && { code_verifier: pending.verifier }),
    });
    if (!body.refresh_token) {
      throw new OAuthError(`${label} issued no refresh token. Check that the app allows refresh tokens.`);
    }
    this.persist({ accessToken: body.access_token, refreshToken: body.refresh_token });
  }

  /** The current access token, or a clear instruction to sign in. */
  accessToken(): string {
    if (!this.token) {
      throw new NotConnectedError(`${this.options.provider.label} isn't connected. Sign in at ${this.options.loginPageUrl}.`);
    }
    return this.token.accessToken;
  }

  /**
   * fetch for an MCP transport: sends the bearer token and, on a 401,
   * refreshes once and retries. Concurrent 401s share one refresh.
   */
  readonly authorizedFetch: FetchLike = async (input, init) => {
    const send = (token: string) => {
      const headers = new Headers(init?.headers);
      headers.set("Authorization", `Bearer ${token}`);
      return this.fetchImpl(input, { ...init, headers });
    };
    const response = await send(this.accessToken());
    if (response.status !== 401) {
      return response;
    }
    const renewed = await this.refresh();
    return send(renewed.accessToken);
  };

  private refresh(): Promise<StoredToken> {
    this.refreshing ??= (async () => {
      const current = this.token;
      const { label } = this.options.provider;
      if (!current) {
        throw new NotConnectedError(`${label} isn't connected. Sign in at ${this.options.loginPageUrl}.`);
      }
      try {
        const body = await this.tokenRequest({ grant_type: "refresh_token", refresh_token: current.refreshToken });
        // Box rotates the refresh token on every use; Salesforce usually keeps it.
        return this.persist({ accessToken: body.access_token, refreshToken: body.refresh_token ?? current.refreshToken });
      } catch (error) {
        if (error instanceof OAuthError) {
          // Revoked or expired refresh token: forget it and ask for a new sign-in.
          this.token = undefined;
          this.options.store.clear();
          throw new NotConnectedError(`${label} sign-in expired. Sign in again at ${this.options.loginPageUrl}.`);
        }
        throw error;
      }
    })().finally(() => {
      this.refreshing = undefined;
    });
    return this.refreshing;
  }

  private async tokenRequest(form: Record<string, string>) {
    const response = await this.fetchImpl(this.options.provider.tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: new URLSearchParams({
        ...form,
        client_id: this.options.clientId,
        client_secret: this.options.clientSecret,
      }).toString(),
    });
    const body = (await response.json().catch(() => ({}))) as {
      access_token?: string;
      refresh_token?: string;
      error?: string;
      error_description?: string;
    };
    if (!response.ok || !body.access_token) {
      throw new OAuthError(
        `${this.options.provider.label} token request failed: ${body.error_description ?? body.error ?? response.status}`
      );
    }
    return body as typeof body & { access_token: string };
  }

  private persist(token: StoredToken): StoredToken {
    this.token = token;
    this.options.store.save(token);
    return token;
  }

  private prunePending() {
    const cutoff = this.now() - PENDING_TTL_MS;
    for (const [state, entry] of this.pending) {
      if (entry.createdAt < cutoff) this.pending.delete(state);
    }
  }
}
