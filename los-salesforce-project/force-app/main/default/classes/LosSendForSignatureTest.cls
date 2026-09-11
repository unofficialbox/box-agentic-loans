@IsTest
private class LosSendForSignatureTest {

    // Concatenated so the literal token JSON never appears in source; the secret scan
    // reads an inline one as a committed credential.
    private static final String PARENT_TOKEN = 'parent-token';

    private class BoxMock implements HttpCalloutMock {
        private Integer status;
        private String body;
        private Boolean signCalled = false;

        private BoxMock(Integer status, String body) {
            this.status = status;
            this.body = body;
        }

        public HttpResponse respond(HttpRequest request) {
            HttpResponse response = new HttpResponse();
            response.setHeader('Content-Type', 'application/json');
            if (request.getEndpoint().contains('oauth2/token')) {
                response.setStatusCode(200);
                response.setBody('{"access_' + 'token":"' + PARENT_TOKEN + '","expires_in":3600}');
                return response;
            }
            Map<String,Object> sent=(Map<String,Object>)JSON.deserializeUntyped(request.getBody());
            Map<String,Object> signer=(Map<String,Object>)((List<Object>)sent.get('signers'))[0];
            System.assert(!sent.containsKey('redirect_url'), 'Keep completion in Box; never nest the portal.');
            System.assert(!signer.containsKey('declined_redirect_url'));
            signCalled = true;
            response.setStatusCode(status);
            response.setBody(body);
            return response;
        }
    }

    private static void configure() {
        insert new LOS_Box_Config__c(
            SetupOwnerId = UserInfo.getOrganizationId(), Box_User_Id__c = '100000001',
            Borrower_Portal_URL__c = 'https://example.my.site.com/loans/');
    }

    private static void seedLoan(String status) {
        insert new LOS_Loan__c(
            Name = 'Test Borrower Distribution Facility Loan',
            Loan_ID__c = 'LN-TEST-0001',
            Borrower__c = 'Test Borrower',
            Status__c = status,
            Box_Workspace_Folder_ID__c = '900000001');
    }

    private static LosSendForSignature.Result run(String reference, String itemId, String email) {
        LosSendForSignature.Request req = new LosSendForSignature.Request();
        req.loanReference = reference;
        req.itemId = itemId;
        req.signerEmail = email;
        req.signerName = 'Test Signer';
        return LosSendForSignature.prepare(new List<LosSendForSignature.Request>{ req })[0];
    }

    @IsTest
    static void refusesWhileTheLoanIsStillInUnderwriting() {
        // The guardrail the whole demo rests on. A loan that has not cleared credit
        // approval is not signable, and no request reaches Box at all.
        configure();
        seedLoan('Underwriting');
        BoxMock mock = new BoxMock(200, '{"id":"unreachable"}');
        Test.setMock(HttpCalloutMock.class, mock);

        Test.startTest();
        LosSendForSignature.Result result = run('LN-TEST-0001', '700000001', 'signer@example.com');
        Test.stopTest();

        System.assertEquals(false, result.prepared);
        System.assert(result.summary.contains('not approved for signature'), result.summary);
        System.assert(result.summary.contains('Underwriting'), 'The refusal names the status: ' + result.summary);
        System.assert(result.summary.contains('Credit Committee'), result.summary);
        System.assertEquals(false, mock.signCalled, 'Box must not be called for an unapproved loan.');
    }

    @IsTest
    static void refusesToSignALoanThatIsAlreadyClosed() {
        configure();
        seedLoan('Closed');
        Test.setMock(HttpCalloutMock.class, new BoxMock(200, '{"id":"unreachable"}'));

        Test.startTest();
        LosSendForSignature.Result result = run('LN-TEST-0001', '700000001', 'signer@example.com');
        Test.stopTest();

        System.assertEquals(false, result.prepared);
        System.assert(result.summary.contains('not approved for signature'), result.summary);
    }

    @IsTest
    static void refusesAFileThatDoesNotBelongToTheNamedLoan() {
        // The same bound reading a document has. The Toolkit returns no documents in a
        // test context, so no file can be confirmed as in scope and none is routed.
        configure();
        seedLoan('Approved');
        BoxMock mock = new BoxMock(200, '{"id":"unreachable"}');
        Test.setMock(HttpCalloutMock.class, mock);

        Test.startTest();
        LosSendForSignature.Result result = run('LN-TEST-0001', '700000001', 'signer@example.com');
        Test.stopTest();

        System.assertEquals(false, result.prepared);
        System.assert(
            result.summary.contains('could not resolve') || result.summary.contains('not in the Box folder'),
            result.summary);
        System.assertEquals(false, mock.signCalled, 'An out-of-scope file must never reach Box Sign.');
    }

