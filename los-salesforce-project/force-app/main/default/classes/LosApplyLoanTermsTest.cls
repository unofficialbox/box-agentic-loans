/**
 * The one governed write, so the tests are mostly refusals: unconfirmed, closed, and
 * empty each leave the record exactly as it was. The success path checks that only the
 * supplied fields moved and that the summary names them.
 */
@IsTest
private class LosApplyLoanTermsTest {

    private static LOS_Loan__c seedLoan(String status) {
        LOS_Loan__c loan = new LOS_Loan__c(
            Name = 'Dockwright Logistics Distribution Facility Loan 2026',
            Loan_ID__c = 'LN-2026-0042',
            Borrower__c = 'Dockwright Logistics',
            Status__c = status,
            Risk_Rating__c = 'High',
            Loan_Amount__c = 4800000,
            Collateral_Value__c = 6000000,
            LTV__c = 80,
            DSCR__c = 1.30,
            Box_Workspace_Folder_ID__c = '900000001');
        insert loan;
        return loan;
    }

    private static LosApplyLoanTerms.Request request(String reference, Boolean confirmed) {
        LosApplyLoanTerms.Request req = new LosApplyLoanTerms.Request();
        req.loanReference = reference;
        req.confirmed = confirmed;
        return req;
    }

    private static LosApplyLoanTerms.Result run(LosApplyLoanTerms.Request req) {
        return LosApplyLoanTerms.apply(new List<LosApplyLoanTerms.Request>{ req })[0];
    }

    private static LOS_Loan__c reload(Id loanId) {
        return [SELECT Status__c, Risk_Rating__c, Loan_Amount__c, Collateral_Value__c, LTV__c, DSCR__c, Maturity_Date__c
                FROM LOS_Loan__c WHERE Id = :loanId];
    }

    @IsTest
    static void refusesWhenNobodyHasConfirmed() {
        LOS_Loan__c loan = seedLoan('Underwriting');
        LosApplyLoanTerms.Request req = request('LN-2026-0042', false);
        req.ltv = 85;
        req.dscr = 1.12;

        Test.startTest();
        LosApplyLoanTerms.Result result = run(req);
        Test.stopTest();

        System.assertEquals(false, result.applied);
        System.assertEquals('Nothing was written: a human must accept the extracted terms before they reach the record.', result.summary);
        LOS_Loan__c after = reload(loan.Id);
        System.assertEquals(80, after.LTV__c);
        System.assertEquals(1.30, after.DSCR__c);
    }

    @IsTest
    static void refusesWhenConfirmedIsNull() {
        // Null is not true. An agent that omits the flag has not been told yes.
        LOS_Loan__c loan = seedLoan('Underwriting');
        LosApplyLoanTerms.Request req = request('LN-2026-0042', null);
        req.ltv = 85;

        Test.startTest();
        LosApplyLoanTerms.Result result = run(req);
        Test.stopTest();

        System.assertEquals(false, result.applied);
        System.assertEquals(80, reload(loan.Id).LTV__c);
    }

    @IsTest
    static void refusesAClosedLoan() {
        LOS_Loan__c loan = seedLoan('Closed');
        LosApplyLoanTerms.Request req = request('LN-2026-0042', true);
        req.ltv = 85;

        Test.startTest();
        LosApplyLoanTerms.Result result = run(req);
        Test.stopTest();

        System.assertEquals(false, result.applied);
        System.assert(result.summary.contains('Closed'), result.summary);
        System.assert(result.summary.contains('Nothing was written'), result.summary);
        System.assertEquals(80, reload(loan.Id).LTV__c);
    }

    @IsTest
    static void refusesALoanInServicing() {
        LOS_Loan__c loan = seedLoan('Servicing');
        LosApplyLoanTerms.Request req = request('LN-2026-0042', true);
        req.ltv = 85;

        Test.startTest();
        LosApplyLoanTerms.Result result = run(req);
        Test.stopTest();

        System.assertEquals(false, result.applied);
        System.assertEquals(80, reload(loan.Id).LTV__c);
    }

    @IsTest
    static void refusesWhenNoFieldIsSupplied() {
        LOS_Loan__c loan = seedLoan('Underwriting');

        Test.startTest();
        LosApplyLoanTerms.Result result = run(request('LN-2026-0042', true));
        Test.stopTest();

        System.assertEquals(false, result.applied);
        System.assert(result.summary.contains('No terms were supplied'), result.summary);
        System.assertEquals(80, reload(loan.Id).LTV__c);
    }

    @IsTest
    static void refusesAnUnknownLoan() {
        LosApplyLoanTerms.Request req = request('LN-NOT-A-LOAN', true);
        req.ltv = 85;

        Test.startTest();
        LosApplyLoanTerms.Result result = run(req);
        Test.stopTest();

        System.assertEquals(false, result.applied);
        System.assert(result.summary.contains('could not find'), result.summary);
    }

    @IsTest
    static void writesOnlyTheSuppliedFieldsAndReportsThem() {
        LOS_Loan__c loan = seedLoan('Underwriting');
        LosApplyLoanTerms.Request req = request('LN-2026-0042', true);
        req.ltv = 85;
        req.dscr = 1.12;
        req.collateralValue = 5650000;
        req.termMonths = 120;

        Test.startTest();
        LosApplyLoanTerms.Result result = run(req);
        Test.stopTest();

        System.assertEquals(true, result.applied, result.summary);
        System.assert(result.fieldsUpdated.contains('LTV__c'), result.fieldsUpdated);
        System.assert(result.fieldsUpdated.contains('DSCR__c'), result.fieldsUpdated);
        System.assert(result.fieldsUpdated.contains('Collateral_Value__c'), result.fieldsUpdated);
        System.assert(result.fieldsUpdated.contains('Term_Months__c'), result.fieldsUpdated);
        System.assert(!result.fieldsUpdated.contains('Loan_Amount__c'), 'An unsupplied field is not reported as updated: ' + result.fieldsUpdated);
        System.assert(result.summary.contains('Credit Committee'), result.summary);

        LOS_Loan__c after = reload(loan.Id);
        System.assertEquals(85, after.LTV__c);
        System.assertEquals(1.12, after.DSCR__c);
        System.assertEquals(5650000, after.Collateral_Value__c);
        System.assertEquals(4800000, after.Loan_Amount__c, 'An unsupplied field is left alone.');
        System.assertEquals('Underwriting', after.Status__c, 'Status is not in the allow-list.');
        System.assertEquals('High', after.Risk_Rating__c, 'Risk rating is not in the allow-list.');
    }
}
