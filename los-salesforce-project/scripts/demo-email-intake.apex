/*
 * Demo: simulate a borrower emailing a loan application package in.
 * Run with:  sf apex run --target-org <alias> --file los-salesforce-project/scripts/demo-email-intake.apex
 *
 * Invokes EmailIntakeHandler exactly as the inbound Email Service would, using a sample
 * borrower Contact address. It logs the email on the matching Opportunity and uploads the
 * attachment into that Opportunity's Box folder (stored once, in Box).
 *
 * Change SENDER to a Contact.Email that exists in the org, and SUBJECT/FILE_NAME as desired.
 * The attachment bytes come from the Los_Sample_Loan_Application static resource (the repo's
 * sample Dockwright loan application PDF), so the demo sends a real loan document.
 */
String SENDER    = 'kadams@boxdemo.com';   // must match a Contact.Email
String SUBJECT   = 'Dockwright loan application package 2026 (demo)';
String FILE_NAME = 'dockwright-loan-application-2026.pdf';
Blob   FILE_BODY = [SELECT Body FROM StaticResource WHERE Name = 'Los_Sample_Loan_Application' LIMIT 1].Body;

Messaging.InboundEmail email = new Messaging.InboundEmail();
email.fromAddress = SENDER;
email.fromName    = 'Jordan Pike';
email.subject     = SUBJECT;
email.plainTextBody = 'Please find our loan application package attached for your review.';
email.toAddresses = new List<String>{ 'loan-intake@example.com' };
Messaging.InboundEmail.BinaryAttachment att = new Messaging.InboundEmail.BinaryAttachment();
att.fileName = FILE_NAME;
att.body     = FILE_BODY;
email.binaryAttachments = new List<Messaging.InboundEmail.BinaryAttachment>{ att };

Messaging.InboundEnvelope env = new Messaging.InboundEnvelope();
env.fromAddress = SENDER;

Messaging.InboundEmailResult res = new EmailIntakeHandler().handleInboundEmail(email, env);
System.debug('DEMO handler success=' + res.success);
System.debug('DEMO next: open the matched Opportunity; the email is on its timeline, ' +
    'and "' + FILE_NAME + '" is in the Opportunity Box folder (uploads asynchronously; give it a few seconds).');
