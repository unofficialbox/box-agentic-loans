# Inbound Email Intake Service

Captures a loan application package that arrives **by email** (the realistic first hop — a borrower's CFO emails the loan officer an application, financial statements, or a marked-up term sheet) onto the matching Salesforce Opportunity, and uploads the attachment straight into that Opportunity's Box folder.

## What it does

`EmailIntakeHandler` (Apex `Messaging.InboundEmailHandler`) + `BoxEmailAttachmentUploader` (Queueable), in `los-salesforce-project/force-app/main/default/classes/`:

1. Resolves the sender: `Contact.Email = fromAddress` → `Contact.Account`. Falls back to matching the sender's email domain against an `Account` website (`harborviewlogistics.example` resolves Harborview Logistics).
2. Picks the open Opportunity on that Account (the email subject may name a specific Opportunity to override the default).
3. Logs the email on the Opportunity's **activity timeline** — an `EmailMessage` where Enhanced Email is enabled, otherwise a `Task`.
4. Uploads each attachment **directly into the Opportunity's Box folder** — the bytes come straight from the inbound email and are **never persisted in Salesforce** as a ContentVersion. The file lives once, in Box, and surfaces on the Opportunity through the Box for Salesforce managed package's record → folder mapping.

It **never bounces** the sender (always returns success), and it **does not create `LOS_Loan__c`** — loan-record creation stays in the governed, human-gated Box intake path.

## How the Box upload works (no credentials, no double storage)

`BoxEmailAttachmentUploader` uses the **Box for Salesforce managed package** (`box.Toolkit`), so there is **no Named Credential and no separate Box app** to configure — the package's service account handles auth:

- `box.Toolkit.getFolderIdByRecordId(oppId)` resolves the Opportunity's Box folder (`createFolderForRecordId` creates it if missing — not `createObjectFolderForRecordId`, which returns the shared object folder).
- The attachment `Blob` is hand-assembled into a `multipart/form-data` body and POSTed to `https://upload.box.com/api/2.0/files/content` via `box.Toolkit.sendRequest(...)`, which attaches the service-account token.
- Because creating the folder mapping is a callout **plus** DML, the first upload for an unmapped record creates + commits the mapping, then chains a second job that does the upload-only callouts (Salesforce forbids callouts after DML).

Prerequisite: the Box for Salesforce integration's **service account must be authorized** in the org (it is, since the package already maps records to Box folders), and **Opportunity** must be a Box-mapped object.

## Boundary

Content (the attachment) lives only in Box; Salesforce keeps the email **activity** and reaches the file through the managed package's Box widget. The authoritative `LOS_Loan__c` record is still created only by the Box metadata-trigger intake workflow after human review. No file bytes are written into the structured record.

## Per-org setup (Email Service)

The Apex deploys with the metadata; the inbound **address** and its **Run As** user are environment-specific and are configured in the org (not committed):

1. **Setup → Email Services → New Email Service.**
   - Apex class: `EmailIntakeHandler`
   - Accept Attachments: **All** (binary + text)
   - Active: checked
2. **New Email Address** under that service:
   - Run As: a licensed user with access to `Contact`/`Account`/`Opportunity`, create on `EmailMessage`/`Task`, and access to `box.Toolkit` (e.g. the LOS integration user with `LOS_Box_Automate_Integration`).
   - Active: checked. Optionally restrict **Accept Email From** to the borrower domains.
3. Salesforce generates the inbound address (`<localpart>@<...>.apex.salesforce.com`). Route borrower mail to it — forward the lending shared mailbox, or add it as a BCC/recipient on the borrower thread.

Verify: send a test email (with a PDF) from a known borrower Contact address; confirm the email appears on that Contact's Account Opportunity timeline and the PDF appears in the Opportunity's Box folder. This has not yet been verified in a loans org; the CLM predecessor proved the handler live.

## Running the demo

**Mode A — simulated (reliable, no external mail).** Best for a controlled demo; runs the exact handler the inbound service calls.

1. Confirm the sample data is seeded (the Harborview Contact Jordan Pike + the "Harborview Logistics — Distribution Facility Acquisition" Opportunity, Box-mapped) and the `Los_Sample_Loan_Application` static resource is deployed — the script attaches it as `harborview-loan-application-2026.pdf`.
2. Run:
   ```bash
   sf apex run --target-org <alias> --file los-salesforce-project/scripts/demo-email-intake.apex
   ```
3. Open the matched Opportunity → the email is on the **activity timeline**; the attachment appears in the Opportunity's **Box folder** (via the Box section on the record; uploads asynchronously — allow a few seconds).

**Mode B — live email (most realistic).** Shows a real inbound message.

1. One-time: complete the *Per-org setup* above to create the Email Service and copy its generated inbound address.
2. One-time: point a Harborview Contact's `Email` at a mailbox you control — the sample uses non-deliverable `.example` addresses, and the sender must match a `Contact.Email` for routing to work.
3. From that mailbox, send an email with an application PDF attached to the generated inbound address.
4. Show the email on the Opportunity timeline and the PDF in the Opportunity's Box folder — then the folder-wide Box Extract job picks it up for downstream intake.

## Connecting to the intake workflow (follow-up)

The file lands in the **Opportunity's** Box folder, not the shared `01 - Application Intake` folder that the `losLoan` metadata trigger watches. To fire the governed intake workflow off it, re-point that Automate trigger at the record folders (or apply `losLoan` metadata to the file in the Opportunity folder). Tracked as a follow-up; it does not block the email-capture flow.
