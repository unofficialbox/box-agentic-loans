# Box + Salesforce Demo: The Paved Path

Everything `box-bedrock-for-clm` learned the expensive way, written as the route you would
take if you were starting again. Scope is **Box + Salesforce only** — no Databricks, no
Bedrock/AgentCore.

Read §1 and §2 before writing code. §8 is the table to check when something breaks, and it
is the part of this document most likely to save you a day.

---

## 1. The shape that worked

Two surfaces over one governed content store. Getting this boundary right up front is worth
more than any amount of later debugging.

| | Internal surface | External surface |
|---|---|---|
| **Who** | Your own staff | The counterparty / customer |
| **Delivery** | MCP server → Claude Desktop, or an Agentforce **Employee** Agent | Experience Cloud site running a React UI Bundle |
| **Identity** | The signed-in employee | The signed-in community user |
| **Scoping** | Object/field permissions | Sharing set + field permissions + a downscoped Box token |
| **Content reach** | Whole portfolio | One folder, filtered |

**The governance invariant.** Box is authoritative for *content*; Salesforce is
authoritative for structured *commercial truth*; content bytes never flow into Salesforce.
Every generation, signature and write is human-gated. Write this down on day one — it
settles a dozen later arguments about where a feature belongs.

### The one architectural trap

An Agentforce **Service Agent** (`ExternalCopilot` / `EinsteinServiceAgent`) runs as *its
own user*, not as the person typing. So on an external site:

- your sharing set, field permissions and content filters bound the **page**
- the agent sits beside them bounded by **none of it**, and takes the record it answers
  about from the conversation

A customer can therefore ask it about another customer's data by naming it. There is no
client-side fix: the Agentforce ACC client has no API for passing context or identity
(verified three ways — `embedAgentforceClient` has no such option, the mounted element
exposes no methods, and `lightning/accApi` is importable only from an LWC).

**Decide early.** Either the external surface carries no agent, or you accept that its
agent is demo-grade. An **Employee Agent** *does* inherit the signed-in user's permissions,
so "same agent, different access" is achievable internally — just not externally.

---

## 2. Build order

Each step's failure mode is the reason it is in this position.

1. **Box app (Client Credentials Grant), and its CORS domains.** CCG needs one-time admin
   setup and no per-user consent — the right default for a demo. Add every origin the
   browser will call from, including `http://localhost:<port>` for local work. The browser
   calls `api.box.com` directly; a missing origin fails the folder listing with a CORS
   error that looks like anything but a configuration problem.
2. **Salesforce external credential** holding the Box client id/secret. No Box secret
   should ever exist in Apex, metadata or source control.
3. **Downscoped token endpoint** (Apex REST). Get this returning a token for one folder
   before building any UI.
4. **Folder provisioning that grants a direct collaboration** (§4.2). Do this before
   seeding content, or everything downstream 404s in ways that point at scopes.
5. **The React UI Bundle skeleton** — routing, config, error states. No box-ui-elements yet.
6. **`.forceignore`** excluding `node_modules` (§5.1). Without it your first deploy fails on
   the 50 MB Metadata API limit and you will think the bundle type is broken.
7. **Permission sets, one per audience**, built as you go (§6). Retrofitting these is where
   projects lose days.
8. **box-ui-elements** (§5.2) — the hardest single integration. Budget real time.
9. **Metadata templates and search** (§4.3), then Doc Gen and Sign (§4.4).
10. **Agent surfaces last** (§7). They depend on everything above being provably working.

---

## 3. Engineering practices that paid for themselves

**Fail loudly. Never fall back to synthetic data.** The single most expensive mistake in
this project: the workspace answered *any* Box failure by rendering fixtures. A CORS
rejection, a dead endpoint and a crashed component produced the same plausible screen, so
three stacked bugs stayed invisible through an entire build wave, and a demo could run
start to finish against nothing.

Give every remote read a result type that carries the reason:

```ts
export type Loaded<T> = { ok: true; value: T } | { ok: false; error: string };
```

Then a caller cannot reach the data without deciding what to draw when there is none.
Render the reason verbatim — Box's `cors_origin_not_whitelisted` names its own fix.

Keep **empty** distinct from **failed**. A freshly provisioned folder with no files, and an
org with no records yet, are real answers. Conflating them makes a healthy system look
broken and a broken one look healthy.

