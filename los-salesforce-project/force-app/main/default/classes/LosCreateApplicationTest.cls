/**
 * What is proved here is the bound and the sequence: an application is always created for
 * the organisation the session is pinned to, whatever the body says, and it takes the next
 * loan number for the year across the whole org rather than across what the caller can see.
 *
 * What is not proved here is a real Customer Community user. Their Contact, their Account
 * and their site membership are org configuration a test cannot create, so the bound
 * account is pinned the way LosBorrowerLoansTest pins it, and the identity read is
 * exercised on the one path a test can reach: an internal user with no Contact, who is
 * refused.
 */
@IsTest
private class LosCreateApplicationTest {

    private static String thisYear() {
        return String.valueOf(Date.today().year());
    }

    @TestSetup
    static void makeData() {
        Account harborview = new Account(Name = 'Harborview Logistics');
        Account pinecrest = new Account(Name = 'Pinecrest Dental Group');
        insert new List<Account>{ harborview, pinecrest };

        // Numbers are minted across the whole org, so the highest one this year belongs
        // to another borrower on purpose: the next application must still count past it.
        String year = thisYear();
        insert new List<LOS_Loan__c>{
            new LOS_Loan__c(Name = 'Harborview Logistics Revolving Line of Credit 2023', Loan_ID__c = 'LN-2023-0311',
                Borrower_Account__c = harborview.Id, Status__c = 'Closed'),
            new LOS_Loan__c(Name = 'Harborview Logistics Distribution Facility Loan', Loan_ID__c = 'LN-' + year + '-0042',
                Borrower_Account__c = harborview.Id, Status__c = 'Underwriting'),
            new LOS_Loan__c(Name = 'Pinecrest Dental Group Practice Expansion', Loan_ID__c = 'LN-' + year + '-0088',
                Borrower_Account__c = pinecrest.Id, Status__c = 'Application'),
            // A hand-typed id in the year's range must be skipped, not allowed to break minting.
            new LOS_Loan__c(Name = 'Malformed reference', Loan_ID__c = 'LN-' + year + '-0090-A',
                Borrower_Account__c = pinecrest.Id, Status__c = 'Application')
        };
    }

    private static Id accountNamed(String name) {
        return [SELECT Id FROM Account WHERE Name = :name LIMIT 1].Id;
    }

    private static void post(String body) {
        RestRequest request = new RestRequest();
        request.requestURI = '/services/apexrest/los/applications';
        request.httpMethod = 'POST';
        request.requestBody = Blob.valueOf(body);
        RestContext.request = request;
        RestContext.response = new RestResponse();
        LosCreateApplication.createApplication();
    }

    private static Map<String, Object> body() {
        return (Map<String, Object>) JSON.deserializeUntyped(RestContext.response.responseBody.toString());
    }

    private static String validApplication() {
        return JSON.serialize(new Map<String, Object>{
            'loanType' => 'Commercial Real Estate',
            'loanAmount' => 4800000,
            'termMonths' => 120,
            'purpose' => 'Acquire and fit out the distribution facility on Harbor Road.',
            'collateralType' => 'Real Estate'
        });
    }

    private static Integer loanCount() {
        return [SELECT COUNT() FROM LOS_Loan__c];
    }

