# Gemini Enterprise harness: plan

Goal: run the same six-beat Harborview demo from a Gemini Enterprise chat agent, against the same LOS server and Box enterprise, with nothing org-side changing beyond a callback URL. Status on 2026-09-24: skill drafted, nothing rehearsed.

## What is verified from the documentation

- **Custom MCP servers are admin-configured.** A Gemini Enterprise Admin adds a custom MCP server with a URL and either no auth or OAuth 2.0 (authorization URL, optional authorization parameters, token URL, client ID, client secret, space-separated scopes). Only StreamableHTTP transport is supported; SSE is not. The server and the identity provider must be public HTTPS. The connection is disabled by default and is enabled for the team; users then authorize it under **Connectors**. Servers can also be imported from Agent Registry.
- **Box ships a Gemini Enterprise connector.** In the Box Admin Console, Integrations, filter MCP, set the Gemini Enterprise Box Connector to available for all users; presenters authorize it from Gemini's Connectors menu. Business plans follow Google's third-party data guidance, Enterprise plans use a Box data store.
- **Agents are built in Agent Designer.** A chat agent has name, description, instructions, model, starter prompts, data sources and tools (including MCP servers, each with a server description and agent instructions), and attached files. It is tested in Preview and published with Create, then shared. Google Search and URL context are on by default.
- **No documented per-tool consent** and no documented skill upload. Governance and the Doc Gen contract must live in the instructions and an attached file.

Sources: Google's custom MCP server help (Business edition), the Gemini Enterprise custom MCP server and Agent Registry import docs, the Agent Designer create-agent and Agent Studio design docs, and Box's "Set up Gemini Enterprise with Box MCP Server" page.

## What the first rehearsal must confirm

| Question | Why it matters | Fallback |
|---|---|---|
| Does Gemini's OAuth client do PKCE? | The `LOS_Claude_MCP` external client app requires PKCE. Google's fields list no PKCE switch. | Clone the ECA as `LOS_Gemini_MCP` with PKCE off, same scopes and pre-authorization; keep the Claude app unchanged. |
| What redirect URI does Gemini present? | It must be on the ECA's callback list before the first sign-in. | Copy it from the connector dialog into Setup, External Client App Manager, OAuth. |
| Does the Box connector expose the AI and Doc Gen tools? | Beats 3, 4 and 5 need `ai_extract_structured_from_fields`, `ai_qa_hub`, `ai_qa_multi_file`, `create_docgen_batch`. | Register `https://mcp.box.com` as a second custom MCP server with Box OAuth, the way the ChatGPT path does. |
| Is the tool set limited or paginated? | Slackbot caps connected apps; Gemini may cap tools per server. | Trim the LOS server to the seven demo tools (it already is). |
| Does the agent honour a 12-rule instruction block? | Long instructions are sometimes rewritten or truncated by no-code builders. | Move rules 3, 4 and 11 into the per-server agent instructions; keep the rest. |
| Does `fieldsUpdated` come back verbatim? | Rule 6 depends on reading it. | Ask the agent to quote the tool result once during rehearsal. |

## Steps

1. **Salesforce admin.** Add Gemini's redirect URI to the `LOS_Claude_MCP` callback list. If PKCE fails, create `LOS_Gemini_MCP` (same scopes, admin pre-authorized, PKCE off) and hand its consumer key and secret to the Gemini admin.
2. **Box admin.** Enable the Gemini Enterprise Box Connector for all users. Confirm the Box AI and Doc Gen tools are on for the Box MCP Server integration; presenters who authorized earlier re-authorize.
3. **Gemini Enterprise admin.** Add custom MCP server `LOS Loan Tools`: URL `https://api.salesforce.com/platform/mcp/v1/custom/LOSLoanTools`, OAuth 2.0, authorization URL `https://login.salesforce.com/services/oauth2/authorize`, token URL `https://login.salesforce.com/services/oauth2/token`, client ID and secret from step 1, scopes as the ECA grants them (MCP and refresh token; copy the exact scope strings from Setup). Enable it for the team. If the Box connector lacks the AI or Doc Gen tools, add `https://mcp.box.com` the same way with Box OAuth.
4. **Maintainer.** Fill `config/runtime/quick-demo-defaults.json`, then render: `python3 scripts/render_skill_bindings.py --skill loan-origination-gemini` (knowledge file) and `--section instructions --print` (Instructions field). `python3 scripts/package_loan_skill.py --skill loan-origination-gemini --bindings config/runtime/quick-demo-defaults.json --output ...` builds the rendered archive if a presenter wants one file.
5. **Presenter.** In Agent Designer create chat agent `Loan Origination Agent`: paste the rendered instructions; attach the rendered SKILL.md as a file; add both MCP servers with the descriptions from the skill; turn Google Search and URL context off; starter prompts `run the Harborview loan origination demo`, `Demo Setup`, `What's the status of Harborview's distribution facility loan?`. Authorize both connectors under Connectors. Preview beat 2, then Create and share.
6. **Rehearse** beats 2 to 5 against the acceptance table in the skill, then beats 1 and 6 in the portal as Dana. Record the answers to the six questions above in this file and in `docs/CLIENT-SETUP.md`.
7. **Document.** Promote the CLIENT-SETUP section from "not yet rehearsed" to full steps, add a `config/gemini/agent.json` manifest and `instructions.md` on the Quick pattern, and add a Gemini edition to the storyboard only if a Gemini capture set exists.

## Out of scope

- Agent Studio and the Agent Platform (ADK, Agent Engine, Agent Registry as a build target). The demo is a no-code Agent Designer agent; a coded agent would move orchestration into Google's runtime, which is the pattern the Loan Copilot already shows in Agentforce.
- A Box data store for search. The demo finds documents by metadata inside one loan folder; enterprise search across Box would show content the governance story keeps out of view.