**Turn each bug into an offline check.** The failures here were invisible in review and
only appeared in a browser, against a live org. Every one of them can be caught by a script
that reads the repo:

- every field a SOQL projection selects is readable by the permission sets that serve it
- no CSS class name is shared with a vendor stylesheet
- no live host or secret appears in a committed file
- generated artifacts still match their generators

**Verify against the running system, not your model of it.** Nearly every wrong conclusion
in this project came from reasoning about behaviour instead of observing it. `curl` the
endpoint. Read the debug log. Screenshot the page. When a fix is deployed, re-check the
thing the user actually reported.

**Reproduce the real conditions.** A local harness that loads your stylesheet *last* will
not reproduce a cascade bug that only happens because a vendor stylesheet loads last. Build
the harness to match production's load order, not the one that is convenient.

---

- **Put every environment-bound value in one declared file, with placeholders committed
  and real values gitignored.** Scattering them across shell exports means a new
  environment fails one refusal at a time, on stage, and the person deploying has no list
  to work from. Declare each setting with the field it lands in, how to find it, and the
  sentence describing what breaks without it -- then a `--check` command answers "is this
  environment ready" before anyone opens a browser. Two rules make it hold: a config
  writer must treat a missing value as *leave the stored one alone*, or one forgotten
  export silently erases working configuration; and the file must never carry a real id,
  or the secret scan is right to reject it.

---

## 4. Box

### 4.1 Downscoped tokens

- **Scopes are space-separated.** `"a,b"` is read as one scope name. Each scope is
  individually valid, so this only fails once you request more than one — and the error
  does not mention delimiters. Pin it with a unit test.
- Request the narrowest set that works. `item_preview` is required for Content Preview;
  `item_upload item_delete item_rename item_share` for an uploader.
- Resolve the folder **server-side** from your record→folder association and return it in
  the response. If the folder id can be supplied from the URL, it is not a boundary.

### 4.2 A folder needs a *direct* collaboration before it can be downscoped

Inherited access is not enough, and the failure is disguised: `GET /2.0/folders/<id>`
returns 200 with `can_upload = true`, and the token exchange still returns
`{"error":"invalid_resource"}`. You will investigate scopes, the enterprise, and token
caching — all of which are fine.

**The tell:** `GET /2.0/folders/<id>/collaborations`. A folder that downscopes lists your
configured Box user *directly*.

It is wider than the downscope. The Box for Salesforce **Toolkit** and your Box **app**
authenticate as different Box identities, and only the Toolkit's owns what the Toolkit
creates. Folders made by calling `box.Toolkit.createFolderForRecordId` directly return 404
`not_found` to the app *and* to an admin's own Box session.

```
POST /2.0/collaborations
{"item":{"id":"<folderId>","type":"folder"},
 "accessible_by":{"id":"<yourBoxUserId>","type":"user"},"role":"editor"}
```

Make that call **inside** your provisioning service, immediately after creating the folder
and **before** any DML commits — Apex forbids a callout after DML, and the Toolkit only
stages its association until you commit. Treat 409 as success.

### 4.3 Metadata is the index — and it must be scoped

Metadata search replaces "list the folder, then read every file". One query answers
"which documents across every contract carry critical risk".

- **Metadata search is enterprise-wide.** A demo enterprise accumulates copies from earlier
  environments with identical file names and different ids. Unscoped, your query returns
  files that are not in a governed folder at all — which reads to an audience as the wrong
  customer's data. **Always pass `ancestor_folder_id`.**
- Request metadata inline on a folder listing with
  `fields=...,metadata.enterprise.<templateKey>` — the shorthand for the caller's own
  enterprise, so no enterprise id reaches the browser.
- **Enum values are case-sensitive, and people are not.** A template defining
  `Low|Medium|High|Critical` rejects `critical` with `400 invalid_query: unknown enum
  option`. An action that passes a user's words through verbatim therefore fails on the
  most natural phrasing of the question. Normalise against the template's own options and
  refuse anything else in words, rather than sending it to Box to fail.
- **Filter on a metadata field, never on a file name.** A redline named `v5-final.pdf` is
  still a redline; a policy document named `redline-summary.pdf` is not one.
- Show untagged files rather than hiding them. An unclassified upload is a tagging gap to
  fix, not a document to disappear.
- **Manual tagging does not survive the next record.** A metadata cascade policy on the
  parent folder is what makes this durable; plan for it or accept the demo ceiling.
