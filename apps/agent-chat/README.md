# Loan Copilot chat

A loan officer's chat for the Harborview demo. The conversation runs on the headless `AgentChatController` from the [box-open-elements agent-chat pattern](https://unofficialbox.github.io/box-open-elements/patterns/agent-chat/). The controller owns the messages, streaming, stop and approvals. The page renders the thread itself (`LoanCopilot.tsx`, `useConversation.ts`), so each reply can carry more than text:
- **Progress line.** Above each reply, a line names the step in flight while the agent works ("Extract terms with Box AI…"). When it finishes, the line reads "Worked for 2.4 s", like Claude and Perplexity. Open it to see the plan and every step: routing, tool calls and approval holds, each with its timing. It is collapsed by default.
- **Results as structure, not text.** The reply is a sentence or two. Its detail arrives as `block` events, rendered as:
  - label/value **facts** (extracted terms)
  - **checks** with a verdict in words and a status icon (credit policy)
  - **tables** (record comparison, covenant precedent, loan lists), with rows that depart from the norm marked and explained
  - **documents** that open in Box
- **Sources.** Quiet tags under the reply. The first three show; the rest sit behind "N more". A file already shown as a document isn't repeated.
- **Approval card.** One card per governed action ("Needs your approval"), with Approve as the primary action. Nothing runs until then. Once decided, it settles into a quiet record.
- **Next steps.** After the latest reply, chips offer what to do next. None show while an approval is waiting.
- **Top bar.** Shows the loan in context, plus a "Demo script" tag in demo mode.
- **Welcome state.** Before the first message: a greeting by the time of day ("Good evening. Which loan are we working on?"), what the copilot does, and four ways in as a list of rows (from `src/prompts.ts`), on the same left edge as the conversation that replaces them.
- **One column.** A single centred column at a reading measure, with the composer docked under it. Enter sends and Shift+Enter adds a line. While a reply streams, the send button becomes Stop. The thread follows new content to the bottom, and stops following while you scroll up to read.
- **No developer tooling on the page.** In live mode a quiet **API calls ↗** link in the top bar opens the API console (below) in its own tab.

Every status uses one 16px icon family (`StatusIcon.tsx`), always with text beside it, so colour is never the only signal.

Design principles, from Apple's HIG (clarity, deference, consistency), Linear's calmer 2025 interface (little colour, colour for meaning), and agentic-UX practice (plans visible, steps collapsed until wanted, approval before any write):
- the conversation is the content; chrome defers to it, and the work behind a reply is one click away rather than always on screen
- colour means something: blue for the primary action, amber for "waiting on you", green for done, red for failed
- one button system (pill, 13px semibold, 32px or 28px) and one status icon family
- nothing competes with an action awaiting approval
- developer tooling is a separate page, never mixed into the officer's

Identity: Acme Bank's own voice on Box's system, not a generic AI chat:
- the mark is an arch on a plinth, a bank's doorway (`BrandMark.tsx`, `public/acme-mark.svg`), in place of an AI sparkle and gradient
- the wordmark sets "Acme Bank" in Source Serif 4, with the product name in the sans beside it
- the serif carries the bank's voice in a few places only (the wordmark and the greeting); everything you read and use is Lato

Styling follows Box's Blueprint design system:
- Lato at 14px on a 20px line
- the 4px spacing scale, Blueprint radii and drop shadows
- Box's blue as the one accent, for the mark, links and the primary action

```bash
npm install
npm run dev        # http://localhost:3003 (developer tools: /devtools.html)
npm test           # transport, NDJSON, progress, greeting and call-log unit tests
npm run build
```

The loan comes from `?recordId=` or `?loan=` in the URL when the page is opened on one. Otherwise the backend resolves it from the conversation ("latest loan for Harborview") and reports it in a `context` event.

## Demo vs live

- **Demo script (default).** When `VITE_AGENT_API_URL` is empty, `DemoLoanAgentTransport` replays the six clickpath beats offline. It uses figures from the seeded Harborview sample data and matches prompts by keyword. The routing step in the trace is labelled as simulated. Approving a card makes no write.
- **Live agent.** Set `VITE_AGENT_API_URL` in the repo-root `.env` (see `.env.sample`; Vite reads `envDir: ../..`), and `HttpLoanAgentTransport` talks to a backend over the contract below. Only `VITE_` values reach the browser. Keep `TYPESAFE_API_KEY`, Box, and Salesforce credentials in the backend.

## API console (developer tools)

