import { createHash } from "node:crypto";
import { mkdtempSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  BOX,
  FileTokenStore,
  MemoryTokenStore,
  NotConnectedError,
  OAuthClient,
  OAuthError,
  SALESFORCE,
  callbackPath,
  loginPath,
  type FetchLike,
  type OAuthProvider,
} from "../src/oauth.js";

const BASE = "http://localhost:8787";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function setup(
  fetchImpl: FetchLike,
  options: { provider?: OAuthProvider; now?: () => number; store?: MemoryTokenStore } = {}
) {
  const provider = options.provider ?? SALESFORCE;
  const store = options.store ?? new MemoryTokenStore();
  const oauth = new OAuthClient({
    provider,
    clientId: "example-client",
    clientSecret: "example-secret",
    redirectUri: BASE + callbackPath(provider),
    loginPageUrl: BASE + loginPath(provider),
    store,
    fetch: fetchImpl,
    now: options.now,
  });
  return { oauth, store };
}

const formOf = (call: unknown[]) => new URLSearchParams(String((call[1] as RequestInit).body));

async function signIn(oauth: OAuthClient) {
  const state = new URL(oauth.beginLogin()).searchParams.get("state")!;
  await oauth.completeLogin(new URLSearchParams({ code: "auth-code", state }));
}

describe("routes", () => {
  it("gives each connector its own login and callback path", () => {
    expect([loginPath(SALESFORCE), callbackPath(SALESFORCE)]).toEqual(["/oauth/salesforce/login", "/oauth/salesforce/callback"]);
    expect([loginPath(BOX), callbackPath(BOX)]).toEqual(["/oauth/box/login", "/oauth/box/callback"]);
  });
});

describe("Salesforce sign-in", () => {
  it("builds a PKCE authorize URL for the LOS app", () => {
    const { oauth } = setup(vi.fn());
    const url = new URL(oauth.beginLogin());
    expect(url.origin + url.pathname).toBe("https://login.salesforce.com/services/oauth2/authorize");
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      response_type: "code",
      client_id: "example-client",
      redirect_uri: `${BASE}/oauth/salesforce/callback`,
      scope: "mcp_api refresh_token",
      code_challenge_method: "S256",
    });
    expect(url.searchParams.get("state")).toMatch(/^[\w-]{32}$/);
    expect(url.searchParams.has("client_secret")).toBe(false);
  });

  it("exchanges the code with the client secret and the verifier that matches the challenge", async () => {
    const fetchImpl = vi.fn(async (_input: string | URL | Request, _init?: RequestInit) => json(200, { access_token: "example-access", refresh_token: "example-refresh" }));
    const { oauth, store } = setup(fetchImpl);
    const authorize = new URL(oauth.beginLogin());
    await oauth.completeLogin(new URLSearchParams({ code: "auth-code", state: authorize.searchParams.get("state")! }));

    expect(String(fetchImpl.mock.calls[0][0])).toBe("https://login.salesforce.com/services/oauth2/token");
    const form = formOf(fetchImpl.mock.calls[0]);
    expect(form.get("grant_type")).toBe("authorization_code");
    expect(form.get("redirect_uri")).toBe(`${BASE}/oauth/salesforce/callback`);
    expect(form.get("client_id")).toBe("example-client");
    expect(form.get("client_secret")).toBe("example-secret");
    const challenge = createHash("sha256").update(form.get("code_verifier")!).digest("base64url");
    expect(challenge).toBe(authorize.searchParams.get("code_challenge"));
    expect(store.load()).toEqual({ accessToken: "example-access", refreshToken: "example-refresh" });
    expect(oauth.connected).toBe(true);
  });

  it("accepts each state once, and not after it expires", async () => {
    const fetchImpl = vi.fn(async (_input: string | URL | Request, _init?: RequestInit) => json(200, { access_token: "example-access", refresh_token: "example-refresh" }));
    let now = 0;
    const { oauth } = setup(fetchImpl, { now: () => now });
    const state = new URL(oauth.beginLogin()).searchParams.get("state")!;
    await oauth.completeLogin(new URLSearchParams({ code: "c", state }));
    await expect(oauth.completeLogin(new URLSearchParams({ code: "c", state }))).rejects.toThrow(OAuthError);

    const late = new URL(oauth.beginLogin()).searchParams.get("state")!;
    now += 11 * 60 * 1000;
    await expect(oauth.completeLogin(new URLSearchParams({ code: "c", state: late }))).rejects.toThrow(/unknown or expired/);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("reports the provider's own error, and insists on a refresh token", async () => {
    const { oauth } = setup(vi.fn(async () => json(200, { access_token: "example-access" })));
    await expect(oauth.completeLogin(new URLSearchParams({ error: "access_denied", error_description: "user denied" }))).rejects.toThrow(/user denied/);
    await expect(signIn(oauth)).rejects.toThrow(/no refresh token/);
    expect(oauth.connected).toBe(false);
  });
});