    @IsTest
    static void createsTheApplicationForTheSignedInBorrowerWithTheNextLoanNumber() {
        LosCreateApplication.accountOverride = accountNamed('Harborview Logistics');
        Integer before = loanCount();

        Test.startTest();
        post(validApplication());
        Test.stopTest();

        System.assertEquals(201, RestContext.response.statusCode, RestContext.response.responseBody.toString());
        Map<String, Object> summary = body();
        String expectedLoanId = 'LN-' + thisYear() + '-0089';
        System.assertEquals(expectedLoanId, summary.get('loanId'),
            'The next number counts past the highest in the org, not the highest this borrower can see');
        System.assertEquals('Application', summary.get('status'));
        System.assertEquals('Commercial Real Estate', summary.get('loanType'));
        System.assertEquals('Harborview Logistics', summary.get('borrower'));
        System.assertEquals('Harborview Logistics', summary.get('borrowerEntity'), 'Defaults to the account name');
        System.assertEquals(120, summary.get('termMonths'));
        System.assertEquals(null, summary.get('boxFolderId'), 'The folder is the next request, not this one');
        System.assertEquals(null, summary.get('maturityDate'));
        System.assertEquals(
            new Set<String>{
                'recordId', 'loanId', 'name', 'borrower', 'borrowerEntity', 'loanType', 'status',
                'loanAmount', 'termMonths', 'maturityDate', 'boxFolderId', 'purpose'
            },
            summary.keySet(),
            'The response is the loan list shape plus purpose; widening it publishes more to the borrower'
        );

        System.assertEquals(before + 1, loanCount());
        Id createdId = (Id) summary.get('recordId');
        LOS_Loan__c created = [
            SELECT Name, Loan_ID__c, Status__c, Record_Source__c, Borrower_Account__c, Borrower__c,
                   Borrower_Entity__c, Applicant_Name__c, Applicant_Email__c, Loan_Type__c, Loan_Amount__c,
                   Term_Months__c, Purpose__c, Collateral_Type__c, Interest_Rate__c, LTV__c, DSCR__c,
                   Collateral_Value__c, Risk_Rating__c, Loan_Officer__c
            FROM LOS_Loan__c WHERE Id = :createdId
        ];
        System.assertEquals(expectedLoanId, created.Loan_ID__c);
        System.assertEquals('Borrower Portal', created.Record_Source__c);
        System.assertEquals(accountNamed('Harborview Logistics'), created.Borrower_Account__c);
        System.assertEquals('Harborview Logistics', created.Borrower__c);
        System.assertEquals('Harborview Logistics Commercial Real Estate ' + thisYear(), created.Name);
        System.assertEquals(UserInfo.getName(), created.Applicant_Name__c);
        System.assertEquals(UserInfo.getUserEmail(), created.Applicant_Email__c);
        System.assertEquals(4800000, created.Loan_Amount__c);
        System.assertEquals(120, created.Term_Months__c);
        System.assertEquals('Real Estate', created.Collateral_Type__c);
        System.assert(created.Purpose__c.startsWith('Acquire and fit out'), created.Purpose__c);
        // The bank's side of the record is untouched: the borrower proposes, the bank assesses.
        System.assertEquals(null, created.Interest_Rate__c);
        System.assertEquals(null, created.LTV__c);
        System.assertEquals(null, created.DSCR__c);
        System.assertEquals(null, created.Collateral_Value__c);
        System.assertEquals(null, created.Risk_Rating__c);
        System.assertEquals(null, created.Loan_Officer__c);
    }

    @IsTest
    static void aSecondApplicationInTheSameYearTakesTheNextNumber() {
        LosCreateApplication.accountOverride = accountNamed('Harborview Logistics');

        Test.startTest();
        post(validApplication());
        String first = (String) body().get('loanId');
        post(validApplication());
        String second = (String) body().get('loanId');
        Test.stopTest();

        System.assertEquals('LN-' + thisYear() + '-0089', first);
        System.assertEquals('LN-' + thisYear() + '-0090', second);
    }

    @IsTest
    static void theFirstApplicationOfAYearStartsAtOne() {
        // No loan in the org carries a 1999 number, so the sequence has to fall back rather
        // than fail; the offset is what the duplicate retry adds.
        System.assertEquals('LN-1999-0001', LosCreateApplication.nextLoanId(1999, 0));
        System.assertEquals('LN-1999-0002', LosCreateApplication.nextLoanId(1999, 1));
    }

    @IsTest
    static void ignoresAnAccountNamedInTheBody() {
        // The one thing a borrower must never be able to choose. A body naming another
        // organisation is not refused, because the field does not exist; it is not read.
        LosCreateApplication.accountOverride = accountNamed('Harborview Logistics');
        Map<String, Object> smuggled = (Map<String, Object>) JSON.deserializeUntyped(validApplication());
        smuggled.put('borrowerAccountId', accountNamed('Pinecrest Dental Group'));
        smuggled.put('borrowerAccount', 'Pinecrest Dental Group');
        smuggled.put('borrower', 'Pinecrest Dental Group');
        smuggled.put('interestRate', 1.5);
        smuggled.put('riskRating', 'Low');

        Test.startTest();
        post(JSON.serialize(smuggled));
        Test.stopTest();

        System.assertEquals(201, RestContext.response.statusCode, RestContext.response.responseBody.toString());
        Id createdId = (Id) body().get('recordId');
        LOS_Loan__c created = [
            SELECT Borrower_Account__c, Borrower__c, Interest_Rate__c, Risk_Rating__c
            FROM LOS_Loan__c WHERE Id = :createdId
        ];
        System.assertEquals(accountNamed('Harborview Logistics'), created.Borrower_Account__c);
        System.assertEquals('Harborview Logistics', created.Borrower__c);
        System.assertEquals(null, created.Interest_Rate__c);
        System.assertEquals(null, created.Risk_Rating__c);
    }

