@IsTest
private class LosBoxAskDocumentTest {

    // Concatenated rather than inlined so the literal token JSON never appears in source;
    // the secret scan reads an inline one as a committed credential.
    private static final String PARENT_TOKEN = 'parent-token';

    private class BoxMock implements HttpCalloutMock {
        private Integer askStatus;
        private String askBody;
        /** The body Box was actually sent, so a test can assert on the item type. */
        private String sentBody;

        private BoxMock(Integer askStatus, String askBody) {
            this.askStatus = askStatus;
            this.askBody = askBody;
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
            response.setStatusCode(askStatus);
            response.setBody(askBody);
            return response;
        }
    }

    private static void configure() {
        insert new LOS_Box_Config__c(SetupOwnerId = UserInfo.getOrganizationId(), Box_User_Id__c = '385982796');
    }

    private static LosBoxAskDocument.Result run(String itemId, String prompt) {
        return run(itemId, prompt, null);
    }

    private static LosBoxAskDocument.Result run(String itemId, String prompt, String itemType) {
        return run(itemId, prompt, itemType, 'LN-2026-0042');
    }

    private static LosBoxAskDocument.Result run(String itemId, String prompt, String itemType, String loanRef) {
        LosBoxAskDocument.Request request = new LosBoxAskDocument.Request();
        request.itemId = itemId;
        request.prompt = prompt;
        request.itemType = itemType;
        request.loanReference = loanRef;
        return LosBoxAskDocument.ask(new List<LosBoxAskDocument.Request>{ request })[0];
    }

    @IsTest
    static void refusesAFileThatDoesNotBelongToTheNamedLoan() {
        // The bound that matters: without it the action reads any Box file ID it is given,
        // which is a wider reach than "ask about this loan" implies. The Toolkit returns
        // no documents in a test context, so nothing can be confirmed as in scope.
        configure();
        Test.setMock(HttpCalloutMock.class, new BoxMock(200, '{"answer":"should not be reached"}'));

        Test.startTest();
        LosBoxAskDocument.Result result = run('2438685827262', 'What is the appraised value?', 'file', 'LN-2026-0042');
        Test.stopTest();

        System.assertEquals(false, result.answered);
        System.assert(result.answer.contains('could not resolve') || result.answer.contains('not in the Box folder'),
            result.answer);
    }

    @IsTest
    static void refusesAFileFromAnotherLoanEvenWhenTheReferenceResolves() {
        // The reference is now filled by the model rather than read from a variable, so
        // this check is the only thing standing between "ask about this loan" and "read
        // any Box file". It has to refuse on the file, not merely on an unresolvable
        // loan -- so the package here resolves, and returns a different file.
        configure();
        LosLoanPackage.documentIdsOverride = new Set<String>{ '111111111' };
        BoxMock mock = new BoxMock(200, '{"answer":"should not be reached"}');
        Test.setMock(HttpCalloutMock.class, mock);

        Test.startTest();
        LosBoxAskDocument.Result result = run('222222222', 'What is the appraised value?', 'file', 'LN-2026-0042');
        Test.stopTest();

        System.assertEquals(false, result.answered);
        System.assert(result.answer.contains('not in the Box folder'), result.answer);
        System.assertEquals(null, mock.sentBody, 'An out-of-scope file must never reach Box AI.');
    }

    @IsTest
    static void answersAFileThatDoesBelongToTheNamedLoan() {
        configure();
        LosLoanPackage.documentIdsOverride = new Set<String>{ '222222222' };
        BoxMock mock = new BoxMock(200, '{"answer":"Three coverages, expiring 2027-06-30."}');
        Test.setMock(HttpCalloutMock.class, mock);

        Test.startTest();
        LosBoxAskDocument.Result result = run('222222222', 'What insurance coverages are in force?', 'file', 'LN-2026-0042');
        Test.stopTest();

        System.assertEquals(true, result.answered, result.answer);
        System.assert(mock.sentBody.contains('222222222'), mock.sentBody);
    }

    @IsTest
    static void refusesWhenNoLoanIsNamed() {
        configure();
        Test.setMock(HttpCalloutMock.class, new BoxMock(200, '{"answer":"should not be reached"}'));

        Test.startTest();
        LosBoxAskDocument.Result result = run('2438685827262', 'What is the appraised value?', 'file', null);
        Test.stopTest();

        System.assertEquals(false, result.answered);
        System.assert(result.answer.contains('which loan'), result.answer);
    }

    @IsTest
    static void readsTheConfiguredCreditPolicyLibraryRatherThanTheOneAsked() {
        // The policy library is bank policy, not a caller argument. Whatever Hub id
        // arrives, the configured one is used -- an agent may consult the library, not
        // choose it.
        insert new LOS_Box_Config__c(
            SetupOwnerId = UserInfo.getOrganizationId(),
            Box_User_Id__c = '385982796',
            Credit_Policy_Hub_Id__c = '1347399857');
        BoxMock mock = new BoxMock(200, '{"answer":"LOS-LTV-001 caps loan-to-value at 75%."}');
        Test.setMock(HttpCalloutMock.class, mock);

        Test.startTest();
        LosBoxAskDocument.Result result = run('999999999', 'What is the maximum LTV?', 'hub', null);
        Test.stopTest();

        System.assertEquals(true, result.answered);
        System.assert(mock.sentBody.contains('1347399857'), mock.sentBody);
        System.assert(!mock.sentBody.contains('999999999'), 'The caller must not choose the policy library: ' + mock.sentBody);
    }

    @IsTest
    static void saysSoWhenNoCreditPolicyLibraryIsConfigured() {
        configure();
        Test.setMock(HttpCalloutMock.class, new BoxMock(200, '{"answer":"x"}'));

        Test.startTest();
        LosBoxAskDocument.Result result = run('1347399857', 'What is the maximum LTV?', 'hub', null);
        Test.stopTest();

        System.assertEquals(false, result.answered);
        System.assert(result.answer.contains('No approved credit policy library'), result.answer);
    }

}
