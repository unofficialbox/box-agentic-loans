@isTest
private class EmailIntakeHandlerTest {

    private static Messaging.InboundEmail buildEmail(String fromAddr, String subject, Boolean withAttachment) {
        Messaging.InboundEmail email = new Messaging.InboundEmail();
        email.fromAddress = fromAddr;
        email.fromName = 'Jordan Pike';
        email.subject = subject;
        email.plainTextBody = 'Please find our loan application package attached.';
        email.toAddresses = new List<String>{ 'lending@acmebank.example' };
        if (withAttachment) {
            Messaging.InboundEmail.BinaryAttachment att = new Messaging.InboundEmail.BinaryAttachment();
            att.fileName = 'dockwright-loan-application-2026.pdf';
            att.body = Blob.valueOf('%PDF-1.7 fake bytes');
            email.binaryAttachments = new List<Messaging.InboundEmail.BinaryAttachment>{ att };
        }
        return email;
    }

    @isTest
    static void logsEmailActivityOntoOpportunity() {
        Account acct = new Account(Name = 'Dockwright Logistics', Website = 'https://www.dockwrightlogistics.example');
        insert acct;
        insert new Contact(
            FirstName = 'Jordan', LastName = 'Pike',
            Email = 'kadams@boxdemo.com', AccountId = acct.Id
        );
        Opportunity opp = new Opportunity(
            Name = 'Dockwright Logistics - Distribution Facility Acquisition',
            AccountId = acct.Id, StageName = 'Proposal/Price Quote',
            CloseDate = Date.today().addMonths(4)
        );
        insert opp;

        Messaging.InboundEmail email = buildEmail('kadams@boxdemo.com', 'Dockwright loan application package 2026', true);
        Messaging.InboundEnvelope env = new Messaging.InboundEnvelope();
        env.fromAddress = email.fromAddress;

        Test.startTest();
        Messaging.InboundEmailResult res = new EmailIntakeHandler().handleInboundEmail(email, env);
        Test.stopTest();

        System.assert(res.success, 'handler should report success');
        Integer emails = [SELECT COUNT() FROM EmailMessage WHERE RelatedToId = :opp.Id];
        Integer tasks = [SELECT COUNT() FROM Task WHERE WhatId = :opp.Id];
        System.assert(emails + tasks >= 1, 'an email or task activity should be logged on the Opportunity');
        // The attachment is uploaded to Box (async, skipped in tests); nothing is stored in Salesforce.
        System.assertEquals(0, [SELECT COUNT() FROM ContentVersion], 'no Salesforce File should be created');
    }

    @isTest
    static void matchesByDomainWhenNoContact() {
        Account acct = new Account(Name = 'Pinecrest Dental Group', Website = 'https://www.pinecrestdental.example');
        insert acct;
        Opportunity opp = new Opportunity(
            Name = 'Pinecrest Dental Practice Expansion 2026',
            AccountId = acct.Id, StageName = 'Qualification',
            CloseDate = Date.today().addMonths(6)
        );
        insert opp;

        Messaging.InboundEmail email = buildEmail('newperson@pinecrestdental.example', 'Practice expansion application', true);
        Messaging.InboundEnvelope env = new Messaging.InboundEnvelope();

        Test.startTest();
        new EmailIntakeHandler().handleInboundEmail(email, env);
        Test.stopTest();

        Integer emails = [SELECT COUNT() FROM EmailMessage WHERE RelatedToId = :opp.Id];
        Integer tasks = [SELECT COUNT() FROM Task WHERE WhatId = :opp.Id];
        System.assert(emails + tasks >= 1, 'domain fallback should log an activity on the Opportunity');
    }

    @isTest
    static void unmatchedSenderIsSafe() {
        Messaging.InboundEmail email = buildEmail('stranger@nowhere.example', 'hello', false);
        Messaging.InboundEnvelope env = new Messaging.InboundEnvelope();

        Test.startTest();
        Messaging.InboundEmailResult res = new EmailIntakeHandler().handleInboundEmail(email, env);
        Test.stopTest();

        System.assert(res.success, 'unmatched sender should still succeed (no bounce)');
        System.assertEquals(0, [SELECT COUNT() FROM EmailMessage], 'nothing logged for an unmatched sender');
        System.assertEquals(0, [SELECT COUNT() FROM Task], 'nothing logged for an unmatched sender');
    }
}
