# Loan Copilot chat

A loan officer's chat for the Harborview demo. It is built on the [box-open-elements agent-chat pattern](https://unofficialbox.github.io/box-open-elements/patterns/agent-chat/). `<box-agent-chat>` handles the whole conversation: the streaming thread, citation chips, approval cards, and the composer. This app adds a few things around it:

- a top bar with the loan in context, and a "Demo script" tag in demo mode only
- a welcome state before the first message: what the copilot does, and four starter cards (from `src/prompts.ts`, which follows Box AI's prompt structure)
- after each reply, the agent's next steps as "Next" chips inside the chat card, under the composer; none while an approval is waiting
- the thread follows new messages and approval cards to the bottom, and stops following while you scroll up to read
- a side rail with the turn's **plan** (like Box AI's to-do list) and its **decision trace** (`<box-run-trace>`: routing, tool calls, approval gates)
- in live mode, the **API inspector** (below)

Styling follows Box's Blueprint design system:
- Lato at 14px on a 20px line
- the 4px spacing scale, Blueprint radii and drop shadows
- the Box AI gradient (`#fe03dc → #2784fa`) on the product mark and on AI controls

```bash
npm install
npm run dev        # http://localhost:3003
npm test           # transport, NDJSON and inspector unit tests
npm run build
```

The loan comes from `?recordId=` or `?loan=` in the URL when the page is opened on one. Otherwise the backend resolves it from the conversation ("latest loan for Harborview") and reports it in a `context` event.

## Demo vs live

- **Demo script (default).** When `VITE_AGENT_API_URL` is empty, `DemoLoanAgentTransport` replays the six clickpath beats offline. It uses figures from the seeded Harborview sample data and matches prompts by keyword. The routing step in the trace is labelled as simulated. Approving a card makes no write.
- **Live agent.** Set `VITE_AGENT_API_URL` in the repo-root `.env` (see `.env.sample`; Vite reads `envDir: ../..`), and `HttpLoanAgentTransport` talks to a backend over the contract below. Only `VITE_` values reach the browser. Keep `TYPESAFE_API_KEY`, Box, and Salesforce credentials in the backend.

## API inspector

In live mode an **API inspector** card sits under the chat, in the same column, colours and type as the rest of the page (light or dark), laid out like the HTTP inspector in [box-cmis-lab](https://github.com/unofficialbox/box-cmis-lab). It shows every call the loan agent makes to TypeSafe, Salesforce and Box, plus each chat request, live from the backend's `GET /calls/stream`:
- the list shows status, service, the call (e.g. `tools/call getLoanPackage`) and time in ms, newest first
- select a row to see its URL and its request and response headers and bodies
- **Copy request**, **Copy response** or **Copy both** puts the call on the clipboard as HTTP-style text (request or status line, headers, blank line, body), already redacted
- filter by service or errors, or **Clear** the log (`DELETE /calls`)
- drag the title bar to resize the shelf, and the divider to resize the list; both sizes and the open/closed state are remembered in this browser

If the agent answers but has no call log (it is still running code from before the inspector), the shelf says to restart it instead of retrying. Credentials are redacted by the backend before they reach the page. The demo script makes no API calls, so the shelf is hidden in demo mode.

## Backend contract

`POST {VITE_AGENT_API_URL}/chat`, with `Authorization: Bearer <sessionId>` and body `{ message, sessionId, loan }`. It responds with `application/x-ndjson`, one event per line:

| Event | Meaning |
|---|---|
| `{"kind":"delta","text":"…"}` | The **next chunk** of the reply. It is appended, not a replacement. |
| `{"kind":"citation","citation":{"id","label","href?"}}` | A cited document or policy. |
| `{"kind":"proposal","proposal":{"id","title","summary?","params?":[{"label","value"}]}}` | A governed write held for approval. |
| `{"kind":"trace","step":{"id","title","description?","status","startedAt?","finishedAt?"}}` | A trace step. Sending the same `id` again updates that step. `status` is `running`, `succeeded`, `warning`, `failed`, or `skipped`. |
| `{"kind":"context","loan":{"loanId","name?","borrower?","status?"}}` | The loan this turn resolved to. The top bar shows it. |
| `{"kind":"todos","todos":[{"id","content","status"}]}` | The plan for this turn, sent as a full snapshot each time. `status` is `pending`, `in_progress`, `completed`, or `skipped`. The **Plan** card shows it. |
| `{"kind":"options","options":[{"label","prompt"}]}` | Prompts to offer next. These replace the starter chips. |
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

- `src/components/LoanCopilot.tsx`: the page shell around the pattern
- `src/components/ApiInspector.tsx` and `src/inspector/calls.ts`: the API inspector shelf and its call-log events
- `src/transport/httpTransport.ts`: the live backend transport
- `src/transport/ndjson.ts`: the stream reader
- `src/transport/demoTransport.ts` and `demoScript.ts`: offline demo beats and the keyword router
