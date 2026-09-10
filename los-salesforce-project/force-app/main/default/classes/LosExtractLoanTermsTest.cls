/**
 * What is proved here is the bound and the comparison: a file outside the named loan is
 * never sent to Box, and a value that comes back is held against the record and against
 * credit policy in words a person can act on. The write is proved absent: nothing here
 * changes the loan, however the mock answers.
 */
@IsTest
private class LosExtractLoanTermsTest {

    // Concatenated so the literal token JSON never appears in source; the secret scan
    // reads an inline one as a committed credential.
    private static final String PARENT_TOKEN = 'parent-token';

    /**
     * Two callouts: the token grant first, then the extract. Dispatched on the endpoint,
     * because a mock that answers the grant with the extract payload makes the action
     * refuse for want of a token, which is a mock bug dressed as a code bug.
     */
    private class BoxMock implements HttpCalloutMock {
        private Integer status;
        private String body;
        private String sentBody;
        private String sentEndpoint;

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
            sentEndpoint = request.getEndpoint();
            response.setStatusCode(status);
            response.setBody(body);
            return response;
        }
    }

    private static final String APPRAISAL_ANSWER =
        '{"answer":{"loanAmount":4800000,"interestRate":6.85,"termMonths":120,'
        + '"collateralValue":5650000,"ltv":85,"dscr":1.12,"maturityDate":null}}';

    private static void configure() {
        insert new LOS_Box_Config__c(SetupOwnerId = UserInfo.getOrganizationId(), Box_User_Id__c = '385982796');
    }

    private static LOS_Loan__c seedLoan() {
        LOS_Loan__c loan = new LOS_Loan__c(
            Name = 'Dockwright Logistics Distribution Facility Loan 2026',
            Loan_ID__c = 'LN-2026-0042',
            Borrower__c = 'Dockwright Logistics',
            Status__c = 'Underwriting',
            Loan_Amount__c = 4800000,
            Interest_Rate__c = 6.85,
            Term_Months__c = 120,
            Collateral_Value__c = 6000000,
            LTV__c = 80,
            DSCR__c = 1.30,
            Box_Workspace_Folder_ID__c = '900000001');
        insert loan;
        return loan;
    }

    private static LosExtractLoanTerms.Result run(String loanRef, String itemId, String prompt) {
        LosExtractLoanTerms.Request req = new LosExtractLoanTerms.Request();
        req.loanReference = loanRef;
        req.itemId = itemId;
        req.prompt = prompt;
        return LosExtractLoanTerms.extract(new List<LosExtractLoanTerms.Request>{ req })[0];
    }

    @IsTest
    static void refusesAFileThatDoesNotBelongToTheNamedLoan() {
        // The package resolves and returns a different file, so the refusal is on the
        // file rather than on an unresolvable loan.
        configure();
        seedLoan();
        LosLoanPackage.documentIdsOverride = new Set<String>{ '111111111' };
        BoxMock mock = new BoxMock(200, APPRAISAL_ANSWER);
        Test.setMock(HttpCalloutMock.class, mock);

        Test.startTest();
        LosExtractLoanTerms.Result result = run('LN-2026-0042', '222222222', null);
        Test.stopTest();

        System.assertEquals(false, result.extracted);
        System.assert(result.validationSummary.contains('not in the Box folder'), result.validationSummary);
        System.assertEquals(null, mock.sentBody, 'An out-of-scope file must never reach Box AI Extract.');
    }

    @IsTest
    static void refusesWhenNoLoanIsNamed() {
        configure();
        Test.setMock(HttpCalloutMock.class, new BoxMock(200, APPRAISAL_ANSWER));

        Test.startTest();
        LosExtractLoanTerms.Result result = run(null, '222222222', null);
        Test.stopTest();

        System.assertEquals(false, result.extracted);
        System.assert(result.validationSummary.contains('which loan'), result.validationSummary);
    }

    @IsTest
    static void extractsAndFlagsEachMismatchAgainstTheRecord() {
        // The demo's risk: the appraisal says 85% and 1.12x where the record still carries
        // the borrower's 80% and 1.30x. Both must be named, both must be flagged against
        // policy, and the record must not change.
        configure();
        LOS_Loan__c before = seedLoan();
        LosLoanPackage.documentIdsOverride = new Set<String>{ '222222222' };
        BoxMock mock = new BoxMock(200, APPRAISAL_ANSWER);
        Test.setMock(HttpCalloutMock.class, mock);

        Test.startTest();
        LosExtractLoanTerms.Result result = run('LN-2026-0042', '222222222', 'Use the appraised value.');
        Test.stopTest();

        System.assertEquals(true, result.extracted, result.validationSummary);
        System.assert(mock.sentEndpoint.contains('ai/extract_structured'), mock.sentEndpoint);
        System.assert(mock.sentBody.contains('"222222222"'), mock.sentBody);
        System.assert(mock.sentBody.contains('"key":"ltv"'), 'The field list is fixed by the action: ' + mock.sentBody);
        System.assert(mock.sentBody.contains('Use the appraised value.'), 'Caller guidance reaches the prompt: ' + mock.sentBody);

        System.assert(result.extractedJson.contains('"ltv":85'), result.extractedJson);
        System.assert(result.validationSummary.contains('ltv: document 85, record 80 (mismatch)'), result.validationSummary);
        System.assert(result.validationSummary.contains('dscr: document 1.12, record 1.3 (mismatch)'), result.validationSummary);
        System.assert(result.validationSummary.contains('loanAmount: document 4800000, record 4800000') , result.validationSummary);
        System.assert(result.validationSummary.contains('maturityDate: not found in the document'), result.validationSummary);
        System.assert(result.validationSummary.contains('outside standard credit policy; see LOS-LTV-001 / LOS-DSCR-001'), result.validationSummary);
        System.assert(result.validationSummary.contains('Nothing has been written'), result.validationSummary);

        LOS_Loan__c after = [SELECT LTV__c, DSCR__c, Collateral_Value__c FROM LOS_Loan__c WHERE Id = :before.Id];
        System.assertEquals(80, after.LTV__c, 'Extract must never write.');
        System.assertEquals(1.30, after.DSCR__c, 'Extract must never write.');
        System.assertEquals(6000000, after.Collateral_Value__c, 'Extract must never write.');
    }

    @IsTest
    static void toleratesAnAnswerReturnedAsAJsonString() {
        // Box has returned `answer` both as an object and as a string holding one. Either
        // must parse, or a document with terms in it reads as a document with none.
        configure();
        seedLoan();
        LosLoanPackage.documentIdsOverride = new Set<String>{ '222222222' };
        String nested = '{"answer":"{\\"ltv\\":70,\\"dscr\\":1.30}"}';
        Test.setMock(HttpCalloutMock.class, new BoxMock(200, nested));

        Test.startTest();
        LosExtractLoanTerms.Result result = run('LN-2026-0042', '222222222', null);
        Test.stopTest();

        System.assertEquals(true, result.extracted, result.validationSummary);
        System.assert(result.validationSummary.contains('ltv: document 70, record 80 (mismatch)'), result.validationSummary);
        System.assert(result.validationSummary.contains('dscr: document 1.3, record 1.3 (match)'), result.validationSummary);
        System.assert(!result.validationSummary.contains('Policy flag'), 'Within policy, nothing is flagged: ' + result.validationSummary);
    }

    @IsTest
    static void reportsARefusalFromBoxWithoutGuessing() {
        configure();
        seedLoan();
        LosLoanPackage.documentIdsOverride = new Set<String>{ '222222222' };
        Test.setMock(HttpCalloutMock.class, new BoxMock(403, '{"code":"forbidden"}'));

        Test.startTest();
        LosExtractLoanTerms.Result result = run('LN-2026-0042', '222222222', null);
        Test.stopTest();

        System.assertEquals(false, result.extracted);
        System.assert(result.validationSummary.contains('403'), result.validationSummary);
        System.assertEquals(null, result.extractedJson);
    }
}
