/**
 * Same-origin endpoint that lists LOS loan records for the borrower workspace dashboard.
 *
 * This exists so the Experience Cloud guest user is never granted access to
 * LOS_Loan__c itself. `LOS_Box_Preview_Guest` deliberately carries no business
 * object permissions -- a site visitor can mint a folder-scoped Box token and reach no
 * Salesforce data directly. That property is kept here: the guest is granted this one
 * Apex class, and the class returns a fixed, read-only projection of a handful of
 * fields. There is no filter, sort, or field parameter, so the response cannot be
 * widened from the browser.
 *
 * `without sharing` is required rather than incidental: guest users see no
 * LOS_Loan__c records under normal sharing, so a with-sharing query returns an
 * empty list on the one surface this serves. The exposure is therefore the projection
 * below, and nothing else -- adding a field here publishes it to anyone who can open
 * the site, so add deliberately.
 *
 * Two rules the projection has to obey, both learned the hard way. It must match what the
 * GraphQL path returns, or the same dashboard says different things depending on which
 * surface answered -- Risk_Rating__c was selected here long after GraphQL dropped it, so
 * the bank's own assessment of a deal reached the borrower's browser through this door.
 * LTV__c, DSCR__c and Underwriting_Notes__c are withheld for the same reason: they are
 * Acme's underwriting, not facts the borrower is party to. And every field must be
 * readable by the permission sets that serve the site: Salesforce enforces field-level
 * security inside SOQL for guest users and reports an unreadable field as
 * `No such column`, which fails the whole request rather than blanking a column.
 * `scripts/validate_los.py` checks the second rule offline.
 */
@RestResource(urlMapping='/los/loans/*')
global with sharing class LosLoanListService {

    /** Bounded so a large org cannot turn the dashboard into an unpaged export. */
    @TestVisible
    private static final Integer MAX_RECORDS = 50;

    global class LoanSummary {
        global String recordId;
        global String loanId;
        global String name;
        global String borrower;
        /** The borrowing entity, where the borrower borrows through a subsidiary. */
        global String borrowerEntity;
        global String loanType;
        global String status;
        global Decimal loanAmount;
        global Integer termMonths;
        /** ISO date, or null while the loan is still in origination. */
        global String maturityDate;
        /** The Box workspace folder this loan file is associated with. */
        global String boxFolderId;
        /** Box Sign embed URL for in-app signing. Present when signature is pending. */
        global String signEmbedUrl;
    }

    @HttpGet
    global static void listLoans() {
        RestResponse response = RestContext.response;
        response.addHeader('Content-Type', 'application/json');

        // A guest is not a borrower with no loans; it is nobody. Sharing would return an
        // empty list either way, and the page would then state "no loan records yet" to
        // somebody whose session has simply expired -- a claim about the org made from a
        // fact about the visitor. Refusing here keeps "empty" meaning empty. Granting a
        // guest sharing rule is MT-045, a deliberate exposure.
        if (UserInfo.getUserType() == 'Guest') {
            response.statusCode = 401;
            response.responseBody = Blob.valueOf(
                JSON.serialize(new Map<String, String>{
                    'error' => 'not_authenticated',
                    'detail' => 'Sign in to see the loans your organisation has with us.'
                })
            );
            return;
        }

        try {
            response.statusCode = 200;
            response.responseBody = Blob.valueOf(JSON.serialize(new LoanReader().read()));
        } catch (Exception e) {
            response.statusCode = 500;
            response.responseBody = Blob.valueOf(
                JSON.serialize(new Map<String, String>{
                    'error' => 'loan_list_failed',
                    'detail' => e.getTypeName()
                })
            );
        }
    }

    /**
     * `with sharing`, deliberately, and it used to be the opposite.
     *
     * This endpoint now serves one audience: a borrower in the Experience Cloud site. The
     * internal persona reads the pipeline through the MCP server instead. So the right
     * answer to "which loans may this caller see" is the platform's -- the
     * LOS_Borrower_Access sharing set maps a loan's Borrower_Account__c to the signed-in
     * user's Contact.Account, and sharing then filters the query for free.
     *
     * While this ran `without sharing` it returned every loan in the org to whoever asked.
     * On an authenticated borrower site that means one customer reading the names,
     * amounts and statuses of every other customer's loans.
     */
    private with sharing class LoanReader {
        private List<LoanSummary> read() {
            List<LoanSummary> summaries = new List<LoanSummary>();
            for (LOS_Loan__c record : [
                SELECT Id, Name, Loan_ID__c, Borrower__c, Borrower_Entity__c, Loan_Type__c,
                       Status__c, Loan_Amount__c, Term_Months__c,
                       Maturity_Date__c, Box_Workspace_Folder_ID__c, Sign_Embed_URL__c
                FROM LOS_Loan__c
                ORDER BY LastModifiedDate DESC
                LIMIT :MAX_RECORDS
            ]) {
                LoanSummary summary = new LoanSummary();
                summary.recordId = record.Id;
                summary.loanId = record.Loan_ID__c;
                summary.name = record.Name;
                summary.borrower = record.Borrower__c;
                summary.borrowerEntity = record.Borrower_Entity__c;
                summary.loanType = record.Loan_Type__c;
                summary.status = record.Status__c;
                summary.loanAmount = record.Loan_Amount__c;
                summary.termMonths = record.Term_Months__c == null
                    ? null
                    : Integer.valueOf(record.Term_Months__c);
                summary.maturityDate = record.Maturity_Date__c == null
                    ? null
                    : String.valueOf(record.Maturity_Date__c);
                summary.boxFolderId = record.Box_Workspace_Folder_ID__c;
                summary.signEmbedUrl = record.Sign_Embed_URL__c;
                summaries.add(summary);
            }
            return summaries;
        }
    }
}
