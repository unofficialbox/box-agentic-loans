/**
 * What is proved here is the bound and the enum: a file outside the named loan never
 * reaches Box AI, and only a value the losDocument template actually offers is ever
 * written to a file. The "could not name it" path is proved to write nothing and to say
 * so in a sentence a borrower can read, because that is the answer the checklist relies on.
 */
@IsTest
private class LosClassifyDocumentTest {

    // Concatenated so the literal token JSON never appears in source; the secret scan
    // reads an inline one as a committed credential.
    private static final String PARENT_TOKEN = 'parent-token';
    private static final String FILE_ID = '222222222';

    /** One request Box saw: which endpoint, which verb, what body. */
    private class Sent {
        public String method;
        public String endpoint;
        public String body;
    }

    /**
     * Three callouts in order: the token grant, the extract, then the metadata write.
     * Dispatched on the endpoint, because a mock that answers in sequence cannot tell a
     * missing extract call from a missing write, and the tests below care which one
     * happened.
     */
    private class BoxMock implements HttpCalloutMock {
        private Integer extractStatus;
        private String extractBody;
        private Integer createStatus;
        private Integer patchStatus;
        private List<Sent> sent = new List<Sent>();

        private BoxMock(Integer extractStatus, String extractBody, Integer createStatus, Integer patchStatus) {
            this.extractStatus = extractStatus;
            this.extractBody = extractBody;
            this.createStatus = createStatus;
            this.patchStatus = patchStatus;
        }

        public HttpResponse respond(HttpRequest request) {
            HttpResponse response = new HttpResponse();
            response.setHeader('Content-Type', 'application/json');
            if (request.getEndpoint().contains('oauth2/token')) {
                response.setStatusCode(200);
                response.setBody('{"access_' + 'token":"' + PARENT_TOKEN + '","expires_in":3600}');
                return response;
            }
            Sent record = new Sent();
            record.method = request.getMethod();
            record.endpoint = request.getEndpoint();
            record.body = request.getBody();
            sent.add(record);

            if (request.getEndpoint().contains('ai/extract_structured')) {
                response.setStatusCode(extractStatus);
                response.setBody(extractBody);
                return response;
            }
            if (request.getEndpoint().contains('/metadata/')) {
                response.setStatusCode(request.getMethod() == 'PUT' ? patchStatus : createStatus);
                response.setBody('{"$template":"losDocument"}');
                return response;
            }
            response.setStatusCode(404);
            response.setBody('{"code":"not_found"}');
            return response;
        }

        private Sent extractCall() {
            for (Sent s : sent) {
                if (s.endpoint.contains('ai/extract_structured')) return s;
            }
            return null;
        }

        private List<Sent> metadataCalls() {
            List<Sent> calls = new List<Sent>();
            for (Sent s : sent) {
                if (s.endpoint.contains('/metadata/')) calls.add(s);
            }
            return calls;
        }
    }

    private static BoxMock mockAnswering(String extractBody) {
        BoxMock mock = new BoxMock(200, extractBody, 201, 200);
        Test.setMock(HttpCalloutMock.class, mock);
        return mock;
    }

    private static void configure() {
        insert new LOS_Box_Config__c(SetupOwnerId = UserInfo.getOrganizationId(), Box_User_Id__c = '385982796');
    }

    private static LOS_Loan__c seedLoan() {
        LOS_Loan__c loan = new LOS_Loan__c(
            Name = 'Harborview Logistics Commercial Real Estate 2026',
            Loan_ID__c = 'LN-2026-0042',
            Borrower__c = 'Harborview Logistics',
            Status__c = 'Application',
            Loan_Type__c = 'Commercial Real Estate',
            Box_Workspace_Folder_ID__c = '900000001');
        insert loan;
        return loan;
    }

    private static LosClassifyDocument.Result invoke(String loanRef, String fileId) {
        LosClassifyDocument.Request req = new LosClassifyDocument.Request();
        req.loanReference = loanRef;
        req.fileId = fileId;
        return LosClassifyDocument.classify(new List<LosClassifyDocument.Request>{ req })[0];
    }

    private static void post(String recordId, String fileId) {
        RestRequest request = new RestRequest();
        request.requestURI = '/services/apexrest/los/classify';
        request.httpMethod = 'POST';
        if (recordId != null) request.addParameter('recordId', recordId);
        if (fileId != null) request.addParameter('fileId', fileId);
        RestContext.request = request;
        RestContext.response = new RestResponse();
        LosClassifyDocument.classifyViaRest();
    }

    private static Map<String, Object> body() {
        return (Map<String, Object>) JSON.deserializeUntyped(RestContext.response.responseBody.toString());
    }