- **`createObjectFolderForRecordId` does not create the record's folder.** It returns the
  folder for the *object* -- the shared parent every contract sits under. Map a record to it
  and every read for that record silently returns the whole tree. The record folder comes
  from `createFolderForRecordId(recordId, nameOverride, createRootFolder)`.
- **A folder the Toolkit just created may refuse writes from your CCG token**, even though
  `GET` on it reports `permissions.can_upload: true`. Moves and copies in fail with
  `404 not_found` naming `new_parent_folder`, which reads like a missing folder rather than a
  permission. Write through the package instead: the `box__MoveFile` invocable runs under the
  package's own connection, which owns the folder.
- **`GET /2.0/files/<id>/content` answers 302 to `dl.boxcloud.com`.** A named credential
  scoped to `api.box.com` will not follow it, so "download the bytes and re-upload" is not
  available without a second trusted host.

### 4.4 Doc Gen and Sign

- **Doc Gen is a versioned API**: `box-version: 2025.0` is required. The wrong value 400s
  and names the versions it accepts. Sign wants `2024.0` or no header at all.
- **Doc Gen is asynchronous.** A 202 means the batch was accepted, not that a file exists.
  Poll `GET /2.0/docgen_batch_jobs/<id>` for `completed` and the output file id. Your UI
  should show the folder, not spin on the response.
- **Preparing is not sending, and a prepared request is invisible.**
  `is_document_preparation_needed` returns a `prepare_url` and mails nobody, which is the
  defensible answer for an agent-adjacent demo. It is also a request that sits in Box in
  `created` state, absent from the sent list, notifying no one -- so "did anything happen?"
  is answered by a URL that leads out of the conversation into a Box tab and a manual
  field-placement step. Decide which you are demonstrating. If the signature has to visibly
  leave, set it false and let Box place the block; the guardrail is then the state gate
  below, not a person in the middle.
- **Go through the managed package, not the REST endpoint, if Salesforce should have a
  record of it.** `box.BoxSignService.sendSignRequests(List<box.BoxSignRequest>)` writes the
  `box__BoxSign__c` row and stamps it from `BoxSignRequest.recordId`, so the request appears
  on the record it came from. A direct callout to `/2.0/sign_requests` succeeds and leaves
  Salesforce with no trace at all.
  - `recordId` resolves to a **lookup on `box__BoxSign__c` whose `referenceTo` is your
    object**. The package ships lookups for Account, Contact, Contract, Lead and Opportunity;
    a custom object needs one adding. Salesforce cannot repoint a lookup, so one aimed at the
    wrong object must be deleted and recreated -- the API name frees up immediately after a
    Metadata API delete.
  - `sf_files` is `List<box.File>` and takes **Box** file references (`id`, `type`), despite
    the name. `box.SignFiles` is not visible outside the package.
  - The running user needs **create** on `box__BoxSign__c`; the package writes as them.
    Without it Box accepts the request and the related list stays empty.
  - The package's types cannot be mocked. Put the whole call behind an interface and
    substitute that in tests, rather than mocking an HTTP response.
- **Nothing refreshes the Sign status on its own.** Rows are written once. The package's Box
  Sign setup schedules the job that updates them; skip that setup and a related list shows
  `converting` for a request Box already reports as `sent`. Schedule
  `box.UpdateSignRecordsSchedulable` by hand if setup leaves none -- and note Salesforce
  rejects a minute list in one cron expression, so quarter-hourly is four jobs, not one.
- Gate it on record state in **Apex**, not in the prompt. A state check the model cannot
  talk its way past is the whole point.
- Keep the template id in **configuration**. The agent may generate the document; it may
  not choose what the org generates from.
- **`pushFileToBox` appends the extension** — a title ending in `.docx` becomes
  `.docx.docx`. Upload with the bare stem.

---

## 5. Salesforce

### 5.1 UI Bundle deployment

- **`.forceignore` must exclude `node_modules`.** The `UIBundle` type packages its whole
  directory, and the Metadata API request limit is 50 MB. Without this your first deploy
  fails in a way that looks like a platform problem.
- Deploy the built `dist`. Treat the bundle as a build artifact with a deploy step, not as
  source that the platform compiles.
