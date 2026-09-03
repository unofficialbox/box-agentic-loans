# Box Preview Setup

Configure the governed Box preview in the LOS React borrower workspace: a Box platform app, the
Salesforce credential that holds it, and the settings that scope it to one folder.

Until this is complete the workspace states that it could not be opened, and names the
reason it was refused. The CLM predecessor used to render synthetic file fixtures instead,
which made an unconfigured environment indistinguishable from a working one; that fallback
is gone. None of the steps below has yet been executed for the loans port.

Related manual tasks: MT-037 through MT-040 in the [Manual-Task Register](manual-task-register.md).

## What this builds

```
Browser ──GET /services/apexrest/los/box-token?recordId=<sfid>─▶ LosBoxTokenService (Apex)
                                                                  │
                                        0. box__FRUP__c lookup     │ (record -> Box folder)
                                        1. client credentials grant│ (Box app -> parent token)
                                        2. token exchange          │ (downscope to one folder)
                                                                  ▼
Browser ◀───── short-lived token + the folder it was minted for ───┘
   │
   ├── GET api.box.com/2.0/folders/<id>/items                    (list files)
   └── GET api.box.com/2.0/files/<id>?fields=expiring_embed_link (preview URL)
                    │
                    ▼
       <iframe src="https://<enterprise>.app.box.com/preview/expiring_embed/...">
```

Box renders the document on its own origin, so no preview library is downloaded. That is
deliberate: the Box Content Preview script is served from `cdn01.boxcdn.net`, and the
Experience Cloud CSP allows only `'self'` plus a Salesforce allowlist under `script-src`
-- `CspTrustedSite` has no `script-src` field that can widen it. It *does* have
`isApplicableToFrameSrc`, so an iframe is the one preview path the platform can grant.

The folder is chosen by the org, not the caller. `box__FRUP__c` is where the Box for
Salesforce managed package stores the record-to-folder association, so the browser names
a Salesforce record and the endpoint answers with the folder that record is linked to --
no Box folder id travels in a URL, and a caller cannot request a folder the record is not
associated with. `Allowed_Folder_Ids__c` is applied to the resolved folder as well, so the
mapping is not a way around the allowlist.

`folderId=<box-folder-id>` still works for pages with no record context and for the local
harness.

The browser never receives a client secret and never receives the enterprise token. Apex
never holds a credential either: Salesforce substitutes the encrypted values into the
request body at callout time.

## Prerequisites

- Box admin access to the target enterprise.
- Salesforce admin access to the target org.
- The LOS metadata deployed, including `LosBoxTokenService`, the `LOS_Box` external
  credential, `LOS_Box_Config__c`, and the CSP trusted sites.

## Part 1 — Box platform app

1. In the Box Developer Console, create a **Custom App** with **Server Authentication
   (Client Credentials Grant)**.
2. Set **App Access Level** to **App + Enterprise Access**.
3. Under **Advanced Features**, enable **Generate User Access Tokens**. The demo grants as a
   Box user rather than the service account, and that setting is what permits it.
4. Under **Application Scopes**, enable reading **and writing** all files and folders.
   Write is required because the workspace embeds the Box Content Uploader; delete, share,
   and admin scopes are not required and should stay off. The downscoped token the browser
   receives is limited to one folder; its scopes (`base_explorer item_preview item_read item_upload item_download item_delete item_rename item_share`) mirror the workspace controls and are listed in `LosBoxTokenService.DOWNSCOPE_SCOPE`.
5. Under **CORS Domains**, add the Experience Cloud origin, for example
   `https://<your-site>.my.site.com`. The browser calls `api.box.com` directly with the
   downscoped token, so Box refuses the folder listing without this.
6. Save, then have a Box admin **authorize the app** in the Admin Console under
   **Apps → Custom Apps Manager**, using the app's Client ID. A Client Credentials Grant
   app returns `unauthorized` until this is done.
7. Record the **Client ID**, **Client Secret**, and the **Box user id** the preview should
   act as (`box users:get --fields=id,login`). That user must be able to open the loan
   folder; nothing needs collaborating because the token inherits their access.

## Part 2 — Salesforce credential

Secrets go in the external credential, never in a file. Set them with the script:

```bash
read -rs BOX_CLIENT_SECRET && export BOX_CLIENT_SECRET
BOX_CLIENT_ID=<id> los-salesforce-project/scripts/configure-los-box-credential.sh <alias>
```

Reading the secret with `read -rs` keeps it out of shell history. The values are
substituted into a temporary copy at run time, so no secret reaches the working tree.
Salesforce stores both encrypted; they cannot be retrieved back into source, and Apex only
ever holds `{!$Credential.LOS_Box.ClientId}` and `{!$Credential.LOS_Box.ClientSecret}`
placeholders. Rerunning updates the existing principal rather than failing.

