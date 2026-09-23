# Loan Copilot chat

A loan officer's chat for the Harborview demo. It is built on the [box-open-elements agent-chat pattern](https://unofficialbox.github.io/box-open-elements/patterns/agent-chat/). `<box-agent-chat>` handles the whole conversation: the streaming thread, citation chips, approval cards, and the composer. This app adds three things around it:

- a top bar with the loan in context and whether the app is in demo or live mode
- one-click prompts for the demo beats in [DEMO-CLICKPATH.md](../../DEMO-CLICKPATH.md)
- a side rail with the **decision trace** for each turn (`<box-run-trace>`: routing, tool calls, approval gates) and the **sources** it cited

```bash
npm install
npm run dev        # http://localhost:3003
npm test           # transport + NDJSON unit tests
npm run build
```

The loan comes from `?recordId=` or `?loan=` in the URL. Without either, it defaults to `LN-2026-0042`.

## Demo vs live

- **Demo script (default).** When `VITE_AGENT_API_URL` is empty, `DemoLoanAgentTransport` replays the six clickpath beats offline. It uses figures from the seeded Harborview sample data and matches prompts by keyword. The routing step in the trace is labelled as simulated. Approving a card makes no write.
- **Live agent.** Set `VITE_AGENT_API_URL` in the repo-root `.env` (see `.env.sample`; Vite reads `envDir: ../..`), and `HttpLoanAgentTransport` talks to a backend over the contract below. Only `VITE_` values reach the browser. Keep `TYPESAFE_API_KEY`, Box, and Salesforce credentials in the backend.

## Backend contract

`POST {VITE_AGENT_API_URL}/chat`, with `Authorization: Bearer <sessionId>` and body `{ message, sessionId, loan }`. It responds with `application/x-ndjson`, one event per line:

| Event | Meaning |
|---|---|
| `{"kind":"delta","text":"…"}` | The **next chunk** of the reply. It is appended, not a replacement. |
| `{"kind":"citation","citation":{"id","label","href?"}}` | A cited document or policy. |
| `{"kind":"proposal","proposal":{"id","title","summary?","params?":[{"label","value"}]}}` | A governed write held for approval. |
| `{"kind":"trace","step":{"id","title","description?","status","startedAt?","finishedAt?"}}` | A trace step. Sending the same `id` again updates that step. `status` is `running`, `succeeded`, `warning`, `failed`, or `skipped`. |

`POST {VITE_AGENT_API_URL}/actions/resolve` takes `{ proposalId, decision: "approved" | "rejected", note?, sessionId }` and returns the updated proposal, with `decision` and an optional `note` describing what happened.

Writes such as `applyLoanTerms`, `prepareSignatureRequest`, and Doc Gen must never run on `/chat`. Emit a `proposal` and run the write only after `/actions/resolve` approves it.

### Strands agent backend

A [Strands Agents](https://strandsagents.com/) server maps onto this contract directly:

- Text-delta stream events become `delta`.
- Before- and after-tool-call events become `trace` steps, keyed by the tool-use id.
- A `BeforeToolCallEvent` hook on write tools calls TypeSafe System One as a policy guard and raises a Strands **interrupt**, which becomes the `proposal`.
- `/actions/resolve` resumes the agent with the interrupt response.

The backend has to keep a `proposalId → session` mapping. It should also cache the TypeSafe verdict per tool-use id, because the hook runs again on resume.

## Files

- `src/components/LoanCopilot.tsx`: the page shell around the pattern
- `src/transport/httpTransport.ts`: the live backend transport
- `src/transport/ndjson.ts`: the stream reader
- `src/transport/demoTransport.ts` and `demoScript.ts`: offline demo beats and the keyword router
