import { createHash, randomBytes } from "node:crypto";
import { chmodSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { ActionRequiredError } from "./tools.js";

/**
 * Salesforce sign-in for the LOS MCP server: OAuth 2.0 authorization code
 * with PKCE against the "LOS Claude MCP" External Client App (PKCE required,
 * consumer secret optional, refresh tokens on). The refresh token is kept on
 * disk so a restart does not need a new sign-in; the access token is renewed
 * when the MCP server answers 401.
 */

export const SALESFORCE_LOGIN_URL = "https://login.salesforce.com";
/** Setup names for the app's two scopes (metadata: MCP, RefreshToken). */
export const SALESFORCE_SCOPES = "mcp_api refresh_token";
export const CALLBACK_PATH = "/oauth/salesforce/callback";
export const LOGIN_PATH = "/oauth/salesforce/login";

/** Pending sign-ins expire so an old state value can never be replayed. */
const PENDING_TTL_MS = 10 * 60 * 1000;

export type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export interface StoredToken {
  accessToken: string;
  refreshToken: string;
  instanceUrl: string;
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
      return value.accessToken && value.refreshToken && value.instanceUrl ? (value as StoredToken) : undefined;
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

export interface SalesforceOAuthOptions {
  clientId: string;
  redirectUri: string;
  /** Where a person goes to sign in; named in errors. */
  loginPageUrl: string;
  store: TokenStore;
  fetch?: FetchLike;
  now?: () => number;
}

export class SalesforceOAuth {
  private readonly pending = new Map<string, { verifier: string; createdAt: number }>();
  private token: StoredToken | undefined;
  private refreshing?: Promise<StoredToken>;
  private readonly fetchImpl: FetchLike;
  private readonly now: () => number;

  constructor(private readonly options: SalesforceOAuthOptions) {
    this.token = options.store.load();
    this.fetchImpl = options.fetch ?? fetch;
    this.now = options.now ?? Date.now;
  }

  get connected(): boolean {
    return Boolean(this.token);
  }

  /** Start a sign-in: the Salesforce authorize URL to send the browser to. */
  beginLogin(): string {
    this.prunePending();
    const state = base64url(randomBytes(24));
    const verifier = base64url(randomBytes(48));
    this.pending.set(state, { verifier, createdAt: this.now() });
    const url = new URL("/services/oauth2/authorize", SALESFORCE_LOGIN_URL);
    url.search = new URLSearchParams({
      response_type: "code",
      client_id: this.options.clientId,
      redirect_uri: this.options.redirectUri,
      scope: SALESFORCE_SCOPES,
      state,
      code_challenge: base64url(createHash("sha256").update(verifier).digest()),
      code_challenge_method: "S256",
    }).toString();
    return url.toString();
  }

  /** Finish a sign-in from the callback's query parameters. */
  async completeLogin(params: URLSearchParams): Promise<void> {
    const error = params.get("error");
    if (error) {
      throw new OAuthError(`Salesforce refused the sign-in: ${params.get("error_description") ?? error}`);
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
      client_id: this.options.clientId,
      redirect_uri: this.options.redirectUri,
      code_verifier: pending.verifier,
    });
    if (!body.refresh_token) {
      throw new OAuthError("Salesforce issued no refresh token. Check that the app grants the refresh_token scope.");
    }
    this.persist({ accessToken: body.access_token, refreshToken: body.refresh_token, instanceUrl: body.instance_url });
  }

  /** The current access token, or a clear instruction to sign in. */
  accessToken(): string {
    if (!this.token) {
      throw new NotConnectedError(`Salesforce isn't connected. Sign in at ${this.options.loginPageUrl}.`);
    }
    return this.token.accessToken;
  }

  /**
   * fetch for the LOS MCP transport: sends the bearer token and, on a 401,
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
      if (!current) {
        throw new NotConnectedError(`Salesforce isn't connected. Sign in at ${this.options.loginPageUrl}.`);
      }
      try {
        const body = await this.tokenRequest({
          grant_type: "refresh_token",
          refresh_token: current.refreshToken,
          client_id: this.options.clientId,
        });
        return this.persist({
          accessToken: body.access_token,
          // Salesforce keeps the refresh token unless it rotates it.
          refreshToken: body.refresh_token ?? current.refreshToken,
          instanceUrl: body.instance_url ?? current.instanceUrl,
        });
      } catch (error) {
        if (error instanceof OAuthError) {
          // Revoked or expired refresh token: forget it and ask for a new sign-in.
          this.token = undefined;
          this.options.store.clear();
          throw new NotConnectedError(`Salesforce sign-in expired. Sign in again at ${this.options.loginPageUrl}.`);
        }
        throw error;
      }
    })().finally(() => {
      this.refreshing = undefined;
    });
    return this.refreshing;
  }

  private async tokenRequest(form: Record<string, string>) {
    const response = await this.fetchImpl(new URL("/services/oauth2/token", SALESFORCE_LOGIN_URL), {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: new URLSearchParams(form).toString(),
    });
    const body = (await response.json().catch(() => ({}))) as {
      access_token?: string;
      refresh_token?: string;
      instance_url?: string;
      error?: string;
      error_description?: string;
    };
    if (!response.ok || !body.access_token) {
      throw new OAuthError(`Salesforce token request failed: ${body.error_description ?? body.error ?? response.status}`);
    }
    return body as typeof body & { access_token: string; instance_url: string };
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
