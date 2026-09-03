@IsTest
private class LosLoanListServiceTest {

    private static void call() {
        RestRequest request = new RestRequest();
        request.requestURI = '/services/apexrest/los/loans';
        request.httpMethod = 'GET';
        RestContext.request = request;
        RestContext.response = new RestResponse();
        LosLoanListService.listLoans();
    }

    private static List<Object> body() {
        return (List<Object>) JSON.deserializeUntyped(RestContext.response.responseBody.toString());
    }

    @IsTest
    static void returnsLoansForTheDashboard() {
        insert new LOS_Loan__c(
            Name = 'Harborview Logistics Distribution Facility Loan 2026',
            Loan_ID__c = 'LN-2026-0042',
            Borrower__c = 'Harborview Logistics',
            Status__c = 'Underwriting'
        );

        Test.startTest();
        call();
        Test.stopTest();

        System.assertEquals(200, RestContext.response.statusCode);
        List<Object> rows = body();
        System.assertEquals(1, rows.size(), 'The dashboard must see the loan');
        Map<String, Object> row = (Map<String, Object>) rows[0];
        System.assertEquals('LN-2026-0042', row.get('loanId'));
        System.assertEquals('Harborview Logistics', row.get('borrower'));
        System.assertEquals('Underwriting', row.get('status'));
        System.assert(row.containsKey('recordId'), 'The record id is what the workspace resolves a Box folder from');
    }

    @IsTest
    static void returnsAnEmptyListWhenThereAreNoLoans() {
        Test.startTest();
        call();
        Test.stopTest();

        System.assertEquals(200, RestContext.response.statusCode, 'An empty org is not an error');
        System.assertEquals(0, body().size());
    }

    @IsTest
    static void publishesOnlyTheProjectedFields() {
        // The response is what a site visitor can read, so its shape is a security
        // boundary rather than a convenience. Widening it must be a deliberate edit.
        insert new LOS_Loan__c(
            Name = 'Projection check',
            Loan_ID__c = 'LN-TEST-1',
            Applicant_Email__c = 'private@example.com',
            Underwriting_Notes__c = 'confidential note',
            LTV__c = 85,
            DSCR__c = 1.12,
            Risk_Rating__c = 'High'
        );

        Test.startTest();
        call();
        Test.stopTest();

        Map<String, Object> row = (Map<String, Object>) body()[0];
        System.assertEquals(
            new Set<String>{
                'recordId', 'loanId', 'name', 'borrower',
                'loanType', 'status', 'loanAmount', 'termMonths',
                // When a closed loan matures. A borrower is party to the loan, so its
                // maturity date is theirs to know; it is also the only way the maturity
                // horizon can be drawn.
                'maturityDate',
                // The borrowing entity. A borrower knows which of its own entities
                // signed; naming it is how the portfolio splits into more than one bar.
                'borrowerEntity',
                // The dashboard deep-links a loan straight to its Box folder, so the id
                // travels with the row. It names a folder and grants nothing: reaching
                // that folder still requires a token the endpoint mints per record.
                'boxFolderId'
            },
            row.keySet(),
            'The projection changed; confirm every field here is safe to publish'
        );
        String raw = RestContext.response.responseBody.toString();
        System.assertEquals(raw.contains('confidential note'), false,
            'Underwriting notes must not reach the browser');
        System.assertEquals(raw.contains('private@example.com'), false,
            'Applicant email must not reach the browser');
        System.assertEquals(raw.contains('High'), false,
            'The bank\'s risk rating must not reach the browser');
    }

    @IsTest
    static void boundsTheNumberOfRecordsReturned() {
        List<LOS_Loan__c> many = new List<LOS_Loan__c>();
        for (Integer i = 0; i < LosLoanListService.MAX_RECORDS + 5; i++) {
            many.add(new LOS_Loan__c(Name = 'Loan ' + i, Loan_ID__c = 'LN-' + i));
        }
        insert many;

        Test.startTest();
        call();
        Test.stopTest();

        System.assertEquals(LosLoanListService.MAX_RECORDS, body().size(),
            'The list must stay bounded so the dashboard cannot become an export');
    }
}