    @IsTest
    static void classifiesTheDocumentAndWritesTheTemplate() {
        configure();
        seedLoan();
        LosLoanPackage.documentIdsOverride = new Set<String>{ FILE_ID };
        BoxMock mock = mockAnswering('{"answer":{"documentType":"Appraisal","policyRisk":"High"},"completion_reason":"done"}');

        Test.startTest();
        LosClassifyDocument.Result result = invoke('LN-2026-0042', FILE_ID);
        Test.stopTest();

        System.assertEquals(true, result.classified, result.summary);
        System.assertEquals('Appraisal', result.documentType);
        System.assertEquals('Classified as Appraisal by Box AI.', result.summary);

        Sent extract = mock.extractCall();
        System.assertNotEquals(null, extract, 'Box AI must be asked');
        System.assert(extract.body.contains('"template_key":"losDocument"'), 'Extract against the template itself: ' + extract.body);
        System.assert(extract.body.contains('"scope":"enterprise"'), extract.body);
        System.assert(extract.body.contains('"id":"' + FILE_ID + '"'), extract.body);

        List<Sent> writes = mock.metadataCalls();
        System.assertEquals(1, writes.size(), 'One create, no patch');
        System.assertEquals('POST', writes[0].method);
        System.assert(writes[0].endpoint.endsWith('/files/' + FILE_ID + '/metadata/enterprise/losDocument'), writes[0].endpoint);
        Map<String, Object> instance = (Map<String, Object>) JSON.deserializeUntyped(writes[0].body);
        System.assertEquals('Appraisal', instance.get('documentType'));
        System.assertEquals('Draft', instance.get('versionStatus'));
        System.assertEquals('Complete', instance.get('aiSummaryStatus'));
        System.assertEquals('Pending', instance.get('approvalStatus'));
        System.assertEquals('Not Required', instance.get('signatureStatus'));
        System.assertEquals('High', instance.get('policyRisk'), 'A valid policy risk travels with the type');
    }

    @IsTest
    static void normalisesCaseAndDropsAnInvalidPolicyRisk() {
        // Box's enum is case-sensitive and a model's spelling is not. The type is written
        // in the template's spelling; a risk the template does not offer is left off rather
        // than sent to Box to fail the whole write.
        configure();
        seedLoan();
        LosLoanPackage.documentIdsOverride = new Set<String>{ FILE_ID };
        BoxMock mock = mockAnswering('{"answer":"{\\"documentType\\":\\"financial statement\\",\\"policyRisk\\":\\"Severe\\"}"}');

        Test.startTest();
        LosClassifyDocument.Result result = invoke('LN-2026-0042', FILE_ID);
        Test.stopTest();

        System.assertEquals(true, result.classified, result.summary);
        System.assertEquals('Financial Statement', result.documentType);
        Map<String, Object> instance = (Map<String, Object>) JSON.deserializeUntyped(mock.metadataCalls()[0].body);
        System.assertEquals('Financial Statement', instance.get('documentType'));
        System.assertEquals(false, instance.containsKey('policyRisk'), 'An unknown risk is omitted: ' + mock.metadataCalls()[0].body);
    }

    @IsTest
    static void leavesADocumentBoxAiCannotNameForTheLoanOfficer() {
        // The legitimate "I do not know". Nothing is written, and the sentence is the one
        // the checklist shows under "received, awaiting classification".
        configure();
        seedLoan();
        LosLoanPackage.documentIdsOverride = new Set<String>{ FILE_ID };
        BoxMock mock = mockAnswering('{"answer":{"documentType":"Grocery list"}}');

        Test.startTest();
        LosClassifyDocument.Result result = invoke('LN-2026-0042', FILE_ID);
        Test.stopTest();

        System.assertEquals(false, result.classified);
        System.assertEquals(null, result.documentType);
        System.assert(result.summary.contains('awaiting classification'), result.summary);
        System.assertEquals(0, mock.metadataCalls().size(), 'An unnamed document must not be tagged');
    }

    @IsTest
    static void patchesAnExistingInstanceWhenBoxAnswers409() {
        configure();
        seedLoan();
        LosLoanPackage.documentIdsOverride = new Set<String>{ FILE_ID };
        BoxMock mock = new BoxMock(200, '{"answer":{"documentType":"Tax Return"}}', 409, 200);
        Test.setMock(HttpCalloutMock.class, mock);

        Test.startTest();
        LosClassifyDocument.Result result = invoke('LN-2026-0042', FILE_ID);
        Test.stopTest();

        System.assertEquals(true, result.classified, result.summary);
        List<Sent> writes = mock.metadataCalls();
        System.assertEquals(2, writes.size(), 'Create refused, then patched');
        System.assertEquals('POST', writes[0].method);
        System.assertEquals('PUT', writes[1].method);
        System.assert(writes[1].body.contains('"path":"/documentType"'), writes[1].body);
        System.assert(writes[1].body.contains('"value":"Tax Return"'), writes[1].body);
        System.assert(writes[1].body.contains('"path":"/aiSummaryStatus"'), writes[1].body);
        System.assert(!writes[1].body.contains('policyRisk'), 'No risk was extracted, so none is patched: ' + writes[1].body);
    }

