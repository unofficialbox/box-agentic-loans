# Loan agent: TypeSafe instead of an LLM

The backend for the Loan Copilot chat ([apps/agent-chat](../agent-chat/README.md)). No LLM plans, calls tools, or writes replies. The agent does four things on each turn:

1. **Decide.** TypeSafe System One picks **one intent** from a fixed set (`INTENTS` in `src/understand.ts`). A `choice` answer can only be one of the keys we offer, so TypeSafe cannot invent a tool, an argument, or an action.
2. **Resolve arguments by rule.**
   - Loan IDs and record IDs are found by regex.
   - A borrower named in the message is matched against LOS borrowers.
   - "Latest loan" means the newest ID in an active status.
   - Documents are matched by file name.
   - Explicit values ("rate at 6.75%") are parsed from the message.

   TypeSafe is asked again only to break a tie, for example two files that both look like term sheets. If nothing resolves, the agent asks instead of guessing.
3. **Run a fixed tool program per intent** against the LOS and Box MCP servers, then check the results against **credit policy in code** (`src/policy.ts`, which encodes `sample-data/policies/approved`). Every finding cites its policy ID.
4. **Render from templates.** The reply text, citations, and approval cards are built in code.

Writes (`applyLoanTerms`, `create_docgen_batch`, `prepareSignatureRequest`) never run during a turn. They become approval cards and run only from `POST /actions/resolve`, once, and only for the same session.

## What is and isn't deterministic

| Step | Deterministic? |
|---|---|
| Argument rules, policy checks, reply text, tool sequence per intent | Yes. Pure code, unit-tested. The test suite replays the clickpath and checks that the output is byte-identical. |
| TypeSafe routing | Bounded: the answer is always one of our keys, and it comes with a confidence score. Below `TYPESAFE_MEDIUM_CONFIDENCE_THRESHOLD` the agent asks instead of acting. Between medium and high, it acts and flags the trace step. Identical questions are cached for the life of the process. Whether `jev-latest` gives the same answer across calls hasn't been measured yet: run `npm run check:typesafe` once you have a key. |
| Reading PDFs (`extractLoanTerms`, covenant extraction) | No. This is Box AI, the one model in the loop, and nothing else can read an unstructured document. It returns **typed fields**, not prose. Those fields go into the rules, and the record comparison comes from the LOS tool itself. |

## Run

Configuration comes from the repo-root `.env`; see `.env.sample`, section *Loan agent backend*. There are no defaults in code: the server refuses to start and lists every missing or invalid setting.

### Connector sign-in

The agent signs in to both MCP servers itself with the OAuth 2.0 authorization-code flow, so no access token is pasted into `.env`. Each connector needs its URL, client ID and client secret in `.env`; `.env.sample` has the URLs filled in.

