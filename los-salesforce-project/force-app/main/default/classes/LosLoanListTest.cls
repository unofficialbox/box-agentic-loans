@IsTest
private class LosLoanListTest {

    private static void seed() {
        insert new List<LOS_Loan__c>{
            new LOS_Loan__c(Name = 'Harborview Distribution Facility Loan', Loan_ID__c = 'LN-A',
                Borrower__c = 'Harborview Logistics', Status__c = 'Underwriting', Risk_Rating__c = 'High'),
            new LOS_Loan__c(Name = 'Pinecrest Practice Expansion', Loan_ID__c = 'LN-B',
                Borrower__c = 'Pinecrest Dental Group', Status__c = 'Underwriting', Risk_Rating__c = 'Medium'),
            new LOS_Loan__c(Name = 'Meridian Equipment Loan', Loan_ID__c = 'LN-C',
                Borrower__c = 'Meridian Labs', Status__c = 'Closed', Risk_Rating__c = 'Low')
        };
    }

    private static LosLoanList.Result run(String status, String borrower) {
        LosLoanList.Request request = new LosLoanList.Request();
        request.inputStatus = status;
        request.inputBorrower = borrower;
        return LosLoanList.listLoans(new List<LosLoanList.Request>{ request })[0];
    }

    @IsTest
    static void listsEveryLoanWhenNothingIsFiltered() {
        seed();

        Test.startTest();
        LosLoanList.Result result = run(null, null);
        Test.stopTest();

        System.assertEquals(3, result.outputCount);
        System.assert(result.outputSummary.contains('LN-A'), result.outputSummary);
        System.assert(result.outputSummary.contains('Harborview Logistics'), result.outputSummary);
        System.assert(result.outputSummary.contains('Status: Underwriting'), result.outputSummary);
    }

    @IsTest
    static void filtersByStatus() {
        seed();

        Test.startTest();
        LosLoanList.Result result = run('Underwriting', null);
        Test.stopTest();

        System.assertEquals(2, result.outputCount);
        System.assert(!result.outputSummary.contains('LN-C'), 'Closed is not in Underwriting');
    }

    @IsTest
    static void filtersByBorrower() {
        seed();

        Test.startTest();
        LosLoanList.Result result = run(null, 'Pinecrest');
        Test.stopTest();

        System.assertEquals(1, result.outputCount);
        System.assert(result.outputSummary.contains('LN-B'), result.outputSummary);
    }

    @IsTest
    static void saysSoRatherThanReturningAnEmptyListing() {
        seed();

        Test.startTest();
        LosLoanList.Result result = run('Commitment', null);
        Test.stopTest();

        System.assertEquals(0, result.outputCount);
        System.assert(result.outputSummary.contains('No LOS loans matched'), result.outputSummary);
    }
}