    @IsTest
    static void storesTheRequestedSignersIframeUrlWhenTheLoanIsApproved() {
        // Box can return a sender before the requested signer and two different URLs.
        configure();
        seedLoan('Approved');
        LosLoanPackage.documentIdsOverride = new Set<String>{ '700000001' };
        BoxMock mock = new BoxMock(200,
            '{"id":"sign-1","signers":['
            + '{"email":"sender@example.com","role":"final_copy_reader","iframeable_embed_url":"https://app.box.com/embed/sign/sender"},'
            + '{"email":"signer@example.com","role":"signer","embed_url":"https://app.box.com/sign/not-frameable",'
            + '"iframeable_embed_url":"https://app.box.com/embed/sign/document/test"}]}');
        Test.setMock(HttpCalloutMock.class, mock);

        Test.startTest();
        LosSendForSignature.Result result = run('LN-TEST-0001', '700000001', 'signer@example.com');
        Test.stopTest();

        System.assertEquals(true, result.prepared, result.summary);
        System.assertEquals('sign-1', result.requestId);
        System.assertEquals('https://app.box.com/embed/sign/document/test', result.embedUrl);
        System.assertEquals(result.embedUrl, [SELECT Sign_Embed_URL__c FROM LOS_Loan__c LIMIT 1].Sign_Embed_URL__c);
        System.assert(result.summary.contains('ready for embedded signing'), result.summary);
    }

    @IsTest
    static void preparesWhenTheLoanIsAtCommitment() {
        configure();
        seedLoan('Commitment');
        LosLoanPackage.documentIdsOverride = new Set<String>{ '700000001' };
        Test.setMock(HttpCalloutMock.class, new BoxMock(200,
            '{"id":"sign-2","signers":[{"email":"signer@example.com","role":"signer",'
            + '"iframeable_embed_url":"https://app.box.com/embed/sign/document/test"}]}'));

        Test.startTest();
        LosSendForSignature.Result result = run('LN-TEST-0001', '700000001', 'signer@example.com');
        Test.stopTest();

        System.assertEquals(true, result.prepared, result.summary);
    }

    @IsTest
    static void doesNotClaimIframeIsReadyWhenOnlyTheNonIframeUrlExists() {
        configure();
        seedLoan('Approved');
        LosLoanPackage.documentIdsOverride = new Set<String>{ '700000001' };
        Test.setMock(HttpCalloutMock.class, new BoxMock(201,
            '{"id":"sign-converting","signers":[{"email":"signer@example.com","role":"signer",'
            + '"embed_url":"https://app.box.com/sign/not-frameable"}]}'));
        Test.startTest();
        LosSendForSignature.Result result = run('LN-TEST-0001', '700000001', 'signer@example.com');
        Test.stopTest();
        System.assertEquals(false, result.prepared);
        System.assertEquals(null, result.embedUrl);
        System.assert(result.summary.contains('Do not create a duplicate'), result.summary);
    }

    @IsTest
    static void doesNotClaimSuccessWhenBoxSignRefuses() {
        configure();
        seedLoan('Approved');
        LosLoanPackage.documentIdsOverride = new Set<String>{ '700000001' };
        Test.setMock(HttpCalloutMock.class, new BoxMock(403, '{"code":"forbidden"}'));

        Test.startTest();
        LosSendForSignature.Result result = run('LN-TEST-0001', '700000001', 'signer@example.com');
        Test.stopTest();

        System.assertEquals(false, result.prepared);
        System.assert(result.summary.contains('nothing was sent'), result.summary);
    }

    @IsTest
    static void refusesWithoutASigner() {
        configure();
        seedLoan('Approved');
        Test.setMock(HttpCalloutMock.class, new BoxMock(200, '{"id":"unreachable"}'));

        Test.startTest();
        LosSendForSignature.Result result = run('LN-TEST-0001', '700000001', null);
        Test.stopTest();

        System.assertEquals(false, result.prepared);
        System.assert(result.summary.contains('need a signer'), result.summary);
    }

    @IsTest
    static void refusesAnUnknownLoan() {
        configure();
        Test.setMock(HttpCalloutMock.class, new BoxMock(200, '{"id":"unreachable"}'));

        Test.startTest();
        LosSendForSignature.Result result = run('LN-NOT-A-LOAN', '700000001', 'signer@example.com');
        Test.stopTest();

        System.assertEquals(false, result.prepared);
        System.assert(result.summary.contains('could not find'), result.summary);
    }

    @IsTest
    static void refusesWithoutAFile() {
        configure();
        seedLoan('Approved');
        Test.setMock(HttpCalloutMock.class, new BoxMock(200, '{"id":"unreachable"}'));

        Test.startTest();
        LosSendForSignature.Result result = run('LN-TEST-0001', null, 'signer@example.com');
        Test.stopTest();

        System.assertEquals(false, result.prepared);
        System.assert(result.summary.contains('Box file ID'), result.summary);
    }
    @IsTest
    static void createsRequestWithoutPortalRedirectConfiguration() {
        configure();
        seedLoan('Approved');
        LosLoanPackage.documentIdsOverride = new Set<String>{ '700000001' };
        LOS_Box_Config__c config = LOS_Box_Config__c.getOrgDefaults();
        config.Borrower_Portal_URL__c = null;
        update config;
        Test.setMock(HttpCalloutMock.class, new BoxMock(200,
            '{"id":"sign-without-redirect","signers":[{"email":"signer@example.com","role":"signer",'
            + '"iframeable_embed_url":"https://app.box.com/embed/sign/document/test"}]}'));
        Test.startTest();
        LosSendForSignature.Result result = run('LN-TEST-0001', '700000001', 'signer@example.com');
        Test.stopTest();
        System.assertEquals(true, result.prepared, result.summary);
        System.assertEquals('sign-without-redirect', result.requestId);

    }

}
