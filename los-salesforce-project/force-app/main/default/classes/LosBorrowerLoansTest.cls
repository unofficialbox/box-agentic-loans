/**
 * What is proved here is the filter: that a session bounded to one borrower cannot reach
 * another's loans, whatever is asked for.
 *
 * What is not proved here is record visibility for a real portal user. A Customer Community
 * user reaches their own account's rows through a sharing set, which is org configuration
 * rather than something a test can create -- and granting the test user View All to work
 * around that would grant the exact permission this class exists to avoid. So the bound
 * account is pinned, and the sharing set is called out in HANDOFF as a deployment step.
 */
@IsTest
private class LosBorrowerLoansTest {

    @TestSetup
    static void makeData() {
        Account harborview = new Account(Name = 'Harborview Logistics');
        Account pinecrest = new Account(Name = 'Pinecrest Dental Group');
        insert new List<Account>{ harborview, pinecrest };

        insert new List<LOS_Loan__c>{
            new LOS_Loan__c(Name = 'Harborview Logistics Revolving Line of Credit 2023', Loan_ID__c = 'LN-2023-0311',
                Borrower_Account__c = harborview.Id, Status__c = 'Closed', Term_Months__c = 36),
            new LOS_Loan__c(Name = 'Harborview Logistics Distribution Facility Loan 2026', Loan_ID__c = 'LN-2026-0042',
                Borrower_Account__c = harborview.Id, Status__c = 'Underwriting'),
            new LOS_Loan__c(Name = 'Pinecrest Dental Group Practice Expansion 2026', Loan_ID__c = 'LN-2026-0088',
                Borrower_Account__c = pinecrest.Id, Status__c = 'Application')
        };
    }

    private static Id accountNamed(String name) {
        return [SELECT Id FROM Account WHERE Name = :name LIMIT 1].Id;
    }

    private static LosBorrowerLoans.Result asBorrower(String accountName, String reference) {
        LosBorrowerLoans.accountOverride = accountNamed(accountName);
        LosBorrowerLoans.Request request = new LosBorrowerLoans.Request();
        request.inputLoan = reference;
        return LosBorrowerLoans.get(new List<LosBorrowerLoans.Request>{ request })[0];
    }

    @IsTest
    static void returnsOnlyTheSignedInBorrowersLoans() {
        Test.startTest();
        LosBorrowerLoans.Result result = asBorrower('Harborview Logistics', null);
        Test.stopTest();

        System.assertEquals(2, result.outputCount, result.outputSummary);
        System.assert(result.outputSummary.contains('LN-2023-0311'), result.outputSummary);
        System.assert(!result.outputSummary.contains('LN-2026-0088'),
            'A borrower must never see another organisation: ' + result.outputSummary);
    }

    @IsTest
    static void refusesALoanBelongingToAnotherBorrower() {
        // The case the reference input exists to fail. Naming Pinecrest's loan from a
        // Harborview session must not return it, however it is asked for.
        Test.startTest();
        LosBorrowerLoans.Result result = asBorrower('Harborview Logistics', 'LN-2026-0088');
        Test.stopTest();

        System.assertEquals(0, result.outputCount);
        System.assert(result.outputSummary.contains('not a loan belonging to'), result.outputSummary);
        System.assert(!result.outputSummary.contains('Pinecrest Dental Group Practice Expansion'),
            'The refusal must not leak the loan name: ' + result.outputSummary);
    }

    @IsTest
    static void narrowsToOneOfTheirOwnWhenNamed() {
        Test.startTest();
        LosBorrowerLoans.Result result = asBorrower('Harborview Logistics', 'LN-2026-0042');
        Test.stopTest();

        System.assertEquals(1, result.outputCount);
        System.assert(result.outputSummary.contains('LN-2026-0042'), result.outputSummary);
        System.assert(!result.outputSummary.contains('LN-2023-0311'), result.outputSummary);
    }

    @IsTest
    static void aCallerWithNoBorrowerSeesNothing() {
        // Staff have no Contact, so there is no account to bound to. The answer must not
        // quietly default to everything.
        Test.startTest();
        LosBorrowerLoans.Request request = new LosBorrowerLoans.Request();
        LosBorrowerLoans.Result result =
            LosBorrowerLoans.get(new List<LosBorrowerLoans.Request>{ request })[0];
        Test.stopTest();

        System.assertEquals(0, result.outputCount);
        System.assert(result.outputSummary.contains('cannot tell which'), result.outputSummary);
    }
}
