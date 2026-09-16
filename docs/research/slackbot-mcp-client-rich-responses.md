# Slackbot MCP client rich responses and Salesforce hosted custom MCP servers

Verification notes, 2026-09-16. Scope: whether a Block Kit "Demo Setup" card with an accept-defaults button and a typed override can run on the Slackbot MCP client, and whether the Salesforce-hosted `LOSLoanTools` server could serve it. Everything in the verified sections below is quoted from the vendor pages named; nothing is inferred there. Inferences are confined to the final section.

## Pages and how they were read

| Page | Result |
|---|---|
| https://docs.slack.dev/ai/slackbot-mcp-client/returning-rich-responses/ | Loaded. The raw Markdown export of the same page (`returning-rich-responses.md` under the same path) was also fetched for exact wording; JSON examples below are re-indented from that export with no key or value changed. |
| https://docs.slack.dev/ai/slackbot-mcp-client/ | Loaded, plus its raw Markdown export (`slackbot-mcp-client.md`). |
| Slack Help Center article "Guide to Model Context Protocol in Slack" (the article URL carries a 14-digit article number, which this repository's secrets scan rejects, so it is cited by title; search the Help Center for the title) | Loaded. |
| https://slack.com/blog/news/slackbots-mcp-client | Loaded. |
| https://developer.salesforce.com/docs/platform/hosted-mcp-servers/guide/custom-servers.html | WebFetch returned HTTP 403 Forbidden on both the first attempt and the retry with a different prompt. A plain HTTPS request through the session proxy returned HTTP 200 with the article body in the HTML, so the page text was read from that copy. Not blocked by the network policy; blocked only on the WebFetch path. |

Sub-pages linked from the client guide (`admin-approval`, `distributing`) were not fetched and are not relied on.

## 1. Slack pages: verified facts

Source abbreviations: **RR** = returning-rich-responses page, **CG** = slackbot-mcp-client guide, **HC** = Help Center article, **BLOG** = blog post.

### 1a. How a tool result carries Block Kit

**RR:** "MCP servers can return rich, interactive UI in two ways: Block Kit for native Slack components, MCP Apps for interactive HTML/JS experiences."

**RR:** "MCP servers can return native Block Kit responses using the `io.slack/block-kit` extension. This enables rich Slack UI components, such as buttons, select menus, and structured layouts, that look and feel native inside Slack."

**RR, capability negotiation:** "Slack advertises Block Kit support during MCP initialization. Your server can check for this capability to decide whether to return Block Kit responses:"

```json
{
  "method": "initialize",
  "params": {
    "capabilities": {
      "extensions": {
        "io.slack/block-kit": {
          "mimeTypes": ["application/vnd.slack.blocks+json"]
        }
      }
    }
  }
}
```

**RR, tool declaration:** "Tools that support Block Kit responses should indicate this in their metadata:"

```json
{
  "name": "list_opportunities",
  "description": "Show Salesforce opportunities",
  "inputSchema": {
    "type": "object",
    "properties": {
      "stage": { "type": "string" }
    }
  },
  "_meta": {
    "slack": {
      "supportsBlockKit": true
    }
  }
}
```

**RR, tool result shape:** "Return Block Kit JSON in `_meta.slack.blocks` of your tool response. Slack renders these as native UI alongside any standard content:"

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "content": [
      { "type": "text", "text": "Here are your opportunities" }
    ],
    "_meta": {
      "slack": {
        "blocks": [
          {
            "type": "header",
            "text": { "type": "plain_text", "text": "Your Salesforce Opportunities" }
          },
          {
            "type": "section",
            "text": {
              "type": "mrkdwn",
              "text": "*Acme Corp - Website Redesign*\n$50,000 | Proposal\nJohn Smith | 2026-02-15"
            },
            "accessory": {
              "type": "button",
              "text": { "type": "plain_text", "text": "Mark Closed Won" },
              "style": "primary",
              "action_id": "tool:update_opportunity_stage",
              "value": "{\"opportunityId\":\"006xx\",\"newStage\":\"Closed Won\"}"
            }
          }
        ]
      }
    }
  }
}
```

So the documented carrier is the result-level `_meta.slack.blocks` array next to an ordinary `content` array. The MIME type `application/vnd.slack.blocks+json` appears on the page only inside the client's `initialize` capability advertisement. The page shows no `content[]` entry of `type: "resource"` and no embedded-resource example for Block Kit.

**RR, validation failure mode:** "Every response is validated before rendering. If any rule below is violated, the entire `_meta.slack.blocks` payload is dropped and nothing is rendered (your `content` text still shows)."

**RR, the MCP Apps alternative:** "When an MCP tool returns a response containing a `_meta.ui.resourceUri` field, Slack detects this and renders the UI resource as an interactive block:" followed by the steps "1. A tool is called by Slackbot based on the user's prompt. 2. The tool returns data plus a `_meta.ui.resourceUri` pointing to a UI resource. 3. Slack fetches the UI resource (HTML/JS) from that URI. 4. The content is rendered as an interactive block in the conversation."

```json
{
  "content": [
    { "type": "text", "text": "You have 4 pending tasks" }
  ],
  "_meta": {
    "ui": { "resourceUri": "ui://acme/task-dashboard" }
  }
}
```

**RR:** "The `content` field provides a text fallback, while `_meta.ui.resourceUri` tells Slack where to fetch the interactive UI." The page's MCP Apps sample code imports `RESOURCE_MIME_TYPE`, `registerAppResource` and `registerAppTool` from `@modelcontextprotocol/ext-apps/server`, sets `RESOURCE_MIME_TYPE = "text/html;profile=mcp-app"` in the Python variant, and says "The tool uses the `readOnlyHint` annotation to indicate it doesn't modify any state, and returns `structuredContent` so the UI resource can render the roll visually."

**CG:** "By default, tool results appear as plain text. To create a more polished experience, your MCP server can return rich responses using Block Kit for native Slack layouts or interactive HTML/JS via MCP Apps."

**BLOG:** "By using the Model Context Protocol (MCP) and Slack's Block Kit framework, these apps can instantly display interactive dashboards, forms, and previews right inside the conversation." and "Native Block Kit support: Partner tools can now render rich visual components, including data tables and interactive carousels, directly inside your threads using the Block Kit framework."

### 1b. Supported block types and interactive elements

**RR, allowlist preamble:** "Because Slack renders these blocks on your behalf as Slackbot UI, it accepts only a restricted subset of the full Block Kit surface. Any response containing a block type not in this list, at the top level or nested inside a container block, is rejected in full (no blocks from that response are rendered). The permitted top-level block types are:"

| Group (RR heading) | Block types listed (RR) |
|---|---|
| Text & layout blocks | `context`, `divider`, `header`, `markdown`, `rich_text`, `section` |
| Media & resources blocks | `file`, `image`, `video` |
| Interactive blocks | `actions`, `carousel`, `input` |
| Tables & charts blocks | `data_table`, `data_visualization`, `table` |
| Cards & containers blocks | `card`, `container` |

**RR:** "Any other block type is rejected. When in doubt, `section`, `header`, `context`, and `actions` cover most layouts."

Descriptions given for the interactive rows (RR):

- `actions`: "Row of interactive elements (buttons, selects). Interactivity is limited to the `tool:` `action_id` convention."
- `input`: "Labeled input element in a form. See Forms and dynamic inputs."
- `carousel`: "Swipeable cards (each an image + title/subtitle/body + link-out button). Nests `card` children."
- `card`: "Card surface: hero image/icon, title/subtitle, body, up to 3 action buttons."
- `container`: "Titled, optionally collapsible grouping box. Wraps up to 10 `child_blocks`."
- `data_table`: "Richer tabular content. Interactive (`action_cell`) cells allowed."
- `table`: "Read-only tabular content. Display-only cells; no interactive cells."
- `section`: "Text (mrkdwn/plain_text) with an optional `accessory` and `fields`."

Interactive element types the page names, by example or by sentence:

- `button` (examples throughout, including as a `section` `accessory`), and link-out buttons: "To open a URL instead of calling a tool, use a link-out `url` on the button."
- `static_select`: "For a select menu (e.g., `static_select`), put the per-choice arguments in each option's `value` field as a JSON-encoded string, not on the element."
- Multi-selects: "Multi-selects merge the arguments from every chosen option."
- `radio_buttons`: "Use a single select instead of multiple buttons: one `radio_buttons` or `static_select` element carries one `action_id`, and each option carries its own `value`."
- `external_select`: "For `external_select` (type-ahead with dynamic options), keep the element's `action_id` as `tool:<tool_name>`. Its submitted value is bound by the input's `block_id` rather than an `input:` prefix."
- `confirm` dialogs on elements: "If you attach a `confirm` dialog to an element, Slack replaces its text with fixed, Slack-authored copy. You cannot control the wording."

The page's only `input` block example uses a `static_select` element. The strings `plain_text_input`, `checkboxes`, `datepicker`, `modal`, and `views.open` do not occur anywhere on the page. The word "modal" also does not occur on CG, HC, or BLOG. The page's opening sentence names exactly two ways to return rich UI (Block Kit in-message, MCP Apps), and it lists no modal or view surface.

### 1c. The `tool:` action_id prefix and `value` serialization

**RR:** "To make an element interactive, use the `action_id` prefix `tool:` followed by the tool name, and pass arguments as a JSON string in the `value` field. The `tool:` prefix tells Slack to route the interaction to your server; any other `action_id` is stripped and the element becomes inert. The one exception is `input:<argname>` on form inputs (see Forms and dynamic inputs)."

**RR:** "`value` must be a JSON string, not a raw object. Block Kit's `value` field must always be a string. Serialize your arguments and escape the quotes. If `value` is a raw JSON object, an empty string, or a non-object like `"true"`, the tool is called with no arguments. An element with no `value` at all will fail."

**RR:** "The keys and values inside `value` are passed as the tool's `arguments`, so they must match your tool's `inputSchema`. The `value` field is limited to 2000 characters and should contain only tool arguments. Slack adds any routing metadata itself when rendering the block, so any routing fields you include are ignored."

**RR:** "Tools with no arguments still need a `value`. Send an empty JSON object as a string: `"value": "{}"`."

**RR, uniqueness:** "The `action_id` value must be unique within a single block. This is tricky when calling the same tool with different arguments (e.g., Confirm/Cancel, or 👍/👎 both calling `rate_helpfulness`). You can differentiate calls by `value`, not by `action_id`." The two documented options are "Use one element per `actions` block: the uniqueness scope is per-block, so the same `tool:` `action_id` is fine in separate blocks" and "Use a single select instead of multiple buttons".

**RR, forms:** "Instead of encoding all arguments in a button's `value`, you can use a form: `input` blocks plus a submit button. When the user clicks submit, Slack harvests the form values and passes them as tool arguments." "Bind each input to a tool argument using `input:<arg_name>` as the `action_id`. On submit, that input's value becomes the `<arg_name>` argument:"

```json
{
  "blocks": [
    {
      "type": "input",
      "label": { "type": "plain_text", "text": "Priority" },
      "element": {
        "type": "static_select",
        "action_id": "input:priority",
        "options": [
          { "text": { "type": "plain_text", "text": "High" }, "value": "high" },
          { "text": { "type": "plain_text", "text": "Low" },  "value": "low" }
        ]
      }
    },
    {
      "type": "actions",
      "elements": [
        {
          "type": "button",
          "text": { "type": "plain_text", "text": "Create ticket" },
          "action_id": "tool:create_ticket",
          "value": "{}"
        }
      ]
    }
  ]
}
```

**RR:** "Clicking Create ticket calls `create_ticket` with `{ "priority": "<selected value>" }` merged in. Form values take precedence over static arguments in the button's `value`."

**RR:** "Form values are scoped to the submit button's own form. This means a single Slackbot DM can hold several independent forms without their inputs leaking into each other's tool calls." "Argument names must be unique within a form. If two inputs bind to the same `<arg_name>`, the first wins, so give each input a distinct argument name. Form values that your tool's `inputSchema` don't declare are silently ignored, so arg names must match your schema."

**RR, troubleshooting table:** "Clicking the element does nothing" is attributed to "`action_id` is not prefixed with `tool:`, or the element has no `value`." "The tool is called, but with no / empty `arguments`" is attributed to "`value` was a raw JSON object instead of a JSON-encoded string, was empty, or wasn't a JSON object." "The whole message renders as plain text instead of blocks" is attributed to "Two elements in the same block share an `action_id`, a block failed validation, or a block type outside the allowlist was included. Also confirm your app is enabled for Block Kit rendering."

### 1d. What happens on a click

**RR:** "When users interact with Block Kit elements like buttons, Slack routes the interaction back to your server as an MCP tool call. Your tool can return updated blocks to refresh the UI in place."

**RR:** "When a user clicks this button, Slack translates it into an MCP `tools/call` request:"

```json
{
  "method": "tools/call",
  "params": {
    "name": "update_opportunity",
    "arguments": {
      "id": "006xx",
      "stage": "Closed Won"
    }
  }
}
```

for the button

```json
{
  "type": "button",
  "text": { "type": "plain_text", "text": "Mark Closed Won" },
  "action_id": "tool:update_opportunity",
  "value": "{\"id\":\"006xx\",\"stage\":\"Closed Won\"}"
}
```

**RR, replace versus append:** "When Slack calls your tool from an interaction, your tool response is handled like any other; if it returns new `_meta.slack.blocks`, Slack replaces the original message's blocks with the new ones in place. Return the updated blocks to reflect the new state (e.g., a disabled button or an updated status), or return blocks without the interactive element to "consume" the action."

**CG, consent for prompt-driven calls:** "Slackbot will select the appropriate tool. If the tool is from a third-party, the user must explicitly authorize each tool call, both read and write, before Slackbot executes it." "When Slackbot invokes a tool, users are presented with the following options: Allow once: permits this tool call one time. Always allow: permits all future calls to this tool without prompting. Deny: blocks this tool call." "Users can view and update their tool permissions at any time in the MCP config dialog. After making a selection, Slackbot will then invoke the tool and return the results."

**CG, classification:** "The tools may be unclassified and default to write classification. Ensure your tools include proper descriptions and classification metadata so that read-only tools execute without additional unnecessary confirmation prompts." The CG code samples set `annotations: { readOnlyHint: true }` (JavaScript) and `annotations=ToolAnnotations(read_only_hint=True)` (Python).

**CG, identity on the call:** "When a tool is called through Slack identity auth, Slack attaches the caller's identity to the request under the `_meta.slack` object, nested inside the JSON-RPC request's `params`." The example carries `_meta.slack.user_id`, `team_id`, and `enterprise_id`.

### 1e. Skills

The word "skill" does not appear on RR, CG, HC, or BLOG. CG describes discovery as tools only: "Once connected, Slackbot will automatically discover your MCP server's tools and invoke them based on user prompts in conversation." and "Slackbot will query your MCP server's tool definitions and list all available tools with descriptions." None of the four pages mentions MCP prompts, resources (other than MCP Apps UI resources), sampling, or elicitation as things Slackbot loads.

### 1f. Limits, surfaces, and Marketplace registration

- **Server count (CG):** "On first use, a list of suggested apps appears. Click the + button next to the app to add it. Users can have up to 5 active MCP servers at a time."
- **Timeout (CG):** "Tools must respond within 60 seconds. If your MCP server doesn't return a result within 60 seconds, Slackbot aborts the call and surfaces an error to the user."
- **Surface (CG):** the usage steps begin "Open a DM with Slackbot." and "Click the Apps button in the Slackbot toolbar." RR refers to "a single Slackbot DM". BLOG adds "the real power comes when you share Slackbot's output directly into a team channel." No page states a direct-message-only restriction in those words.
- **Transport (CG):** "MCP servers must use the Streamable HTTP transport. The deprecated standalone HTTP+SSE transport and stdio are not supported. SSE-formatted responses within Streamable HTTP are supported and expected."
- **Block Kit limits (RR):** "At most 50 top-level blocks per response, and container nesting at most 20 levels deep." "At most two `data_visualization` blocks may appear in a single response." "A single `table` may contain at most 10,000 characters; a single `data_table` at most 20,000; and all tables in one message at most 20,000 combined." "Every `url` and `image_url` must be an `https://` URL to a public host." "Inline `data:`/base64 image sources are always rejected." "The combined rendered text is subject to the standard maximum message length in Slack."
- **How a server is attached (CG):** "You can add MCP server support via a Slack app, like any other Slack platform feature." "You can configure your MCP server within App Settings or by editing the app manifest directly." "Adding an MCP server via App Settings automatically adds the `mcp:connect` scope to your app." "The `mcp:connect` bot scope is required for MCP server connectivity." Four auth types are documented: Slack identity, no auth, Dynamic Client Registration, manual OAuth.
- **Marketplace (CG):** the Marketplace appears only as an optional next step: "To publish your app, check out distributing the app on the Slack Marketplace." and, separately, "To set up workspace controls, check out admin approval to manage how users install and access your app." No sentence on CG states that Marketplace registration is required for a custom server.
- **Marketplace (HC):** "You can also set Slackbot up as an MCP client. Install an app with an MCP server to connect Slackbot to that app, or choose from a variety of Salesforce servers." "When you install apps that include an MCP server to your Slack workspace or Enterprise organization, anyone with access to Slackbot can interact with those apps just by starting a conversation." "Tip: Head to the Slack Marketplace to see a full list of apps that offer MCP servers you can connect to Slackbot." HC lists Box among "MCP client partner apps".
- **Marketplace (BLOG):** "it connects any app to Slackbot, whether that's a Salesforce product, a third-party tool, or something your own team built." "Any tool your team uses, whether it's an internal database, a legacy system, or a bespoke app, can now connect to Slackbot via an MCP server." "Through the new MCP registry in Slack Marketplace, you can connect your favorite tools and services to Slackbot". "IT administrators are equipped with a single, centralized surface within the application console to discover, install, manage, and audit user access approvals and data boundaries". "Slackbot's Model Context Protocol (MCP) client is now generally available."