The API console is a page of its own, `devtools.html`, so the officer's page carries no tooling. In live mode, open it from **API calls ↗** in the top bar (it opens in a separate tab you can keep beside the copilot), or go to `/devtools.html`. It shows every call the loan agent makes to TypeSafe, Salesforce and Box, plus each chat request, live from the backend's `GET /calls/stream`. The layout follows the HTTP inspector in [box-cmis-lab](https://github.com/unofficialbox/box-cmis-lab), with the same tokens, type and controls as the copilot (light or dark):
- the list shows status, service, the call (e.g. `tools/call getLoanPackage`) and time in ms, newest first
- select a row to see its URL and its request and response headers and bodies
- **Copy request**, **Copy response** or **Copy both** puts the call on the clipboard as HTTP-style text (request or status line, headers, blank line, body), already redacted
- each code block (request or response headers or body) has a copy icon in its corner that copies exactly what the block shows
- filter by service or errors, or **Clear** the log (`DELETE /calls`)
- drag the divider (or focus it and use the arrow keys) to resize the list; the split is remembered in this browser. On a narrow window the list sits above the details.

If the agent answers but has no call log (it is still running code from before the console), the page says to restart it instead of retrying. Credentials are redacted by the backend before they reach the page. The demo script makes no API calls, so in demo mode there is no link and the page explains how to point it at a live agent.

## Backend contract

`POST {VITE_AGENT_API_URL}/chat`, with `Authorization: Bearer <sessionId>` and body `{ message, sessionId, loan }`. It responds with `application/x-ndjson`, one event per line:

| Event | Meaning |
|---|---|
| `{"kind":"delta","text":"…"}` | The **next chunk** of the reply. It is appended, not a replacement. |
| `{"kind":"citation","citation":{"id","label","href?"}}` | A cited document or policy. |
| `{"kind":"block","block":{"type",…}}` | A structured result, shown under the reply's text. `type` is `facts` (`rows: [{label, value}]`), `checks` (`rows: [{label, value?, detail?, status}]`), `table` (`columns`, `rows: [{cells, status?, note?}]`, `footnote?`) or `documents` (`items: [{id, name, detail?, href?}]`). `status` is `pass`, `warn`, `fail` or `info`. |
| `{"kind":"proposal","proposal":{"id","title","summary?","params?":[{"label","value"}]}}` | A governed write held for approval. |
| `{"kind":"trace","step":{"id","title","description?","status","startedAt?","finishedAt?"}}` | A trace step. Sending the same `id` again updates that step. `status` is `running`, `succeeded`, `warning`, `failed`, or `skipped`. |
| `{"kind":"context","loan":{"loanId","name?","borrower?","status?"}}` | The loan this turn resolved to. The top bar shows it. |
| `{"kind":"todos","todos":[{"id","content","status"}]}` | The plan for this turn, sent as a full snapshot each time. `status` is `pending`, `in_progress`, `completed`, or `skipped`. The reply's progress line shows it. |
| `{"kind":"options","options":[{"label","prompt"}]}` | Prompts to offer next, as chips after the reply. |
| `{"kind":"done","status":"complete"\|"needs_input"\|"error"}` | Always the last event. `needs_input` means the agent asked a question or is waiting on an approval. |

Every event may also carry `seq` (1, 2, 3… per turn). If the stream ends without `done`, or a `seq` number never arrives, the page tells the officer the reply may be incomplete. Box AI's own client checks its stream the same way.

`POST {VITE_AGENT_API_URL}/actions/resolve` takes `{ proposalId, decision: "approved" | "rejected", note?, sessionId }` and returns the updated proposal, with `decision` and an optional `note` describing what happened.

Writes such as `applyLoanTerms`, `prepareSignatureRequest`, and Doc Gen must never run on `/chat`. Emit a `proposal` and run the write only after `/actions/resolve` approves it.

### Backends

[apps/loan-agent](../loan-agent/README.md) implements this contract **without an LLM**. TypeSafe picks the intent from a fixed set, rules resolve the arguments, and credit policy and replies are computed in code. Run it with `npm start` there and set `VITE_AGENT_API_URL=http://localhost:8787`.

#### Strands agent (LLM alternative)

A [Strands Agents](https://strandsagents.com/) server maps onto this contract directly:

- Text-delta stream events become `delta`.
- Before- and after-tool-call events become `trace` steps, keyed by the tool-use id.
- A `BeforeToolCallEvent` hook on write tools calls TypeSafe System One as a policy guard and raises a Strands **interrupt**, which becomes the `proposal`.
- `/actions/resolve` resumes the agent with the interrupt response.

The backend has to keep a `proposalId → session` mapping. It should also cache the TypeSafe verdict per tool-use id, because the hook runs again on resume.

## Files

- `src/components/LoanCopilot.tsx`: the page: top bar, thread, replies, composer dock
- `src/useConversation.ts`: the `AgentChatController` session plus each turn's plan, steps, blocks and timing
- `src/activity.ts`: the progress line's wording and timings
- `src/components/TurnProgress.tsx`, `ResultBlocks.tsx`, `ApprovalCard.tsx`, `Composer.tsx`: the parts of a reply, and the message box
- `devtools.html`, `src/devtools/`: the developer tools page; `CallConsole.tsx` and `calls.ts` are the API console and its call-log events
- `src/styles/base.css`, `src/theme.ts`: tokens, type, buttons and status glyphs shared by both pages, and the Box light/dark theme
- `src/components/BrandMark.tsx`, `src/greeting.ts`: the Acme Bank mark and the welcome greeting
- `src/transport/httpTransport.ts`: the live backend transport
- `src/transport/ndjson.ts`: the stream reader
- `src/transport/demoTransport.ts` and `demoScript.ts`: offline demo beats and the keyword router