    @IsTest
    static void refusesAGuest() {
        LosCreateApplication.userTypeOverride = 'Guest';
        Integer before = loanCount();

        Test.startTest();
        post(validApplication());
        Test.stopTest();

        System.assertEquals(401, RestContext.response.statusCode);
        System.assertEquals('not_authenticated', body().get('error'));
        System.assert(String.isNotBlank((String) body().get('detail')));
        System.assertEquals(before, loanCount(), 'A guest creates nothing');
    }

    @IsTest
    static void refusesACallerWithNoBorrowerAccount() {
        // The test user is internal and has no Contact: the honest answer is that there is
        // no organisation to apply for, not an application for nobody.
        Integer before = loanCount();

        Test.startTest();
        post(validApplication());
        Test.stopTest();

        System.assertEquals(403, RestContext.response.statusCode, RestContext.response.responseBody.toString());
        System.assertEquals('no_borrower_account', body().get('error'));
        System.assertEquals(before, loanCount());
    }

    @IsTest
    static void refusesAnInvalidApplicationWithASentenceForEachRule() {
        LosCreateApplication.accountOverride = accountNamed('Harborview Logistics');
        Integer before = loanCount();
        Map<String, Object> valid = (Map<String, Object>) JSON.deserializeUntyped(validApplication());

        Test.startTest();
        assertInvalid(altered(valid, 'loanType', 'Payday Loan'), 'loan types');
        assertInvalid(altered(valid, 'loanAmount', 0), 'loan amount');
        assertInvalid(altered(valid, 'loanAmount', 50000001), 'loan amount');
        assertInvalid(altered(valid, 'termMonths', 3), 'term');
        assertInvalid(altered(valid, 'termMonths', 361), 'term');
        assertInvalid(altered(valid, 'termMonths', 12.5), 'term');
        assertInvalid(altered(valid, 'purpose', 'Too short'), 'what the loan is for');
        assertInvalid(altered(valid, 'purpose', 'x'.repeat(2001)), 'what the loan is for');
        assertInvalid(altered(valid, 'collateralType', 'Goodwill'), 'collateral');
        assertInvalid(altered(valid, 'borrowerEntity', 'x'.repeat(121)), 'borrowing entity');
        post('not json');
        System.assertEquals(400, RestContext.response.statusCode);
        System.assertEquals('invalid_application', body().get('error'));
        post('[1, 2, 3]');
        System.assertEquals(400, RestContext.response.statusCode);
        Test.stopTest();

        System.assertEquals(before, loanCount(), 'An invalid application creates nothing');
    }

    @IsTest
    static void acceptsNumbersSentAsStringsAndLoanTypesInAnyCase() {
        // A form serialises what it has; the record must still carry the picklist's spelling.
        LosCreateApplication.accountOverride = accountNamed('Harborview Logistics');
        Map<String, Object> valid = (Map<String, Object>) JSON.deserializeUntyped(validApplication());
        valid.put('loanType', 'term loan');
        valid.put('loanAmount', '250000');
        valid.put('termMonths', '36');
        valid.remove('collateralType');
        valid.put('borrowerEntity', 'Harborview Logistics Holdings LLC');

        Test.startTest();
        post(JSON.serialize(valid));
        Test.stopTest();

        System.assertEquals(201, RestContext.response.statusCode, RestContext.response.responseBody.toString());
        Id createdId = (Id) body().get('recordId');
        LOS_Loan__c created = [
            SELECT Loan_Type__c, Loan_Amount__c, Term_Months__c, Collateral_Type__c, Borrower_Entity__c
            FROM LOS_Loan__c WHERE Id = :createdId
        ];
        System.assertEquals('Term Loan', created.Loan_Type__c);
        System.assertEquals(250000, created.Loan_Amount__c);
        System.assertEquals(36, created.Term_Months__c);
        System.assertEquals('None', created.Collateral_Type__c, 'Collateral defaults to None');
        System.assertEquals('Harborview Logistics Holdings LLC', created.Borrower_Entity__c);
    }

    private static String altered(Map<String, Object> valid, String key, Object value) {
        Map<String, Object> changed = valid.clone();
        changed.put(key, value);
        return JSON.serialize(changed);
    }

    private static void assertInvalid(String requestBody, String expectedWording) {
        post(requestBody);
        System.assertEquals(400, RestContext.response.statusCode, RestContext.response.responseBody.toString());
        System.assertEquals('invalid_application', body().get('error'));
        String detail = (String) body().get('detail');
        System.assert(detail.containsIgnoreCase(expectedWording),
            'The refusal must name the rule in a borrower\'s words: ' + detail);
    }
}