## 2. Salesforce page: verified facts

Source: the custom-servers page named above (title "Build Custom MCP Servers | Hosted MCP Servers | Salesforce Developers").

The page never uses the term `McpServerDefinition`. It describes "custom servers" configured in Setup. The complete statement of what such a server can contain:

"Custom servers are admin-configured. They can:
- Combine tools from multiple standard servers under a single URL, for example, pairing SObject read tools with a Tableau Next analytics tool for a reporting persona
- Include custom tools backed by Apex Invocable Actions, @AuraEnabled methods, Apex REST endpoints, Flows, or API Catalog endpoints unique to your org
- Be scoped to a specific persona, a sales rep server, a support agent server, a data hygiene server, each with a different mix of capabilities
- Be deployed via Metadata API between sandboxes and production."

"Custom servers are the only way to surface tools that don't exist in any standard server. These tools are backed by logic you've already built in Salesforce:" followed by five backing types: "Autolaunched Flows can be exposed as MCP tools."; "Apex classes annotated with @InvocableMethod become custom tools."; "Apex methods annotated with @AuraEnabled can be exposed as custom tools."; "Custom Apex REST endpoints (classes annotated with @RestResource) can be mapped as custom tools."; "REST API endpoints registered in the Salesforce API Catalog can be mapped to custom tools, including standard platform APIs and a growing subset of product-specific Connect APIs."