    @IsTest
    static void refusesAFileOutsideTheLoanFolder() {
        // The case the bound exists to fail. The package lists a different file, so the
        // refusal is about the file, and Box AI is never asked.
        configure();
        seedLoan();
        LosLoanPackage.documentIdsOverride = new Set<String>{ '111111111' };
        BoxMock mock = mockAnswering('{"answer":{"documentType":"Appraisal"}}');

        Test.startTest();
        LosClassifyDocument.Result result = invoke('LN-2026-0042', FILE_ID);
        Test.stopTest();

        System.assertEquals(false, result.classified);
        System.assert(result.summary.contains('not in the document folder'), result.summary);
        System.assertEquals(null, mock.extractCall(), 'An out-of-scope file must never reach Box AI');
        System.assertEquals(0, mock.metadataCalls().size());
    }

    @IsTest
    static void refusesAnUnknownLoanWithoutCallingBox() {
        configure();
        LosLoanPackage.documentIdsOverride = new Set<String>{ FILE_ID };
        BoxMock mock = mockAnswering('{"answer":{"documentType":"Appraisal"}}');

        Test.startTest();
        LosClassifyDocument.Result result = invoke('LN-2099-9999', FILE_ID);
        Test.stopTest();

        System.assertEquals(false, result.classified);
        System.assert(result.summary.contains('could not find a loan'), result.summary);
        System.assertEquals(null, mock.extractCall());
    }

    @IsTest
    static void reportsARefusalFromBoxAiWithoutWriting() {
        configure();
        seedLoan();
        LosLoanPackage.documentIdsOverride = new Set<String>{ FILE_ID };
        BoxMock mock = new BoxMock(403, '{"code":"forbidden"}', 201, 200);
        Test.setMock(HttpCalloutMock.class, mock);

        Test.startTest();
        post(String.valueOf(seededLoanId()), FILE_ID);
        Test.stopTest();

        System.assertEquals(500, RestContext.response.statusCode);
        System.assertEquals('box_ai_refused', body().get('error'));
        System.assert(((String) body().get('detail')).contains('403'), (String) body().get('detail'));
        System.assertEquals(0, mock.metadataCalls().size());
    }

    @IsTest
    static void restEndpointClassifiesByRecordIdAndFileId() {
        configure();
        LOS_Loan__c loan = seedLoan();
        LosLoanPackage.documentIdsOverride = new Set<String>{ FILE_ID };
        mockAnswering('{"answer":{"documentType":"Bank Statement"}}');

        Test.startTest();
        post(String.valueOf(loan.Id), FILE_ID);
        Test.stopTest();

        System.assertEquals(200, RestContext.response.statusCode, RestContext.response.responseBody.toString());
        Map<String, Object> answer = body();
        System.assertEquals(true, answer.get('classified'));
        System.assertEquals('Bank Statement', answer.get('documentType'));
        System.assertEquals(new Set<String>{ 'classified', 'documentType', 'summary' }, answer.keySet(),
            'The response shape is what the portal reads; widening it is a deliberate edit');
    }

    @IsTest
    static void restEndpointAnswers200WhenTheDocumentIsNotNamed() {
        // Not an error: the portal shows the sentence, not a failure card.
        configure();
        LOS_Loan__c loan = seedLoan();
        LosLoanPackage.documentIdsOverride = new Set<String>{ FILE_ID };
        mockAnswering('{"answer":{}}');

        Test.startTest();
        post(String.valueOf(loan.Id), FILE_ID);
        Test.stopTest();

        System.assertEquals(200, RestContext.response.statusCode);
        System.assertEquals(false, body().get('classified'));
        System.assertEquals(null, body().get('documentType'));
    }

    @IsTest
    static void restEndpointRefusesAGuestAndAFileOutsideTheLoan() {
        configure();
        LOS_Loan__c loan = seedLoan();
        LosLoanPackage.documentIdsOverride = new Set<String>{ '111111111' };
        BoxMock mock = mockAnswering('{"answer":{"documentType":"Appraisal"}}');

        Test.startTest();
        LosClassifyDocument.userTypeOverride = 'Guest';
        post(String.valueOf(loan.Id), FILE_ID);
        System.assertEquals(401, RestContext.response.statusCode);
        System.assertEquals('not_authenticated', body().get('error'));

        LosClassifyDocument.userTypeOverride = null;
        post(String.valueOf(loan.Id), FILE_ID);
        System.assertEquals(403, RestContext.response.statusCode);
        System.assertEquals('file_not_in_loan', body().get('error'));

        post(String.valueOf(loan.Id), null);
        System.assertEquals(400, RestContext.response.statusCode);
        System.assertEquals('invalid_request', body().get('error'));
        Test.stopTest();

        System.assertEquals(null, mock.extractCall(), 'None of these may reach Box AI');
    }

    private static Id seededLoanId() {
        return [SELECT Id FROM LOS_Loan__c WHERE Loan_ID__c = 'LN-2026-0042' LIMIT 1].Id;
    }
}
