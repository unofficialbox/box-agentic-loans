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

Configuration comes from the repo-root `.env`; see `.env.sample`, section *Loan agent backend*.

```bash
npm install
npm test                 # 44 tests: rules, parsers, the TypeSafe client, the full clickpath on fixtures
npm start                # http://127.0.0.1:8787

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
| `src/server.ts` | `POST /chat` (NDJSON), `POST /actions/resolve`, `GET /health`. |

## Limits

- **No user authentication.** The bearer token is the chat session ID, not a credential, so the server binds to `127.0.0.1` by default. Put real auth in front before exposing it.
- **Unverified Box response formats.** The shapes of the Box MCP responses for `search_files_metadata`, `ai_extract_structured_from_fields`, and `create_docgen_batch` haven't been checked against a live server. They are parsed defensively. If a Doc Gen response doesn't name its output file, the agent refuses to send anything for signature rather than choosing a file by name.
- **Pricing check is partial.** SOFR isn't returned by any tool, so the pricing rule checks only the 6.50% absolute floor.
- **Guaranty check is partial.** It covers limited vs unlimited. It does not yet detect an omitted owner.
- **Sessions are in memory.** A restart drops conversations and pending approvals.
