import { execFileSync } from "node:child_process";
import type { Connect, Plugin } from "vite";

/**
 * Dev-only plugin that serves a real downscoped Box token at the Apex REST path, so the
 * workspace takes its live branch on localhost instead of falling back to fixtures.
 *
 * Without it, local development can only ever exercise the synthetic-fixture path: the
 * token endpoint is Apex and does not exist off-platform. Every live-Box defect then has
 * to be diagnosed through a deploy cycle, and because the app falls back silently, a CORS
 * rejection, a dead endpoint, and a crashed component all look identical from outside.
 *
 * The token is minted through the Salesforce CLI as the current user and held in memory
 * only -- never written to disk, so it cannot reach source control. It is re-minted
 * automatically shortly before it expires.
 *
 * Requires the localhost origin in the Box app's CORS domains; the browser calls
 * api.box.com directly, so Box rejects the folder listing otherwise.
 */

const TOKEN_PATH = "/services/apexrest/los/box-token";
const EXPIRY_MARGIN_SECONDS = 120;

interface TokenResponse {
  accessToken?: string;
  expiresIn?: number;
  folderId?: string;
  scope?: string;
  error?: string;
  message?: string;
}

interface CachedToken {
  payload: TokenResponse;
  expiresAtMs: number;
}

export interface LiveBoxOptions {
  /** Box folder id to mint against. Defaults to VITE_BOX_FOLDER_ID, the folder the page previews. */
  folderId?: string;
  /** Salesforce CLI target org alias. Defaults to LOS_ORG_ALIAS. */
  orgAlias?: string;
}

function mintToken(folderId: string, orgAlias: string): TokenResponse {
  const raw = execFileSync(
    "sf",
    ["api", "request", "rest", `${TOKEN_PATH}?folderId=${encodeURIComponent(folderId)}`, "--target-org", orgAlias],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );
  const parsed: unknown = JSON.parse(raw);
  // Salesforce returns a bare object on success and an array of errors on failure.
  return (Array.isArray(parsed) ? parsed[0] : parsed) as TokenResponse;
}

export function liveBoxToken(options: LiveBoxOptions = {}): Plugin {
  const folderId = options.folderId ?? process.env.VITE_BOX_FOLDER_ID;
  const orgAlias = options.orgAlias ?? process.env.LOS_ORG_ALIAS;
  let cached: CachedToken | null = null;

  const handler: Connect.NextHandleFunction = (req, res, next) => {
    if (!req.url?.startsWith(TOKEN_PATH)) return next();

    res.setHeader("Content-Type", "application/json");
    res.setHeader("Cache-Control", "no-store");

    if (!folderId || !orgAlias) {
      res.statusCode = 500;
      res.end(JSON.stringify({
        error: "missing_setting",
        detail: `Set ${[!folderId && "VITE_BOX_FOLDER_ID", !orgAlias && "LOS_ORG_ALIAS"].filter(Boolean).join(" and ")} in .env, then source it.`,
      }));
      return;
    }

    try {
      if (!cached || Date.now() >= cached.expiresAtMs) {
        const payload = mintToken(folderId, orgAlias);
        if (!payload.accessToken) {
          res.statusCode = 502;
          res.end(JSON.stringify({
            error: "token_mint_failed",
            detail: payload.error || payload.message || "The org returned no accessToken.",
          }));
          return;
        }
        const ttl = Math.max((payload.expiresIn || 0) - EXPIRY_MARGIN_SECONDS, 60);
        cached = { payload, expiresAtMs: Date.now() + ttl * 1000 };
        console.log(`[live-box] minted a token for folder ${folderId} via org ${orgAlias}`);
      }
      res.end(JSON.stringify(cached.payload));
    } catch (error) {
      res.statusCode = 502;
      res.end(JSON.stringify({
        error: "sf_cli_failed",
        detail: `Could not mint a token via the Salesforce CLI for org "${orgAlias}". Is it authenticated? ${String(error).slice(0, 200)}`,
      }));
    }
  };

  return {
    name: "los-live-box-token",
    apply: "serve",
    // configureServer covers `vite dev`; configurePreviewServer covers `vite preview`,
    // which serves the production build. Both are needed: dev and production bundles
    // have behaved differently here, and only the production one reproduced a real bug.
    configureServer(server) {
      server.middlewares.use(handler);
    },
    configurePreviewServer(server) {
      server.middlewares.use(handler);
    },
  };
}
