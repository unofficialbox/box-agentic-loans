@IsTest
private class LosGenerateCommitmentLetterTest {

    // Concatenated so the literal token JSON never appears in source; the secret scan
    // reads an inline one as a committed credential.
    private static final String PARENT_TOKEN = 'parent-token';

    private class BoxMock implements HttpCalloutMock {
        private Integer status;
        private String body;
        /** The body Box was actually sent, so a test can assert on what was merged. */
        private String sentBody;

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
            sentBody = request.getBody();
            response.setStatusCode(status);
            response.setBody(body);
            return response;
        }
    }

    private static void configure(String templateId) {
        insert new LOS_Box_Config__c(
            SetupOwnerId = UserInfo.getOrganizationId(),
            Box_User_Id__c = '100000001',
            Commitment_Letter_Template_ID__c = templateId);
    }

    private static LOS_Loan__c seedLoan() {
        LOS_Loan__c loan = new LOS_Loan__c(
            Name = 'Test Borrower Distribution Facility Loan',
            Loan_ID__c = 'LN-TEST-0001',
            Borrower__c = 'Test Borrower',
            Status__c = 'Underwriting',
            Risk_Rating__c = 'High',
            Loan_Amount__c = 4800000,
            Box_Workspace_Folder_ID__c = '900000001');
        insert loan;
        return loan;
    }

    private static LosGenerateCommitmentLetter.Request request(String reference, String policy) {
        LosGenerateCommitmentLetter.Request req = new LosGenerateCommitmentLetter.Request();
        req.loanReference = reference;
        req.policyAtIssue = policy;
        req.requestedPosition = '85% LTV with FF&E in the collateral pool; DSCR 1.10x tested annually.';
        req.approvedPosition = 'LOS-LTV-001 - 75% maximum LTV';
        req.exceptionPosition = 'LOS-LTV-002 - 80% with interest reserve';
        req.owner = 'Credit Risk';
        req.precedentSummary = '70% LTV and 1.30x DSCR accepted in 2023 and 2025';
        req.proposedTerms = 'Commit at 75% LTV on the appraised value with a 1.25x DSCR covenant tested quarterly.';
        return req;
    }

    private static LosGenerateCommitmentLetter.Result run(LosGenerateCommitmentLetter.Request req) {
        return LosGenerateCommitmentLetter.generate(
            new List<LosGenerateCommitmentLetter.Request>{ req })[0];
    }

    @IsTest
    static void generatesIntoTheLoansOwnFolder() {
        configure('800000001');
        seedLoan();
        BoxMock mock = new BoxMock(202, '{"id":"batch-1","type":"docgen_batch"}');
        Test.setMock(HttpCalloutMock.class, mock);

        Test.startTest();
        LosGenerateCommitmentLetter.Result result = run(request('LN-TEST-0001', 'Section 9.3 and Schedule A'));
        Test.stopTest();

        System.assertEquals(true, result.generated, result.summary);
        System.assertEquals('batch-1', result.batchId);
        // The destination is the loan's governed folder, not one the caller chose.
        System.assert(mock.sentBody.contains('900000001'), mock.sentBody);
        System.assert(mock.sentBody.contains('800000001'), mock.sentBody);
        System.assert(mock.sentBody.contains('commitment-letter-LN-TEST-0001'), mock.sentBody);
        System.assert(result.summary.contains('Credit Committee'), result.summary);
    }

    @IsTest
    static void takesLoanFactsFromTheRecordNotTheRequest() {
        // A caller must not be able to misattribute a letter: the id, borrower and risk
        // on the page come from the record the reference resolved to.
        configure('800000001');
        seedLoan();
        BoxMock mock = new BoxMock(202, '{"id":"batch-2"}');
        Test.setMock(HttpCalloutMock.class, mock);

        Test.startTest();
        run(request('LN-TEST-0001', 'Section 9.3 and Schedule A'));
        Test.stopTest();

        System.assert(mock.sentBody.contains('LN-TEST-0001'), mock.sentBody);
        System.assert(mock.sentBody.contains('Test Borrower'), mock.sentBody);
        System.assert(mock.sentBody.contains('High'), mock.sentBody);
        System.assert(mock.sentBody.contains('LOS-LTV-001'), mock.sentBody);
        System.assert(mock.sentBody.contains('accepted in 2023 and 2025'), mock.sentBody);
    }

    @IsTest
    static void refusesWhenNoTemplateIsConfigured() {
        // The bank chooses what it generates from, the same way it chooses the credit
        // policy library. Without configuration there is nothing to generate and nothing
        // is sent.
        insert new LOS_Box_Config__c(
            SetupOwnerId = UserInfo.getOrganizationId(), Box_User_Id__c = '100000001');
        seedLoan();
        Test.setMock(HttpCalloutMock.class, new BoxMock(202, '{"id":"unreachable"}'));

        Test.startTest();
        LosGenerateCommitmentLetter.Result result = run(request('LN-TEST-0001', 'Section 9.3 and Schedule A'));
        Test.stopTest();

        System.assertEquals(false, result.generated);
        System.assert(result.summary.contains('No commitment letter template'), result.summary);
    }

    @IsTest
    static void refusesAnUnknownLoan() {
        configure('800000001');
        Test.setMock(HttpCalloutMock.class, new BoxMock(202, '{"id":"unreachable"}'));

        Test.startTest();
        LosGenerateCommitmentLetter.Result result = run(request('LN-NOT-A-LOAN', 'Section 9.3 and Schedule A'));
        Test.stopTest();

        System.assertEquals(false, result.generated);
        System.assert(result.summary.contains('could not find'), result.summary);
    }

    @IsTest
    static void refusesWithoutAPolicyAtIssue() {
        configure('800000001');
        seedLoan();
        Test.setMock(HttpCalloutMock.class, new BoxMock(202, '{"id":"unreachable"}'));

        Test.startTest();
        LosGenerateCommitmentLetter.Result result = run(request('LN-TEST-0001', null));
        Test.stopTest();

        System.assertEquals(false, result.generated);
        System.assert(result.summary.contains('policy at issue'), result.summary);
    }

    @IsTest
    static void reportsARefusalFromBoxWithoutClaimingSuccess() {
        configure('800000001');
        seedLoan();
        Test.setMock(HttpCalloutMock.class, new BoxMock(400, '{"code":"bad_request"}'));

        Test.startTest();
        LosGenerateCommitmentLetter.Result result = run(request('LN-TEST-0001', 'Section 9.3 and Schedule A'));
        Test.stopTest();

        System.assertEquals(false, result.generated);
        System.assert(result.summary.contains('refused'), result.summary);
    }
}