Configuration: "Custom servers are configured in Salesforce Setup: Integration → Salesforce MCP Servers. No code is required to configure the server itself." "The tool name and description you provide for each custom tool are as important as the backing implementation."

Stated limitations and considerations:

- "Standard servers are disabled by default and can be enabled by an admin, but their contents are not editable."
- "Not all Connect API endpoints are in the catalog at GA, coverage is expanding over time."
- "ISV managed packages cannot yet include MCP server configurations directly."
- "MCP clients have practical limits on how many tools they can work with effectively. Beyond a few dozen tools, an AI client struggles to select the right one for a given task."

Every capability the page describes is a tool. The page contains no mention of MCP resources, MCP prompts, tool `_meta`, tool annotations, result `content` types, `structuredContent`, Block Kit, MCP Apps, or client capability extensions.

## 3. Could not verify

The pages read do not state any of the following. Each is open, not disproved.

1. Whether Slack accepts Block Kit delivered as a `content[]` embedded resource with `mimeType: application/vnd.slack.blocks+json`, or only as `_meta.slack.blocks`. The MIME type is advertised by the client during `initialize`, but the only documented result shape is `_meta.slack.blocks`.
2. Whether a server must echo or acknowledge the `io.slack/block-kit` extension in its own `initialize` result. RR says only that the server "can check for this capability".
3. Whether a `plain_text_input` element (free text) is accepted inside an `input` block. RR's form example uses `static_select`, and its sentences name `static_select`, `radio_buttons`, `external_select`, and multi-selects. Free-text input is not named.
4. Whether `checkboxes` or `datepicker` elements are accepted. Not named.
5. Modals (`views.open`) are not mentioned on any page; there is no statement that they are supported or unsupported for MCP-originated interactions.
6. Whether the "Allow once / Always allow / Deny" prompt is shown for a `tools/call` that originates from a button click rather than a chat prompt. RR says the click-originated response "is handled like any other" but does not describe consent for clicks.
7. Whether the tool named in a `tool:` `action_id` must be present in the server's `tools/list` for the click to route, or whether an unlisted (app-only) tool works.
8. Whether `_meta.slack.supportsBlockKit: true` is required for rendering or only advisory ("should indicate").
9. What "confirm your app is enabled for Block Kit rendering" refers to (an app setting, a review step, or a Marketplace flag). The sentence appears once, in the troubleshooting table, without a link.
10. Whether Slackbot MCP tools are usable outside a direct message with Slackbot. The docs only describe the DM flow.
11. Whether Slackbot loads skills. No page mentions skills. This repository's Slack skill file describes Slackbot showing "Used Loan Origination Slack" when it loads a skill; that claim comes from the repository, not from these vendor pages, and remains unverified here.
12. Whether a Salesforce hosted custom MCP server can attach `_meta` to a tool definition or to a `CallToolResult`, return anything other than default text content, declare resources or prompts, or negotiate client extensions. The Salesforce page is silent on all of these; the metadata type name behind the Setup configuration is not given on this page.
13. Whether Salesforce hosted MCP servers satisfy Slack's Streamable HTTP and auth-type requirements. The Salesforce page does not describe transport or auth; those live on other pages of that guide that were out of scope.
14. Whether the Slack Marketplace listing is required for an internal, workspace-installed app to appear in Slackbot's app picker. CG treats Marketplace distribution as optional and points to a separate admin-approval page that was not fetched.

