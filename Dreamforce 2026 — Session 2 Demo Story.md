# Dreamforce 2026 — Session 2 Demo Storyboard

## Overview
Show how Box and Salesforce handle a negotiated contract that comes back on the customer’s paper — governing, structuring, and connecting it so the team and Agentforce can act on it. One late-stage deal walks through the full workflow inside Salesforce: gather, extract, risk-check with Agentforce, generate, and sign — with Box’s permissions and compliance applied at every step, including the agent’s answers.

## Problem
Enterprise deals close on the customer’s template, not yours. Every negotiated MSA comes back with different payment terms, liability caps, renewal notice periods, and termination rights. That information drives revenue recognition, the renewal motion, and risk exposure — and it only exists inside a document, sitting outside the systems and permissions the team’s agents draw from.

## Demo Use Case
A late-stage deal with ACME is close to signing when ACME’s legal team sends back a redlined MSA. Contract manager Alex Bennett needs it captured, checked, signed, and reflected in Salesforce so the renewal and finance steps run on the real terms. Box AI Extract pulls the terms onto the record; Agentforce checks the redlines against the company’s approved clause library and ACME’s own contract history; Box Doc Gen and Box Sign generate and execute the agreement. Throughout, Box’s permissions travel with the content — so the same Agentforce question returns an answer for someone on the deal team and nothing for someone who isn’t.

---

## Flow 1
**Persona:** Alex Bennett (Contract Manager)

| Action / Build | Script | Notes | Owner |
| :--- | :--- | :--- | :--- |
| **Intro - Slide?** | Today we’re showing how Box and Salesforce change what happens when a contract comes back on the customer’s paper. Here’s the problem: enterprise deals close on the customer’s template, so the negotiated terms come back locked inside a document — outside the systems and permissions your agents work from.<br><br>You’ll follow a late-stage ACME deal from redlined contract to signed, current Salesforce record: the terms pulled onto the record, Agentforce flagging a risky redline, the agreement generated and signed — and, because Box governs the content, the same agent answering someone on the deal and returning nothing to someone who isn’t. Let’s get started. | Find intro slide ex | |
| **Actions:**<br>Open the Opportunity “ACME — Enterprise Expansion” (late stage) in Salesforce.<br>Click the Box tab on the record.<br>Show the Opportunity folder: prior signed MSA, the new redlined MSA (`ACME_MSA_Redline.docx`), and the internal approval thread.<br>Point out the folder’s permissions and retention policy. *(Don’t open the files yet.)*<br><br>**Build:** MSA Retention policy | This is a late-stage opportunity with ACME, and their legal team just sent back the negotiated MSA — redlined on their own template. Right on the Salesforce record, Alex opens the Box tab and sees everything for the deal in one place: the prior signed agreement, the new redlined MSA, and the internal approval thread. It’s all governed by Box — the folder carries the deal team’s permissions and a retention policy, so the right people have access and nothing leaves Salesforce or gets emailed around. Now Alex can start working the contract without leaving Salesforce. | | Sarah - done |

---

## Flow 2 - Extract
**Persona:** Alex Bennett (Contract Manager)

| Action / Build | Script | Notes | Owner |
| :--- | :--- | :--- | :--- |
| **Action:**<br>Open `ACME_MSA_Redline.docx` in the Box preview.<br>Trigger Box AI Extract by SObject Type.<br>Fields populate on the record: payment terms, liability cap, renewal notice, termination notice, governing law — each with a source citation.<br>Alex accepts or corrects each extracted field.<br>Validate mode flags the Limitation of Liability, where the returned paper contradicts what’s on the record.<br><br>**Build:** Metadata Write-back | The terms that matter most only live inside this document — the payment terms, the liability cap, the renewal and termination dates, the governing law. Box AI Extract reads the negotiated MSA and writes those terms straight onto the Salesforce record, with a citation on each field so Alex can check it against the source. Alex reviews them and accepts or fixes each one — no manual transcription.<br><br>Validate mode also checks the redlined terms against what’s already on the record, and it flags the Limitation of Liability: the version ACME sent back doesn’t match the company’s standard. That flag is what kicks off the next step. | | Sarah - done |

---

## Flow 3 - Agentforce
**Persona:** Alex Bennett (Contract Manager)