The equivalent by hand is **Setup → Named Credentials → External Credentials → LOS Box →
Principals**, editing `LOS_Box_Principal` and setting the `ClientId` and `ClientSecret`
authentication parameters.

`LOS_Box` uses the **Custom** authentication protocol rather than Basic. The values are a
client id and a secret, not a username and password — and `ConnectApi.CredentialInput`
accepts only `AwsSv4` or `Custom`, so a Basic principal could not be populated
programmatically at all and would always have to be typed in by hand.

## Part 3 — Non-secret settings

These go on the `LOS_Box_Config__c` org-default record:

- **Box User Id** — the Box user the preview acts as. The endpoint returns
  `box_not_configured` until a subject is set.
- **Enterprise Id** — the alternative subject. Setting this instead grants a **Service
  Account** token, whose root starts empty, so the service identity must be added as a
  collaborator on the folder. Prefer the user id; it needs no collaboration. If both are
  set the user wins.
- **Allowed Folder Ids** — a comma-separated list of Box folder IDs the endpoint may mint
  tokens for. Leave blank to allow **any** folder; populate it to restrict the endpoint to
  the demo workspace.

Apply them with the script, which validates the values, upserts the org default, and
prints a masked summary. Rerunning it updates the same record rather than adding one:

```bash
BOX_USER_ID=<id> BOX_ALLOWED_FOLDER_IDS=<id,id> \
  los-salesforce-project/scripts/configure-los-box-settings.sh <alias>
```

The values are substituted into a temporary copy at run time, so no live identifier is
written into the working tree. Retrieve them with `box users:get --fields=id,login` and
`box folders:items 0 --fields=id,name,type`.

The equivalent by hand is **Setup → Custom Settings → LOS Box Config → Manage → New** (the
org default record), setting the same two fields.

Then assign the `LOS_Demo_Operator` permission set to anyone who will open the workspace. It
grants both the Apex class and access to the credential principal.
`python3 scripts/demo_operator.py salesforce-deploy` assigns it automatically.

## Part 4 — Point the workspace at a real folder

The app's default workspace folder is the placeholder string `demo-workspace`, which is not
numeric. The endpoint rejects it with `invalid_folder_id` before any Box call, so choose one:

- Open the page with an explicit folder: `/loans?folderId=<box-folder-id>`, or
- Rebuild the UI bundle with the folder baked in:

  ```bash
  VITE_BOX_FOLDER_ID=<box-folder-id> npm run build
  ```

  then redeploy the bundle.

## Part 5 — Verify

Check the endpoint before opening the page. From `los-salesforce-project`:

```bash
sf api request rest "/services/apexrest/los/box-token?folderId=<box-folder-id>" --target-org <alias>
```

A working setup returns `accessToken`, `expiresIn`, `folderId`, and `scope`. Anything else
is diagnosable from the table below.

Then open the workspace and confirm the borrower's marked-up term sheet renders in place of the file list.

## Part 6 -- Let the site user reach the endpoint

The React workspace calls the endpoint from the browser, so the request runs as the
**Experience Cloud site user**, not as the admin who deployed. `LOS_Demo_Operator` is
assigned to the deploying user and does not cover that.

For an unauthenticated site, assign **LOS Box Preview Guest** to the site's guest user
(Setup -> Users -> the site guest user -> Permission Set Assignments). It grants three
things and nothing else:

- the `LosBoxTokenService` Apex class,
- the `LOS_Box-LOS_Box_Principal` external credential principal,
- **read on `UserExternalCredential`**.

That third grant is the one that is easy to miss. Without it the callout throws
`System.CalloutException: You don't have read permissions on the User External Credential
object`, which the endpoint reports only as `box_request_failed`.

`LOS_Demo_Operator` cannot be used here: a Guest User License disallows its
`LOS_Loan__c` edit, delete, and view-all permissions, and the assignment is rejected.
For the signed-in borrower (Dana Whitfield) assign `LOS_Borrower_Portal` instead; it grants
exactly the fields in the `LoanSummary` projection and deliberately withholds
`viewAllRecords`, so a community user cannot query every loan through the REST API with
their own session.

Anyone reaching the site can then mint a folder-scoped, read-and-upload token without
logging in. The scope is one folder with no delete or share, but treat it as a demo
posture rather than a production one. For an authenticated site, assign the same
permission set to the community user profile instead of the guest user.

## Troubleshooting