| Connector | `.env` settings | Where the client ID and secret come from | Callback URL to register | Sign in at |
|---|---|---|---|---|
| Salesforce LOS tools | `LOS_MCP_URL`, `LOS_MCP_CLIENT_ID`, `LOS_MCP_CLIENT_SECRET`, `LOS_MCP_LOGIN_URL` | Setup → External Client App Manager → **LOS Claude MCP** → Settings → OAuth (consumer key and secret); `LOS_MCP_LOGIN_URL` is the org's My Domain URL (Setup → My Domain), e.g. `https://<my-domain>.my.salesforce.com` | `http://localhost:<LOAN_AGENT_PORT>/oauth/salesforce/callback` | `/oauth/salesforce/login` |
| Box MCP server | `BOX_MCP_URL`, `BOX_MCP_CLIENT_ID`, `BOX_MCP_CLIENT_SECRET` | Box Admin Console → Integrations → **Box MCP Server** → Integration Credentials ([guide](https://developer.box.com/guides/box-mcp/setup)) | `http://localhost:<LOAN_AGENT_PORT>/oauth/box/callback` | `/oauth/box/login` |

1. **Register the callback URL** on the app in the table. The server prints each exact URL at startup.
2. **Set the credentials** in `.env`. For Salesforce, the signing-in user needs the `LOS_MCP_Client` permission set and must be pre-authorized on the app. For Box, enable read and write tools for Box AI and Box Doc Gen on the Box MCP Server integration; the agent asks for `root_readwrite ai.readwrite docgen.readwrite`.
3. **Sign in.** Start the server and open each login link, e.g. `http://localhost:<LOAN_AGENT_PORT>/oauth/box/login`.

Salesforce sign-in goes to the org's My Domain (`LOS_MCP_LOGIN_URL`), not `login.salesforce.com`, and uses PKCE as well as the client secret. How the tokens are handled:
- **Stored on disk.** They go in `apps/loan-agent/.data/salesforce-token.json` and `.data/box-token.json`, which are owner-only and gitignored, so a restart doesn't need a new sign-in.
- **Renewed automatically.** The access token is refreshed when the MCP server answers 401. Box rotates the refresh token on every refresh; the new one is saved.
- **Revoked refresh token.** The agent forgets it and asks you to sign in again.
- **Not signed in yet.** Every step that needs that connector replies with its sign-in link, and `/health` reports `"connectors": {"salesforce": ..., "box": ...}` as `connected` or `not_connected`.

```bash
npm install
npm test                 # 72 tests: rules, parsers, the TypeSafe client, the full clickpath on fixtures
npm start                # http://LOAN_AGENT_HOST:LOAN_AGENT_PORT

# Without MCP access, TypeSafe still decides but the tools are seeded fixtures:
LOAN_AGENT_FIXTURES=1 npm start

# Measure how consistent TypeSafe routing is (needs TYPESAFE_API_KEY):
npm run check:typesafe -- 5
```

Point the chat app at it with `VITE_AGENT_API_URL=http://localhost:8787`.

Each `/chat` response streams the wire contract described in the agent-chat README:
- a `context` event naming the loan the agent resolved
- the intent's plan as `todos`, advanced at each phase
- next-step `options`, or the two likeliest intents when it asks for clarification
- a closing `done`

Events are numbered with `seq`.

### API call log

The agent records every HTTP call it makes and serves, for debugging and demos:
- **Outbound:** TypeSafe System One requests, Salesforce and Box MCP traffic (`initialize`, `tools/call <tool>`, the event stream), and OAuth token exchanges and refreshes.
- **Inbound:** each `POST /chat` (with the NDJSON events it streamed back) and `POST /actions/resolve`.

Each entry has the method, URL, status, timing, and request and response headers and bodies. Credentials are removed before anything is stored: `Authorization` headers, cookies, and any `access_token`, `refresh_token`, `client_secret`, `code` or `code_verifier` value. The log is in memory only (the latest 300 calls) and is cleared on restart.

Where to see it:
- **Terminal:** one line per finished call, e.g. `[api] 200    41ms  box        POST   tools/call search_files_metadata`.
- **Chat UI:** the **API inspector** shelf at the bottom of the Loan Copilot page (live mode only).
- **HTTP:** `GET /calls` (JSON, newest first), `GET /calls/stream` (server-sent events: a snapshot, then each call), `DELETE /calls` (clear).

The log holds loan data from your org, so keep the server on localhost.

## Layout

| File | Role |
|---|---|
| `src/engine.ts` | The turn loop: route, resolve, run the tools, apply the rules, render. Also holds proposals and sessions. |
| `src/understand.ts` | The intent menu and the argument rules. |
| `src/typesafe.ts` | REST client (no SDK). It rejects any answer outside the offered keys and caches identical questions. |
| `src/policy.ts` | Credit policy rules for LTV, DSCR, pricing, and guaranty. |
| `src/los.ts` | Parsers for the LOS invocable actions' output summaries. |
| `src/mcpTools.ts` | Box and LOS over MCP Streamable HTTP. |
| `src/fixtures.ts` | Seeded Harborview data in the real response formats. |
| `src/server.ts` | `POST /chat` (NDJSON), `POST /actions/resolve`, `GET /health`, the OAuth sign-in routes for both connectors, and the `/calls` log endpoints. |
| `src/callLog.ts` | The API call log: a logging `fetch` for every outbound call, credential redaction, and the terminal line. |
| `src/oauth.ts` | OAuth sign-in (Salesforce with PKCE, Box), token files, and the refreshing fetch for both MCP connections. |

## Limits

- **No user authentication.** The bearer token is the chat session ID, not a credential, so keep `LOAN_AGENT_HOST=127.0.0.1`. Put real auth in front before exposing it.
- **Unverified Box response formats.** The shapes of the Box MCP responses for `search_files_metadata`, `ai_extract_structured_from_fields`, and `create_docgen_batch` haven't been checked against a live server. They are parsed defensively. If a Doc Gen response doesn't name its output file, the agent refuses to send anything for signature rather than choosing a file by name.
- **Pricing check is partial.** SOFR isn't returned by any tool, so the pricing rule checks only the 6.50% absolute floor.
- **Guaranty check is partial.** It covers limited vs unlimited. It does not yet detect an omitted owner.
- **Sessions are in memory.** A restart drops conversations and pending approvals.
