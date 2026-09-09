/**
 * The agent's entry point into a loan: the record, the governed Box folder, and the Box
 * file id of every document in it.
 *
 * Without this the Loan Copilot has nothing to act on. Its instructions tell it to cite
 * Box files, but the Box AI action addresses a file by id, and nothing in the
 * conversation supplies one -- so the agent could only promise to "gather the details"
 * and then answer from nothing. This turns a loan reference a person typed into the ids
 * the next action needs.
 *
 * The folder comes from the Box for Salesforce association, read with SOQL rather than
 * through box.Toolkit. The Toolkit read is harmless, but the provisioning call beside it
 * commits DML, and Apex forbids a callout after DML -- reading `box__FRUP__c` directly
 * keeps this method callout-safe by construction and reads the same rows the Toolkit
 * would. A loan with no association is reported as such rather than provisioned:
 * creating Box folders is not something a conversation should do on its own.
 *
 * The listing itself does go through box.Toolkit. It already holds the org's Box
 * credentials, so this needs no token grant, no named credential and no HTTP of its own --
 * one less place for the Box auth story to drift out of step.
 */
public with sharing class LosLoanPackage {

    public class Request {
        @InvocableVariable(
            label='Loan ID or record ID'
            description='A LOS loan ID such as LN-2026-0042, the loan name, or a LOS_Loan__c record ID.'
            required=true
        )
        public String inputLoan;
    }

    public class Result {
        @InvocableVariable(label='Loan package summary')
        public String outputSummary;
        @InvocableVariable(label='Salesforce record ID')
        public String outputRecordId;
        @InvocableVariable(label='Box folder ID')
        public String outputFolderId;
        /**
         * The loan ID of the loan this actually resolved to.
         *
         * The caller may have typed a name, a record id, or a partial reference, so what
         * it sent is not necessarily what was found. Anything that has to stay bounded to
         * the same loan afterwards -- asking Box AI about one of these documents, say, or
         * extracting terms from one -- needs the resolved reference rather than the typed
         * one, and returning it here means the agent binds to what the lookup decided
         * instead of to what the model remembered.
         */
        @InvocableVariable(label='Resolved loan ID')
        public String outputLoanReference;
        @InvocableVariable(label='Whether a loan and its documents were found')
        public Boolean outputFound;
    }

    @InvocableMethod(
        label='Get loan package'
        description='Finds a loan, its governed Box folder, and every document in that folder with its Box file ID.'
    )
    public static List<Result> get(List<Request> requests) {
        List<Result> results = new List<Result>();
        for (Request req : requests) {
            results.add(build(req == null ? null : req.inputLoan));
        }
        return results;
    }

    private static Result build(String reference) {
        Result result = new Result();
        result.outputFound = false;

        if (String.isBlank(reference)) {
            result.outputSummary = 'Tell me which loan you mean -- its loan ID, for example LN-2026-0042.';
            return result;
        }

        LOS_Loan__c loan = new LoanLookup().byReference(reference.trim());
        if (loan == null) {
            result.outputSummary = 'I could not find a LOS loan matching "' + reference.trim() + '".';
            return result;
        }

        result.outputRecordId = loan.Id;
        result.outputLoanReference = loan.Loan_ID__c;
        String folderId = new FolderMapping().forRecord(loan.Id);
        if (String.isBlank(folderId)) {
            folderId = loan.Box_Workspace_Folder_ID__c;
        }
        result.outputFolderId = folderId;

        List<String> lines = new List<String>{ describe(loan) };

        if (String.isBlank(folderId)) {
            lines.add('This loan has no Box folder associated yet, so there are no documents to cite.');
            result.outputSummary = String.join(lines, '\n');
            return result;
        }

        List<Doc> files = listFiles(folderId);
        if (files == null) {
            lines.add('Box did not return the contents of folder ' + folderId + '. Do not guess at the documents.');
            result.outputSummary = String.join(lines, '\n');
            return result;
        }
        if (files.isEmpty()) {
            lines.add('The Box folder ' + folderId + ' is empty, so there is nothing to cite yet.');
            result.outputSummary = String.join(lines, '\n');
            return result;
        }

        lines.add('Documents:');
        for (Doc doc : files) {
            lines.add(doc.line());
        }
        result.outputFound = true;
        result.outputSummary = String.join(lines, '\n');
        return result;
    }

    /** A loan and the Box folder that holds its file, or nulls when either is unresolved. */
    public class Located {
        public LOS_Loan__c loan;
        public String folderId;
    }

    /**
     * Resolves a reference to the loan record and its governed folder.
     *
     * Exposed because generating a commitment letter, preparing a signature request,
     * extracting terms and applying them all need the same two facts this class already
     * knows how to find, and none of them should re-implement the reference-or-name-or-id
     * lookup or the FRUP-then-denormalised-field fallback. Unlike `get`, this makes no
     * Box callout: the caller is about to make its own.
     */
    public static Located locate(String reference) {
        Located found = new Located();
        if (String.isBlank(reference)) {
            return found;
        }
        found.loan = new LoanLookup().byReference(reference.trim());
        if (found.loan == null) {
            return found;
        }
        String folderId = new FolderMapping().forRecord(found.loan.Id);
        found.folderId = String.isNotBlank(folderId)
            ? folderId
            : found.loan.Box_Workspace_Folder_ID__c;
        return found;
    }

    /**
     * The Box file IDs that belong to a loan, or null when the loan or its folder could
     * not be resolved.
     *
     * Exposed so that asking Box AI about a document, or extracting terms from one, can
     * be bounded to the loan the caller named. Without that bound an MCP client can hand
     * any Box file ID to the ask action and have it read, which is a wider reach than any
     * single loan implies.
     */
    /**
     * Stands in for the Box listing in tests.
     *
     * The Toolkit returns nothing in a test context, so every caller that bounds itself
     * with this method can only ever be tested on its refusal path. That leaves the branch
     * that actually reaches Box -- the one worth covering -- unexercised. Mirrors the
     * override on LosBorrowerLoans.
     */
    @TestVisible
    private static Set<String> documentIdsOverride;

    public static Set<String> documentIdsFor(String reference) {
        if (documentIdsOverride != null) {
            return documentIdsOverride;
        }
        if (String.isBlank(reference)) {
            return null;
        }
        LOS_Loan__c loan = new LoanLookup().byReference(reference.trim());
        if (loan == null) {
            return null;
        }
        String folderId = new FolderMapping().forRecord(loan.Id);
        if (String.isBlank(folderId)) {
            folderId = loan.Box_Workspace_Folder_ID__c;
        }
        if (String.isBlank(folderId)) {
            return null;
        }
        List<Doc> docs = listFiles(folderId);
        if (docs == null) {
            return null;
        }
        // Read straight off the document. This used to parse the id back out of the display
        // line, so changing how a document is written -- "(Box file ID 123)" to a link --
        // silently emptied this set, and every governed read was refused. A caller that
        // could reach Box another way then simply did, which is the one thing the check
        // exists to prevent.
        Set<String> ids = new Set<String>();
        for (Doc doc : docs) {
            ids.add(doc.id);
        }
        return ids;
    }

    private static String describe(LOS_Loan__c loan) {
        // The record id is deliberately not in the prose: it is already returned as
        // outputRecordId, and everything in this string is text a model may repeat back to
        // a person. Every word here is a word the answer can inherit.
        List<String> parts = new List<String>{ loan.Loan_ID__c + ' -- ' + loan.Name };
        if (String.isNotBlank(loan.Borrower__c)) parts.add('Borrower: ' + loan.Borrower__c);
        if (String.isNotBlank(loan.Status__c)) parts.add('Status: ' + loan.Status__c);
        if (String.isNotBlank(loan.Risk_Rating__c)) parts.add('Risk: ' + loan.Risk_Rating__c);
        return String.join(parts, '. ') + '.';
    }

    /**
     * The folder's files, one line each, or null when Box refused.
     *
     * Null and empty mean different things and the caller says so differently: an empty
     * folder is a real answer, a refusal is not, and collapsing them would let the agent
     * report "no documents" for what is actually a broken credential. box.Folder signals
     * a refusal by populating `status`, so an exception is not the only failure to catch.
     *
     * No commitChanges(): this reads and writes nothing, so there is no pending work.
     */
    /** One document in a governed loan folder. */
    public class Doc {
        public String name;
        public String id;
        private Doc(String name, String id) {
            this.name = name;
            this.id = id;
        }
        /** How the document is shown: a link, because an id means nothing to a person. */
        public String line() {
            return '- ' + this.name + ' - https://app.box.com/file/' + this.id;
        }
    }

    private static List<Doc> listFiles(String folderId) {
        box.Folder contents;
        try {
            contents = new box.Toolkit().getFolderContents(folderId);
        } catch (Exception e) {
            System.debug(LoggingLevel.WARN, 'LOS Box: folder listing failed: ' + e.getMessage());
            return null;
        }
        if (contents == null || String.isNotBlank(contents.status)) {
            System.debug(LoggingLevel.WARN, 'LOS Box: folder listing refused: '
                + (contents == null ? 'no response' : contents.status));
            return null;
        }

        List<Doc> docs = new List<Doc>();
        if (contents.entries == null) {
            return docs;
        }

        // First, collect files at the root level
        for (box.Entry item : contents.entries) {
            if (item.type == 'file') {
                docs.add(new Doc(item.name, item.id));
            }
        }

        // Always recurse into "02 - Borrower Documents" subfolder if present
        // This handles the common LOS workspace pattern where documents live in subfolders
        for (box.Entry item : contents.entries) {
            if (item.type == 'folder' && item.name == '02 - Borrower Documents') {
                try {
                    box.Folder subfolder = new box.Toolkit().getFolderContents(item.id);
                    if (subfolder != null && subfolder.entries != null) {
                        for (box.Entry file : subfolder.entries) {
                            if (file.type == 'file') {
                                docs.add(new Doc(file.name, file.id));
                            }
                        }
                    }
                } catch (Exception e) {
                    System.debug(LoggingLevel.WARN, 'LOS Box: subfolder listing failed: ' + e.getMessage());
                }
                break;
            }
        }

        return docs;
    }

    /**
     * The fields every governed action needs from a loan. One list, so the extract action
     * comparing a document against the record and the apply action checking the status
     * read the same projection the package summary does, and a field added for one is
     * available to all of them.
     */
    private static final String LOAN_FIELDS =
        'Id, Name, Loan_ID__c, Borrower__c, Borrower_Entity__c, Status__c, Risk_Rating__c, '
        + 'Loan_Amount__c, Interest_Rate__c, Term_Months__c, Collateral_Value__c, LTV__c, DSCR__c, '
        + 'Maturity_Date__c, Box_Workspace_Folder_ID__c';

    /**
     * Finds the loan the way a person names one: by loan ID, by record id, or by the
     * loan's name. The loan ID is what appears in the workspace and in the conversation,
     * so it is tried first.
     *
     * `without sharing` because the agent runs as its own user, which owns no loans and
     * is shared none -- LOS_Loan__c is Private/Private. With sharing enforced the action
     * returned "no matching loan" for every reference, which reads in the conversation as
     * a bad reference rather than as a permission boundary. The exposure is bounded by the
     * projection above and by LosLoanPackage having no other entry point: it returns loan
     * metadata and a document listing, and writes nothing. This mirrors
     * LosLoanListService, which reads the same object the same way.
     *
     * Dynamic SOQL only so the projection is written once; every bind stays a bind.
     * The access level is stated rather than defaulted: a borrower classifying a document
     * reaches this lookup, and under user mode the projection fails on the bank-only fields
     * (Risk_Rating__c and the pricing ratios) with "No such column" before the folder is
     * ever resolved. System mode here reads the record; what each caller returns to its
     * user is still that caller's decision, and the borrower-facing ones return none of it.
     */
    private without sharing class LoanLookup {
        private LOS_Loan__c byReference(String reference) {
            List<LOS_Loan__c> found = Database.query(
                'SELECT ' + LOAN_FIELDS + ' FROM LOS_Loan__c WHERE Loan_ID__c = :reference LIMIT 1'
            , AccessLevel.SYSTEM_MODE);
            if (!found.isEmpty()) {
                return found[0];
            }
            if (reference instanceof Id) {
                found = Database.query(
                    'SELECT ' + LOAN_FIELDS + ' FROM LOS_Loan__c WHERE Id = :reference LIMIT 1'
                , AccessLevel.SYSTEM_MODE);
                if (!found.isEmpty()) {
                    return found[0];
                }
            }
            String pattern = '%' + reference + '%';
            found = Database.query(
                'SELECT ' + LOAN_FIELDS + ' FROM LOS_Loan__c'
                + ' WHERE Name LIKE :pattern OR Loan_ID__c LIKE :pattern'
                + ' ORDER BY LastModifiedDate DESC LIMIT 1'
            , AccessLevel.SYSTEM_MODE);
            return found.isEmpty() ? null : found[0];
        }
    }

    /**
     * `without sharing` because the Box for Salesforce association records are not shared
     * with the agent user under normal sharing. It returns a folder id and grants no
     * record access; the loan itself is still read with the lookup above.
     */
    private without sharing class FolderMapping {
        private String forRecord(Id recordId) {
            try {
                List<box__FRUP__c> mappings = [
                    SELECT box__Folder_ID__c
                    FROM box__FRUP__c
                    WHERE box__Record_ID__c = :String.valueOf(recordId)
                    AND box__Folder_ID__c != null
                    ORDER BY LastModifiedDate DESC
                    LIMIT 1
                ];
                return mappings.isEmpty() ? null : mappings[0].box__Folder_ID__c;
            } catch (Exception e) {
                // A caller without access to the managed-package object cannot even name
                // it: Apex raises "sObject type box__FRUP__c is not supported" rather than
                // returning nothing. Losing the association costs the folder, and the
                // loan's own field still carries one -- it must not cost the answer.
                System.debug(LoggingLevel.WARN, 'LOS Box: association lookup failed: ' + e.getMessage());
                return null;
            }
        }
    }
}