| Response | Meaning | Fix |
|---|---|---|
| `missing_folder_id` (400) | Neither `recordId` nor `folderId` | Call with `?recordId=<salesforce-id>` |
| `invalid_record_id` (400) | `recordId` is not a Salesforce id | Check the page is passing real record context |
| `no_box_folder_mapping` (404) | No `box__FRUP__c` row for that loan record | Associate a Box folder with the record in the Box for Salesforce package (MT-044) |
| `invalid_folder_id` (400) | `folderId` is not numeric | Usually the `demo-workspace` default; see Part 4 |
| `box_not_configured` (500) | No CCG subject is set | Complete Part 3 |
| `folder_not_allowed` (403) | Folder is not in `Allowed_Folder_Ids__c` | Add the folder ID, or clear the field to allow any |
| `box_auth_failed` (500) | Box rejected the client credentials | Check Part 2 values; confirm the app is authorized in the Admin Console |
| `box_downscope_failed` (500) | Box refused the token exchange | Confirm the subject can see the folder. With a user subject, check that user's access; with an enterprise subject, collaborate the service account onto the folder |
| `box_request_failed` (500) | The callout itself threw | Usually the caller lacks **read on `UserExternalCredential`** -- see Part 6. Also check the named credential is enabled and the permission set grants principal access |
| 200, but the file list still shows | Listing blocked | Check the browser console; confirm the Box app's CORS domains include the site origin (MT-036) |
| File selected, but the preview frame is empty | `frame-src` blocks the Box app domain | Deploy `LOS_Box_App` and confirm **Setup → Trusted URLs** lists `https://*.app.box.com` for frame-src (MT-043) |
| "Box did not return a preview link" | Token lacks `item_preview` | Box answers 200 with the field absent rather than an error; check `DOWNSCOPE_SCOPE` in `LosBoxTokenService` |

## Production variant: per-user OAuth

The demo uses a Client Credentials Grant because it needs no per-user step: one-time admin
setup, no consent screen, and any authorized viewer of the site gets a preview.

For production, the committed `LOS_Box` auth provider supports moving to per-user Box OAuth.
Each person authenticates to Box themselves, so access is bounded by what they can already
see and Box's audit log shows the actual person rather than a service identity. The costs
are a callback-URL round trip during setup and a one-time Box consent per user — which is
why it is not the demo default. Tracked as MT-040.

## Notes

- Box Content Preview is served from the UI bundle, not `cdn01.boxcdn.net`. The Experience
  Cloud CSP allows the Box CDN under `style-src`, `connect-src`, and `frame-src`, but
  `script-src` permits only `'self'` and a Salesforce allowlist, and `CspTrustedSite` has no
  field to change that.
- Keep every value from this guide out of committed files. Client IDs, secrets, enterprise
  IDs, and folder IDs belong in the org, and `python3 scripts/validate_los.py` fails the
  build if they appear in source.

## Appendix: create the Lightning Out 2.0 app for Agentforce

The borrower portal carries no agent (see the scenario guide), so this appendix only
applies if you embed an Agentforce panel on an internal site. The Agentforce conversation
client loads through Lightning Out 2.0. Without an enabled
`LightningOutApp` whose host domains include the site, the panel mounts and stays empty
with no error -- the failure is silent, so check this before debugging the client.

`LightningOutApp` is not a Metadata API type, but it is createable through the Tooling
API, so this does not have to be done by hand in Setup:

```bash
sf data create record --use-tooling-api --sobject LightningOutApp --target-org <alias> \
  --values "DeveloperName=LOS_Workspace_LO MasterLabel='LOS Workspace' \
            ApplicationName=LOS_Workspace_LO IsEnabled=true Runtime=CLWR"

sf data create record --use-tooling-api --sobject LightningOutAppHost --target-org <alias> \
  --values "LightningOutAppId=<id-from-above> DeveloperName=LOS_Site_Host \
            MasterLabel='LOS Site Host' ApplicationName=LOS_Workspace_LO \
            HostDomain=https://<your-site-domain>"
```

`IsEnabled=true` matters: Salesforce documents that a disabled app fails user
authentication and the embedded components never load. `Runtime` accepts `CLWR` or
`LWR_CORE`; `CLWR` is the Experience Cloud runtime. The field is updateable if wrong.

Then rebuild with the id and deploy:

```bash
VITE_AGENTFORCE_APP_ID=<18-digit-id> npm run build
```

The id is environment-bound, so it belongs in the build environment or the gitignored
runtime config -- never in committed source.

Lightning Out 2.0 initializes from an existing Salesforce session. As the Experience
Cloud guest user every call returns 401 and the panel stays empty, so this can only be
verified while signed in.