describe("Box sign-in", () => {
  it("builds a Box authorize URL with the MCP scopes and no PKCE", () => {
    const { oauth } = setup(vi.fn(), { provider: BOX });
    const url = new URL(oauth.beginLogin());
    expect(url.origin + url.pathname).toBe("https://account.box.com/api/oauth2/authorize");
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      response_type: "code",
      client_id: "example-client",
      redirect_uri: `${BASE}/oauth/box/callback`,
      scope: "root_readwrite ai.readwrite docgen.readwrite",
    });
    expect(url.searchParams.has("code_challenge")).toBe(false);
  });

  it("exchanges the code at Box with the client secret", async () => {
    const fetchImpl = vi.fn(async (_input: string | URL | Request, _init?: RequestInit) => json(200, { access_token: "example-access", refresh_token: "example-refresh" }));
    const { oauth, store } = setup(fetchImpl, { provider: BOX });
    await signIn(oauth);
    expect(String(fetchImpl.mock.calls[0][0])).toBe("https://api.box.com/oauth2/token");
    const form = formOf(fetchImpl.mock.calls[0]);
    expect(form.get("client_secret")).toBe("example-secret");
    expect(form.has("code_verifier")).toBe(false);
    expect(store.load()?.refreshToken).toBe("example-refresh");
  });

  it("saves the rotated refresh token Box returns", async () => {
    const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      if (String(input) === "https://api.box.com/oauth2/token") {
        return new URLSearchParams(String(init?.body)).get("grant_type") === "refresh_token"
          ? json(200, { access_token: "example-access-2", refresh_token: "example-refresh-2" })
          : json(200, { access_token: "example-access-1", refresh_token: "example-refresh-1" });
      }
      const auth = new Headers(init?.headers).get("Authorization");
      return new Response("", { status: auth === "Bearer example-access-1" ? 401 : 200 });
    });
    const { oauth, store } = setup(fetchImpl, { provider: BOX });
    await signIn(oauth);
    expect((await oauth.authorizedFetch("https://mcp.example")).status).toBe(200);
    const refresh = fetchImpl.mock.calls.map(formOf).find(form => form.get("grant_type") === "refresh_token")!;
    expect(refresh.get("refresh_token")).toBe("example-refresh-1");
    expect(refresh.get("client_secret")).toBe("example-secret");
    expect(store.load()).toEqual({ accessToken: "example-access-2", refreshToken: "example-refresh-2" });
  });
});

describe("authorized fetch", () => {
  it("asks for a sign-in before it has a token", () => {
    const { oauth } = setup(vi.fn(), { provider: BOX });
    expect(() => oauth.accessToken()).toThrow(NotConnectedError);
    expect(() => oauth.accessToken()).toThrow(`Box isn't connected. Sign in at ${BASE}/oauth/box/login`);
  });

  it("sends the bearer token, and on 401 refreshes once and retries", async () => {
    const seen: string[] = [];
    const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/services/oauth2/token")) {
        const form = new URLSearchParams(String(init?.body));
        return form.get("grant_type") === "refresh_token"
          ? json(200, { access_token: "example-access-2" })
          : json(200, { access_token: "example-access-1", refresh_token: "example-refresh" });
      }
      const auth = new Headers(init?.headers).get("Authorization")!;
      seen.push(auth);
      return new Response("", { status: auth === "Bearer example-access-1" ? 401 : 200 });
    });
    const { oauth, store } = setup(fetchImpl);
    await signIn(oauth);

    const [a, b] = await Promise.all([oauth.authorizedFetch("https://mcp.example"), oauth.authorizedFetch("https://mcp.example")]);
    expect([a.status, b.status]).toEqual([200, 200]);
    expect(seen.filter(h => h === "Bearer example-access-2")).toHaveLength(2);
    const refreshes = fetchImpl.mock.calls.filter(call => formOf(call).get("grant_type") === "refresh_token");
    expect(refreshes).toHaveLength(1);
    // Salesforce keeps the refresh token when it doesn't send a new one.
    expect(store.load()?.refreshToken).toBe("example-refresh");
  });

  it("forgets a revoked refresh token and asks for a new sign-in", async () => {
    const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      if (!String(input).endsWith("/services/oauth2/token")) return new Response("", { status: 401 });
      return new URLSearchParams(String(init?.body)).get("grant_type") === "refresh_token"
        ? json(400, { error: "invalid_grant", error_description: "expired access/refresh token" })
        : json(200, { access_token: "example-access", refresh_token: "example-refresh" });
    });
    const { oauth, store } = setup(fetchImpl);
    await signIn(oauth);
    await expect(oauth.authorizedFetch("https://mcp.example")).rejects.toThrow(/sign-in expired/);
    expect(oauth.connected).toBe(false);
    expect(store.load()).toBeUndefined();
  });
});

describe("FileTokenStore", () => {
  it("keeps the token owner-only and survives a restart", () => {
    const path = join(mkdtempSync(join(tmpdir(), "oauth-token-")), ".data", "box-token.json");
    const store = new FileTokenStore(path);
    store.save({ accessToken: "example-access", refreshToken: "example-refresh" });
    expect(statSync(path).mode & 0o777).toBe(0o600);
    expect(new FileTokenStore(path).load()?.refreshToken).toBe("example-refresh");
    store.clear();
    expect(new FileTokenStore(path).load()).toBeUndefined();
  });
});
