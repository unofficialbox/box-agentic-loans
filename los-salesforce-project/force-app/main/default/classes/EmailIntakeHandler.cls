/**
 * Inbound email service handler for LOS loan application intake.
 *
 * Captures an inbound email (for example, a borrower emailing an application package)
 * onto the matching Opportunity's activity timeline, and uploads its attachments
 * straight into that Opportunity's Box folder (via BoxEmailAttachmentUploader).
 *
 * Matching: sender address -> Contact.Email -> Contact.Account -> an open Opportunity
 * on that Account (subject may name a specific Opportunity to override the default).
 *
 * Storage: the attachment bytes are NOT persisted in Salesforce as a ContentVersion.
 * The file lives once, in Box, and surfaces on the Opportunity through the Box for
 * Salesforce managed package's record -> folder mapping.
 *
 * Boundary: this handler intentionally does NOT create or update LOS_Loan__c.
 * Loan-record creation stays in the governed, human-gated Box intake path.
 */
global without sharing class EmailIntakeHandler implements Messaging.InboundEmailHandler {

    global Messaging.InboundEmailResult handleInboundEmail(
        Messaging.InboundEmail email,
        Messaging.InboundEnvelope envelope
    ) {
        Messaging.InboundEmailResult result = new Messaging.InboundEmailResult();
        // Always succeed so the external sender is never bounced; failures are logged.
        result.success = true;
        try {
            process(email);
        } catch (Exception e) {
            System.debug(LoggingLevel.ERROR,
                'EmailIntakeHandler error: ' + e.getMessage() + '\n' + e.getStackTraceString());
        }
        return result;
    }

    private void process(Messaging.InboundEmail email) {
        String sender = normalize(email == null ? null : email.fromAddress);
        if (String.isBlank(sender)) {
            return;
        }

        Opportunity opp = resolveOpportunity(sender, email.subject);
        if (opp == null) {
            // No Opportunity to attribute this to; nothing captured. Safe no-op.
            return;
        }

        logEmailActivity(email, opp.Id, sender);
        enqueueBoxUpload(email, opp.Id);
    }

    /** sender -> Contact -> Account -> open Opportunity (subject token overrides default). */
    private Opportunity resolveOpportunity(String sender, String subject) {
        Id accountId = null;

        List<Contact> contacts = [
            SELECT Id, AccountId
            FROM Contact
            WHERE Email = :sender AND AccountId != null
            ORDER BY LastModifiedDate DESC
            LIMIT 1
        ];
        if (!contacts.isEmpty()) {
            accountId = contacts[0].AccountId;
        } else {
            String domain = senderDomain(sender);
            if (String.isNotBlank(domain)) {
                String pattern = '%' + domain + '%';
                List<Account> accts = [
                    SELECT Id
                    FROM Account
                    WHERE Website != null AND Website LIKE :pattern
                    ORDER BY LastModifiedDate DESC
                    LIMIT 1
                ];
                if (!accts.isEmpty()) {
                    accountId = accts[0].Id;
                }
            }
        }
        if (accountId == null) {
            return null;
        }

        List<Opportunity> opps = [
            SELECT Id, Name
            FROM Opportunity
            WHERE AccountId = :accountId AND IsClosed = false
            ORDER BY CreatedDate DESC
        ];
        if (opps.isEmpty()) {
            opps = [
                SELECT Id, Name
                FROM Opportunity
                WHERE AccountId = :accountId
                ORDER BY CreatedDate DESC
            ];
        }
        if (opps.isEmpty()) {
            return null;
        }

        if (String.isNotBlank(subject)) {
            for (Opportunity o : opps) {
                if (o.Name != null && subject.containsIgnoreCase(o.Name)) {
                    return o;
                }
            }
        }
        return opps[0];
    }

    /** Log the email on the Opportunity timeline; fall back to a Task if EmailMessage is unavailable. */
    private void logEmailActivity(Messaging.InboundEmail email, Id oppId, String sender) {
        String subject = String.isBlank(email.subject) ? '(no subject)' : email.subject;
        String bodyText = email.plainTextBody != null ? email.plainTextBody
                     : (email.htmlBody != null ? email.htmlBody : '');
        try {
            EmailMessage em = new EmailMessage();
            em.Subject = subject;
            em.FromAddress = sender;
            em.FromName = email.fromName;
            em.ToAddress = joinAddresses(email.toAddresses);
            em.TextBody = bodyText;
            em.HtmlBody = email.htmlBody;
            em.Incoming = true;
            em.MessageDate = System.now();
            em.Status = '0'; // New
            em.RelatedToId = oppId;
            insert em;
        } catch (Exception e) {
            // Enhanced Email may not be enabled; log a Task activity instead.
            // Use Schema.Task: a managed package in this org shadows the bare `Task` identifier.
            Schema.Task t = new Schema.Task();
            t.Subject = 'Email: ' + subject;
            t.Description = bodyText;
            t.WhatId = oppId;
            t.Type = 'Email';
            t.Status = 'Completed';
            t.Priority = 'Normal';
            t.ActivityDate = System.today();
            insert t;
        }
    }

    /**
     * Hand the attachments to a Queueable that uploads them straight to the Opportunity's
     * Box folder. The bytes are never persisted in Salesforce as a ContentVersion — the file
     * lives once, in Box, and surfaces on the Opportunity via the managed package's Box widget.
     */
    private void enqueueBoxUpload(Messaging.InboundEmail email, Id oppId) {
        if (email.binaryAttachments == null || email.binaryAttachments.isEmpty()) {
            return;
        }
        List<BoxEmailAttachmentUploader.Attachment> atts = new List<BoxEmailAttachmentUploader.Attachment>();
        for (Messaging.InboundEmail.BinaryAttachment att : email.binaryAttachments) {
            if (att == null || att.body == null) {
                continue;
            }
            atts.add(new BoxEmailAttachmentUploader.Attachment(
                String.isBlank(att.fileName) ? 'attachment' : att.fileName,
                EncodingUtil.base64Encode(att.body)
            ));
        }
        if (!atts.isEmpty() && !Test.isRunningTest()) {
            System.enqueueJob(new BoxEmailAttachmentUploader(oppId, atts));
        }
    }

    private String senderDomain(String sender) {
        if (sender == null || !sender.contains('@')) {
            return null;
        }
        return sender.substringAfter('@').trim().toLowerCase();
    }

    private String normalize(String addr) {
        return addr == null ? null : addr.trim().toLowerCase();
    }

    private String joinAddresses(List<String> addrs) {
        if (addrs == null || addrs.isEmpty()) {
            return null;
        }
        return String.join(addrs, '; ');
    }
}