- An app-container React site **cannot be opened in Experience Builder** ("You can't edit
  this site in Experience Builder because it's based on the React framework"), which is
  where the Strict/Relaxed CSP setting lives. You cannot relax CSP for these sites.

### 5.2 box-ui-elements: the hard part

Budget real time here. Every item below is a separate blocker that produces a blank frame
or a crash, and none of them names itself.

**Providers.** The components read `react-intl` context and throw *"Could not find required
`intl` object"* on mount without an `<IntlProvider>` above them. Content Preview
additionally needs a react-router `Router` above it — its annotations layer is wrapped in
`withRouter`, and box-ui-elements supplies a router only when a sidebar is mounted. If you
render an element outside the subtree that has these providers (a modal, a portal), it gets
neither. Wrap each entry point.

**Peer dependencies.** box-ui-elements declares **68 peers**. Almost every unfamiliar entry
in your `package.json` is one of them — check the peer list before assuming a dep is
unused. You will also likely need `legacy-peer-deps=true` in `.npmrc` for `npm ci` to
reproduce the lockfile; it changes no resolved version.

**Router version.** It imports `MemoryRouter`/`Router` from `react-router` directly, so
`react-router` must be a **top-level dependency** — pinned to the major that matches
`react-router-dom` (v5 at the time of writing). Two majors of the same router in one bundle
is a silent context break.

**`@salesforce/platform-sdk`** imports `o11y/client` without installing it. Declare `o11y`
and `o11y_schema` explicitly or the bundle fails to resolve.

**CSS class names collide.** Its stylesheets ship **unscoped** class names — `.modal`,
`.modal-backdrop`, `.be*` — and load *after* yours as lazy chunks, so at equal specificity
they win. Its `.modal-backdrop` carries `z-index: -1`; ours painted the upload dialog behind
the page, and no z-index on our side could beat a rule that simply came last. **Namespace
every class you author** and add a test that asserts no overlap with the vendor CSS.

**Content Preview specifics.**
- Install `box-annotations` and pass an instance as `boxAnnotations` — ContentPreview
  expects one and does not construct it.
- **Pass the token as a function, not a string.** Preview 3.x asserts
  `typeof annotatorToken === "function"`, and the throw aborts the viewer *silently*: empty
  frame, nothing in `onError`.
- On Experience Cloud you must **bundle the renderer from npm**, because the page sends
  `script-src 'self'` and `CspTrustedSite` has **no script-src field at all** (confirmed
  against both REST and Tooling describes — the type exposes only connect/frame/img/style/
  font/media). Assign `Box.Preview` unconditionally: importing the package already registers
  a plain `Preview`, so an "only if missing" guard silently keeps the wrong one.
- A bundled copy needs `location: { staticBaseURI }` or it requests
  `undefinedexif/exif.min.js` — and `location` is also the prop `withRouter` injects, so it
  must be set by subclassing rather than passed as a prop.
- Trusted sites needed: **frame-src** `*.app.box.com`, and **connect-src** `*.boxcloud.com`
  (preview fetches bytes from a per-request `dl.boxcloud.com`; only `public.boxcloud.com` is
  allowed by default).

**Content Explorer** never emitted a file activation in this embedding — it stayed in its
small/touch layout regardless of container width, so file clicks went nowhere while folder
clicks worked. Listing the folder yourself and owning the row click removes the guesswork.

### 5.3 Reading data: UI API vs Apex REST

| | GraphQL UI API | Apex REST |
|---|---|---|
| Runs as | signed-in user, platform-enforced | your class's sharing mode |
| Needs `API Enabled` | no (goes through the site's own bridge) | **yes** |
| Hidden field behaviour | **rejects the whole query** | returns it anyway (authenticated) |

Two asymmetries that cost real time:

- **UI API rejects the entire query if any selected field is hidden.** The result is an
  empty list, which reads as "this user has no records" rather than "you forgot a field
  permission".
- **Apex does not enforce FLS in SOQL for authenticated users** — so a field in your
  projection reaches the browser whatever the permission set says. Remove it from the
  *projection*, not just from the permission set.
- **But Apex *does* enforce FLS in SOQL for guest users**, and reports an unreadable field
  as `No such column '<field>' on entity` — a `QueryException`. So adding a field to a
  projection 500s the whole endpoint for signed-out visitors while working perfectly for an
  administrator. Add an offline check that the projection and the permission sets agree.

### 5.4 Experience Cloud login

`/<app-path>/` serves your React app for **every URL beneath it**, so `/app/login` and
`/app/s/login/` both render the app and a signed-out visitor is **never redirected**. The
login page lives on the site's other path prefix:

```
https://<site>.my.site.com/<site-prefix>/login?startURL=%2F<app-path>%2F
```

Put that URL in your demo script. Every presenter will otherwise hit the same wall.

### 5.5 Other platform edges

- **`description` caps at 255 characters** on permission sets, sharing sets and
  `McpServerDefinition`. Metadata deploys reject longer values with an unhelpful message.
- **XML comments cannot contain `--`.** The metadata parser rejects the file.
- **Apex reserves more identifiers than you expect** — `when` and `list`, among others.
  `HttpRequest list = ...` fails with `Missing ';'`, which points at the wrong thing.
- **Permission set metadata is grouped by element type.** A `fieldPermissions` block placed
  after `label` is rejected as "duplicated at this location" even though it is unique.
- **Apex REST discards the body of some status codes**, so an upstream 502 reaches the
  caller as `INTERNAL_SERVER_ERROR` with the real cause lost. Catch upstream failures and
  return your own 500 with the cause in the body.
- **Callouts are forbidden after DML.** Any provision-then-call sequence must make the
  callout first, or split into two requests.
- **Apex raises "sObject type X is not supported"** when the running user cannot see a
  managed-package object — it reads like a platform bug, not a permission.

---

## 6. Permissions: the failure dictionary

Every permission gap on this path fails **without saying "permission"**. Build the
permission set for each audience as you build the feature, and when a surface half-works,
diff it against the one audience you know reaches the content end to end.

| Missing | What you actually see |
|---|---|
| Field-level security on any selected field | UI API: empty list. Apex + guest: 500 `No such column` |
| `API Enabled` | Apex REST refuses with a bare 403 — while GraphQL keeps working |
| Read on `UserExternalCredential` + the external credential principal | Endpoint runs, then `System.CalloutException` |
| Sharing set for a community user | Zero rows, no error |
| Apex class not granted to an **agent** user | The action is never *offered* to the planner — invisible, not failed |
| `viewAllRecords` for an agent on a Private object | "I could not find that record" — a permission boundary dressed as a bad reference |

**Verification traps.** `<Object>__Share` shows **zero rows** for a community user — sharing
sets compute access rather than materialise shares, so an empty share table is a false
negative. Use `UserRecordAccess`. And a **non-member's login failure looks like bad
credentials**: confirm site membership with a `NetworkMember` query before debugging the
password.

**Anchor scoping on a lookup, not on text.** A text field holds "Northstar Health" and
"Northstar Health System" for one customer; an Account lookup does not.

**Deliberately withhold `viewAllRecords`** from external portal permission sets. A community
user with View All can query every record straight through the REST API with their own
session — which is the hole your scoped class exists to close. Write the test to pin the
bound account rather than granting the permission the class exists to avoid.

---

## 7. Agent surfaces

### Agent Script

- **`subagents:` is not a field on `start_agent`.** A subagent is a top-level block with its
  own `actions:`; routing is `@utils.transition to @subagent.<name>`.
- **`with x = ...` (a literal `...`) lets the model fill an argument.** Binding to a variable
  instead *overrides* the model — and an unset variable is an empty string, which surfaces
  as a platform `REQUIRED_FIELD_MISSING` and a 500 that never reaches your class's own error
  handling.
- **Declare an action output in `outputs:` before any binding references it.** That compile
  check is the only structural verification available: the retrieved `agentGraph` JSON
  serializes no variable bindings, so grepping it proves nothing either way.
- **Enforce ordering with guards, not prose.** Told five times to call one action first, the
  planner ignored it. `available when @variables.x == True` fixed it, because the wrong order
  is no longer offered. Interpolating an empty variable into instructions actively hurts —
  the model reads it as fact.
- **Nothing reaches the site until a version is activated**: publish, then
  `sf agent activate --version <n>`. Publish outputs are generated artifacts; gitignore them.
- **When an action never appears in a trace, suspect permissions before prompting.** A
  `TraceFlag` on the agent user names every such failure in one line.

### Hosted MCP (the internal surface)

`McpServerDefinition` is **not in the Metadata API Developer Guide**. What is true:

- an Apex tool is `aa:apex-<ClassName>` with `apiSource: API_CATALOG` and `operation` set to
  the **class** name — *not* `apex://ClassName`, which is what the agent bundle uses for the
  same class
- the developer name is **alphanumeric only** (2–40 chars)
- only `global` `@InvocableMethod` methods can be exposed
- **activation is not in the metadata**: it is a `McpServerAccess` Tooling API record whose
  `DeveloperName` must equal the server's
- available from **API v66.0**, **source-deploy only** — no packaging, no change sets
- gate access with an empty permission set; there is no named user permission
- **never retrieve `ExtlClntAppGlobalOauthSettings`** — it brings back the consumer secret

This is the better home for the internal persona: the Box credential never leaves Apex, so a
client holding an MCP token holds no Box token.

---

## 8. Symptom → cause

The table to scan first.

| Symptom | Likely cause |
|---|---|
| Token exchange returns `invalid_resource` | Folder lacks a **direct** collaboration (§4.2) |
| Folder listing fails with an opaque `TypeError` | Origin missing from the Box app's **CORS domains** |
| Box returns 404 `not_found` to app *and* admin | Folder created by the Toolkit, never collaborated (§4.2) |
| Only one scope works; two fail | Scopes joined with commas instead of spaces (§4.1) |
| Preview frame is blank, `onError` silent | Token passed as a string, not a function (§5.2) |
| "Sad Box Cloud" error boundary | No `Router` above Content Preview (§5.2) |
| *"Could not find required `intl` object"* | Missing `IntlProvider` — check portals and modals (§5.2) |
| Preview loads, then fails fetching bytes | Missing connect-src trusted site for `*.boxcloud.com` |
| A dialog renders behind the page | CSS class name shared with box-ui-elements (§5.2) |
| Contract/record list is empty for one user | A selected field is hidden → UI API rejected the query (§5.3) |
| Endpoint 500s `No such column` for signed-out visitors only | Guest FLS enforced in SOQL (§5.3) |
| Apex REST 403 with no body, GraphQL fine | Missing `API Enabled` (§6) |
| `System.CalloutException` from a working endpoint | Missing `UserExternalCredential` / principal grant (§6) |
| Community user sees no records, no error | No sharing set (§6) |
| Agent action never appears in the trace | Apex class not granted to the agent user (§7) |
| Agent says "I could not find that record" | Agent lacks `viewAllRecords` on a Private object (§7) |
| Agent argument arrives empty, 500 upstream | Binding uses a variable instead of `...` (§7) |
| Metadata search returns the wrong customer's files | Query not scoped by `ancestor_folder_id` (§4.3) |
| Doc Gen returns 202 but no file appears | It is asynchronous — poll the batch job (§4.4) |
| First UI Bundle deploy exceeds 50 MB | `node_modules` not in `.forceignore` (§5.1) |
| Login page renders the app instead | Login lives on the other path prefix (§5.4) |
| Signature request exists in Box but nowhere in Salesforce | Called the REST endpoint instead of the package (§4.4) |
| Sign request never arrives and is not in the sent list | `is_document_preparation_needed` left true (§4.4) |
| Related list stalls at `converting` | Sign status refresh job never scheduled (§4.4) |
| Metadata query 400s `unknown enum option` | Enum value case does not match the template (§4.3) |
| Every read for one record returns the whole tree | Record mapped to the object folder, not its own (§4.2) |
| Move or copy into a new folder 404s on `new_parent_folder` | Toolkit-created folder your token cannot write (§4.2) |
| Apex `Missing ';'` on a line that looks fine | A variable named `list` (§5.5) |

---

## 9. Starting checklist

- [ ] Box app with CCG; CORS domains include every origin, localhost included
- [ ] Salesforce external credential holds the Box secret; nothing in source
- [ ] Downscoped token endpoint returns a token for one folder
- [ ] Provisioning grants a **direct collaboration**, callout before DML
- [ ] `.forceignore` excludes `node_modules`
- [ ] One permission set per audience, built alongside each feature
- [ ] Every remote read returns `Loaded<T>`; no synthetic fallback anywhere
- [ ] Empty and failed are distinct states in the UI
- [ ] CSS namespaced; a test asserts no vendor class collisions
- [ ] An offline check that SOQL projections and permission sets agree
- [ ] A local harness that reproduces production's stylesheet load order
- [ ] Decision recorded: does the external surface carry an agent at all?
- [ ] Demo script includes the **login URL**, not just the app URL