## 4. Implications for the LOS Demo Setup card

Based only on the verified statements above.

**A Block Kit card with an accept-defaults button is feasible on the Slackbot MCP client.** The documented shape maps directly onto the existing card's job: a `header` plus `section` blocks (or one `card` block, "up to 3 action buttons") showing the four bindings, and an `actions` block holding one `button` whose `action_id` is `tool:confirmDemoSetup` and whose `value` is the JSON-encoded string of the four defaults. Four short bindings fit comfortably inside the 2000-character `value` limit. The click becomes a `tools/call` for `confirmDemoSetup` with those arguments; the tool's response can return new `_meta.slack.blocks` that show the confirmed values without the button, which the docs describe as the way to "consume" the action. The tool would need `_meta.slack.supportsBlockKit: true` on its definition, the server would need to return `_meta.slack.blocks` at the result level, and the argument keys in `value` must match the tool's `inputSchema` exactly.

**A typed override is only partly verified.** The documented override mechanism is a form: `input` blocks bound with `input:<arg_name>` plus the same submit button, with "Form values take precedence over static arguments in the button's `value`." That is verified for `static_select`, `radio_buttons`, and `external_select` elements, so an override chosen from a fixed list is feasible. A free-text override typed into the card depends on `plain_text_input`, which the page does not name (item 3 above), so it cannot be called feasible from the docs alone. The fallback that needs nothing unverified is the one the presenter skill already accepts: the operator types the override as an ordinary chat message. Two other things on the Slack path differ from the current Claude Desktop card: the confirmation would arrive as a tool result that replaces the card in place, not as a message the card posts on the operator's behalf, so the skill would read the confirmed bindings from the tool result text; and `confirmDemoSetup` is currently app-only, while the docs only show clicks routing to tools that are declared like any other (item 7). The server would also want `readOnlyHint` on the confirm tool if the per-call "Allow once / Always allow / Deny" prompt is to be minimized, since unclassified tools "default to write classification".

**The existing MCP Apps card is a second documented option.** Slack states it renders a tool result carrying `_meta.ui.resourceUri` as an interactive block, and the current connector already returns exactly that. Whether the card's `sendMessage` path works on Slackbot is not covered by these pages.

**The Salesforce-hosted `LOSLoanTools` server cannot be shown to host either card.** The Salesforce custom-servers page describes a server as a curated set of tools backed by Flows, invocable Apex, `@AuraEnabled` methods, Apex REST, or API Catalog endpoints, and says nothing about tool `_meta`, result `_meta`, custom content types, resources, or client extensions. Both Slack mechanisms require the server to place `_meta` (`slack.blocks` or `ui.resourceUri`) in the tool result and, for Block Kit, on the tool definition. Nothing verified here says a hosted custom server can do that, so the card should stay on a separately hosted Streamable HTTP server such as the existing Demo Setup card connector. Slack's transport rule ("MCP servers must use the Streamable HTTP transport"; stdio "not supported") also means the connector's stdio mode cannot be what Slackbot connects to.

**Budget note.** The demo already relies on three servers (Box, LOS Loan Tools, and the Demo Setup card). A Slack presenter has room for five, and every tool must return within 60 seconds.