| Action / Build | Script | Notes | Owner |
| :--- | :--- | :--- | :--- |
| **Action:**<br>Alex begins reviewing the redlines.<br>Open Agentforce on the record.<br>Agentforce presents recommendations from the Box Acceptable Terms / CLM agent — each extracted redline validated against the Approved Clause Library Hub in Box.<br>Limitation of Liability is 2× the approved cap → a “high” risk score is presented to Alex. | As Alex reviews the redlines, Agentforce is already checking them against the company’s Approved Clause Library Hub in Box, through the Acceptable Terms agent. It flags the Limitation of Liability: the cap ACME sent back is twice what the company normally approves, so Agentforce marks it high-risk right on the record. And Agentforce only ever works from documents Alex has permission to open. Their Box permissions carry straight into Agentforce, so the agent stays governed and only acts on what that user is allowed to see. | | Sarah - done |
| **Action:**<br>Agentforce / Box AI reviews the redlines from previous contracts.<br>Surfaces that on the initial contract and the previous renewal, ACME agreed to a much lower cap.<br><br>**Callout:** Left unaddressed, these redlines put the deal at risk of closing in the forecasted quarter. | Agentforce also looks at ACME’s earlier contracts, and shows they agreed to a much lower cap on both the original deal and the last renewal — giving Alex and legal a clear precedent to push back with, which cuts down the back-and-forth. Left alone, a redline like this is what holds up signature and pushes the deal out of the forecasted quarter. | ** Flow step missing here? Should we send a file request or something to update the limitation of liability clause? | Sarah - done |

---

## Flow 4 - Generate
**Persona:** Alex Bennett (Contract Manager)

| Action / Build | Script | Notes | Owner |
| :--- | :--- | :--- | :--- |
| **Action:**<br>Terms resolved and approved on the record.<br>Click Generate Document (Box Doc Gen).<br>Doc Gen builds the matching order form from the approved Salesforce data.<br>Highlight the pulled fields: account name, negotiated terms, amount. | Thanks to the information surfaced, Alex and legal were able to successfully negotiate the contract and settle the terms.<br><br>Now with the terms settled, Box Doc Gen builds the matching order form from the Salesforce data — pulling in the account, the negotiated terms, and the amount. Because it’s generated straight from the record, the numbers Alex just approved are the numbers in the document, with no re-typing. The finished order form saves back into the deal’s Box folder. | | Sarah - done |

---

## Flow 5 - Sign
**Persona:** Alex Bennett (Contract Manager)

| Action / Build | Script | Notes | Owner |
| :--- | :--- | :--- | :--- |
| **Action:**<br>Click Send with Box Sign; signer details auto-populate from Salesforce.<br>Route for signature and execute.<br>Executed document returns to Box; on return it is auto-classified and blocked from external sharing; status updates on the record.<br>Extract runs on the signed version → sets the renewal dates and creates the renewal task. | Alex sends it for signature with Box Sign, and the signer details fill in automatically from Salesforce. Box Sign includes unlimited e-signatures, so there’s no added cost no matter how many contracts go out. Once it’s signed, the executed document comes back into Box and the record updates. On the way in, Box automatically classifies it as confidential and blocks external sharing, so an executed contract can’t accidentally leave the company. Extract runs one more time on the signed version to set the renewal dates and create a follow-up task — so the record stays current with what was actually agreed. | To do: test automate flow | Sarah - in progress |

---

## Flow 5 - Governance in Action — Same Content, Same Agent, Different Access
**Personas:** Deal AE; a rep not on the deal team

| Action / Build | Script | Notes | Owner |
| :--- | :--- | :--- | :--- |
| **Action:**<br>The deal’s AE opens Agentforce and asks: “Is the ACME MSA signed, what did we agree to, and which of my accounts auto-renew in the next 90 days with non-standard liability terms?”<br>Agentforce returns an accurate, cited answer from the now-current record.<br><br>The opportunity is closed won. Now the AE logs into Agentforce and uses the executed contract and order form to summarize a knowledge transfer for internal teams. The AE then pushes out the win notice to slack along with kudos to the deal team and the knowledge transfer document summarizing what the account team needs to know to get started. The knowledge transfer doc that was created is saved in Box with the specified deal & account teams given permission to access and edit it. | Because the record is now up to date, the deal’s AE can ask Agentforce plain questions and get real answers — whether the ACME contract is signed, what was agreed, or which accounts auto-renew in the next 90 days with non-standard liability terms. Agentforce answers with citations back to the source documents in Box.<br><br>*(Sarah to update based on notes)* | **Closed won / Slack win notice:**<br>- Agentforce: post win notice!<br>- Kudos to X for their contributions - see win notice and kudos.<br>- Use the contracts and order form, summarize a knowledge transfer and post to slack.<br>- Have the knowledge transfer doc saved to Box with permissions intact for the deal/account team to access/edit. | |
| **Action:**<br>A rep who isn’t on the deal folder asks Agentforce the same question. The agent has no content to draw from, and returns nothing.<br><br>**Callout:** Same content, same agent, different access. | Now a rep who isn’t on this deal asks the same question. They aren’t a collaborator on the deal folder, so the content isn’t there for them, and the agent has nothing to answer from. That’s the point: with Box, permissions travel with the content, so they apply on every agent interaction — the agent can only act on what that user is allowed to see. | | |

---

## Close
That’s the whole contract cycle — a redlined document turned into a signed, current Salesforce record, without anyone leaving Salesforce or re-keying a term. The content that used to sit unused in a file is now structured, connected, and governed the whole way, driving the renewal and finance work that comes next — compliantly, and at enterprise scale.