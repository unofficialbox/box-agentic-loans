/**
 * The Box listing is not exercised here.
 *
 * It goes through `box.Toolkit`, which owns its own credentials and its own callout, so
 * `Test.setMock` cannot stand in for it and the managed package returns nothing in a test
 * context. What that leaves testable is the half this class actually owns: finding the
 * loan, resolving its folder, and -- the part worth guarding -- keeping "Box refused"
 * distinct from "the folder is empty".
 *
 * The listing itself has not yet been run against a live org for the loans variant. The
 * CLM predecessor proved the same code path live: its 2024 record returned all nine
 * documents with their Box file IDs, and Box AI answered from the insurance certificate
 * with real figures.
 */
@IsTest
private class LosLoanPackageTest {

    private static LOS_Loan__c loan() {
        LOS_Loan__c record = new LOS_Loan__c(
            Name = 'Harborview Logistics Distribution Facility Loan 2026',
            Loan_ID__c = 'LN-2026-0042',
            Borrower__c = 'Harborview Logistics',
            Status__c = 'Underwriting',
            Box_Workspace_Folder_ID__c = '413766128496'
        );
        insert record;
        return record;
    }

    private static LosLoanPackage.Result run(String reference) {
        LosLoanPackage.Request request = new LosLoanPackage.Request();
        request.inputLoan = reference;
        return LosLoanPackage.get(new List<LosLoanPackage.Request>{ request })[0];
    }

    @IsTest
    static void resolvesTheLoanAndItsFolder() {
        LOS_Loan__c record = loan();

        Test.startTest();
        LosLoanPackage.Result result = run('LN-2026-0042');
        Test.stopTest();

        System.assertEquals(record.Id, result.outputRecordId);
        System.assertEquals('413766128496', result.outputFolderId,
            'With no Box association record, the folder falls back to the loan field');
        System.assert(result.outputSummary.contains('Harborview Logistics'), result.outputSummary);
        System.assert(result.outputSummary.contains('Underwriting'), result.outputSummary);
    }

    @IsTest
    static void findsALoanByNameWhenTheReferenceIsNotExact() {
        loan();

        Test.startTest();
        LosLoanPackage.Result result = run('Harborview');
        Test.stopTest();

        System.assert(result.outputSummary.contains('LN-2026-0042'), result.outputSummary);
    }

    @IsTest
    static void returnsTheResolvedReferenceWhateverTheCallerTyped() {
        // Whatever downstream stays bounded to this loan -- asking Box AI about one of its
        // documents -- needs the reference the lookup settled on, not the one that was
        // typed. Without this the agent bound an empty variable and the ask failed with
        // REQUIRED_FIELD_MISSING on loanReference.
        LOS_Loan__c record = loan();

        Test.startTest();
        LosLoanPackage.Result byName = run('Harborview');
        LosLoanPackage.Result byId = run(record.Id);
        Test.stopTest();

        System.assertEquals('LN-2026-0042', byName.outputLoanReference);
        System.assertEquals('LN-2026-0042', byId.outputLoanReference);
    }

    @IsTest
    static void findsALoanByRecordId() {
        LOS_Loan__c record = loan();

        Test.startTest();
        LosLoanPackage.Result result = run(record.Id);
        Test.stopTest();

        System.assertEquals(record.Id, result.outputRecordId);
    }

    @IsTest
    static void locateCarriesTheTermFieldsTheGovernedActionsCompareAgainst() {
        // Extract validates against the record and apply refuses on status, and both read
        // through locate(). A field dropped from the lookup projection would surface as
        // "record empty" for every loan, which reads as a data gap rather than a bug.
        LOS_Loan__c record = loan();
        record.LTV__c = 80;
        record.DSCR__c = 1.30;
        record.Interest_Rate__c = 6.85;
        update record;

        Test.startTest();
        LosLoanPackage.Located found = LosLoanPackage.locate('LN-2026-0042');
        Test.stopTest();

        System.assertEquals(record.Id, found.loan.Id);
        System.assertEquals('413766128496', found.folderId);
        System.assertEquals(80, found.loan.LTV__c);
        System.assertEquals(1.30, found.loan.DSCR__c);
        System.assertEquals(6.85, found.loan.Interest_Rate__c);
    }

    @IsTest
    static void reportsAnEmptyPackageAsEmpty() {
        // In a test context the Toolkit answers with a folder carrying no entries, which
        // is the empty-folder shape. The refusal branch beside it -- `status` populated,
        // or the call throwing -- cannot be produced from here, so it is asserted by
        // reading the code rather than by this test: the two must stay distinguishable,
        // because reporting a broken credential as "no documents" is the failure that
        // would go unnoticed.
        loan();

        Test.startTest();
        LosLoanPackage.Result result = run('LN-2026-0042');
        Test.stopTest();

        System.assertEquals(false, result.outputFound, 'An empty folder has nothing to cite');
        System.assert(result.outputSummary.contains('empty'), result.outputSummary);
    }

    @IsTest
    static void saysSoWhenTheLoanHasNoBoxFolder() {
        insert new LOS_Loan__c(Name = 'No folder yet', Loan_ID__c = 'LN-NO-FOLDER');

        Test.startTest();
        LosLoanPackage.Result result = run('LN-NO-FOLDER');
        Test.stopTest();

        System.assertEquals(false, result.outputFound);
        System.assert(result.outputSummary.contains('no Box folder'), result.outputSummary);
    }

    @IsTest
    static void saysSoWhenNoLoanMatches() {
        Test.startTest();
        LosLoanPackage.Result result = run('LN-DOES-NOT-EXIST');
        Test.stopTest();

        System.assertEquals(false, result.outputFound);
        System.assert(result.outputSummary.contains('could not find'), result.outputSummary);
    }

    @IsTest
    static void asksForAReferenceWhenGivenNothing() {
        Test.startTest();
        LosLoanPackage.Result result = run('');
        Test.stopTest();

        System.assertEquals(false, result.outputFound);
        System.assert(result.outputSummary.contains('which loan'), result.outputSummary);
    }

    @IsTest
    static void documentIdsAreEmptyRatherThanNullForAKnownLoan() {
        // The distinction the ask action depends on: a loan it can resolve returns a set
        // (possibly empty), and one it cannot returns null. Null means "I could not
        // confirm what belongs to this loan", which must never be read as "nothing
        // belongs to it, so allow the file".
        loan();

        Test.startTest();
        Set<String> ids = LosLoanPackage.documentIdsFor('LN-2026-0042');
        Test.stopTest();

        System.assertNotEquals(null, ids, 'A resolvable loan must not look unresolvable');
        System.assertEquals(0, ids.size(), 'The Toolkit returns no documents in a test context');
    }

    @IsTest
    static void documentIdsAreNullWhenTheLoanCannotBeResolved() {
        Test.startTest();
        Set<String> missing = LosLoanPackage.documentIdsFor('LN-DOES-NOT-EXIST');
        Set<String> blank = LosLoanPackage.documentIdsFor('');
        Test.stopTest();

        System.assertEquals(null, missing);
        System.assertEquals(null, blank);
    }

    @IsTest
    static void documentIdsAreNullWhenTheLoanHasNoFolder() {
        insert new LOS_Loan__c(Name = 'No folder yet', Loan_ID__c = 'LN-NO-FOLDER-2');

        Test.startTest();
        Set<String> ids = LosLoanPackage.documentIdsFor('LN-NO-FOLDER-2');
        Test.stopTest();

        System.assertEquals(null, ids, 'No folder means nothing can be confirmed as in scope');
    }
}
