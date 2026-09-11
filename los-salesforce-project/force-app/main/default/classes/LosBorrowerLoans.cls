/**
 * What the person on the other side of the loan is allowed to see.
 *
 * The internal actions take a loan reference and trust the caller to name one they should
 * have. That is right for a loan officer working a portfolio, and wrong for a borrower:
 * the Experience Cloud agent fills its arguments from the conversation, so an action with
 * a reference input is an action a borrower can point at somebody else's loan. Asking
 * politely in the instructions is not a control.
 *
 * So this action has no reference input at all. It resolves the running user's Contact,
 * takes that Contact's Account, and returns only loans whose Borrower_Account__c is that
 * Account. There is nothing to abuse because there is nothing to supply.
 *
 * The Account lookup is the anchor rather than the Borrower__c text, which can carry both
 * "Dockwright Logistics" and "Dockwright Logistics Holdings LLC" for the same customer --
 * matching on it would show a borrower some of their loans and hide the rest.
 *
 * An internal user has no Contact, and gets nothing. That is deliberate: this action
 * answers "what may this borrower see", and for a member of staff the answer is not
 * "everything", it is "ask a different question".
 */
public with sharing class LosBorrowerLoans {

    private static final Integer MAX_RECORDS = 25;

    public class Request {
        @InvocableVariable(
            label='Loan ID'
            description='Optional. Narrow to one of the signed-in borrower&apos;s own loans. A loan ID belonging to anyone else is refused.'
        )
        public String inputLoan;
    }

    public class Result {
        @InvocableVariable(label='Loans this borrower may see')
        public String outputSummary;
        @InvocableVariable(label='Borrower account name')
        public String outputBorrower;
        @InvocableVariable(label='How many loans matched')
        public Integer outputCount;
    }

    @InvocableMethod(
        label='Get my loans'
        description='Returns only the loans belonging to the signed-in borrower, resolved from their own account. Never returns another organisation&apos;s loans, whatever is asked for.'
    )
    public static List<Result> get(List<Request> requests) {
        List<Result> results = new List<Result>();
        for (Request req : requests) {
            results.add(build(req == null ? null : req.inputLoan));
        }
        return results;
    }

    /**
     * Lets a test pin the bound account.
     *
     * Record visibility for a portal user is a sharing question, not an Apex one -- a
     * community user reaches their own account's rows through a sharing set, which cannot
     * be conjured inside a test. Without this the filter could only be exercised by
     * granting the test user View All, and a test that grants the very permission the
     * class exists to avoid proves nothing.
     */
    @TestVisible
    private static Id accountOverride;

    /** The account this conversation is bounded to, exposed so a test can prove it. */
    @TestVisible
    private static Id boundAccount() {
        return accountOverride != null ? accountOverride : new IdentityResolver().accountForRunningUser();
    }

    private static Result build(String reference) {
        Result result = new Result();
        result.outputCount = 0;

        Id accountId = boundAccount();
        if (accountId == null) {
            result.outputSummary = 'I can only discuss loans for the organisation you are signed in as, and I cannot tell which that is.';
            return result;
        }

        List<LOS_Loan__c> mine = new BorrowerReader().read(accountId);
        if (mine.isEmpty()) {
            result.outputSummary = 'There are no loans on file for your organisation.';
            return result;
        }
        result.outputBorrower = mine[0].Borrower_Account__r.Name;

        if (String.isNotBlank(reference)) {
            String wanted = reference.trim();
            for (LOS_Loan__c record : mine) {
                // String comparison on the id: `wanted == record.Id` coerces the left side
                // to an Id and throws on a reference like LN-2026-0042.
                if (wanted.equalsIgnoreCase(record.Loan_ID__c)
                    || wanted.equalsIgnoreCase(String.valueOf(record.Id))) {
                    result.outputCount = 1;
                    result.outputSummary = describe(record);
                    return result;
                }
            }
            // Named, but not theirs. Say which organisation this conversation is bounded to
            // rather than implying the loan does not exist -- it does, just not here.
            result.outputSummary = wanted + ' is not a loan belonging to '
                + result.outputBorrower + '. I can only discuss your own loans.';
            return result;
        }

        List<String> lines = new List<String>{ 'Loans for ' + result.outputBorrower + ':' };
        for (LOS_Loan__c record : mine) {
            lines.add(describe(record));
        }
        result.outputCount = mine.size();
        result.outputSummary = String.join(lines, '\n');
        return result;
    }

    private static String describe(LOS_Loan__c record) {
        List<String> parts = new List<String>{ '- ' + record.Loan_ID__c + ' -- ' + record.Name };
        if (String.isNotBlank(record.Status__c)) parts.add('Status: ' + record.Status__c);
        if (record.Term_Months__c != null) parts.add('Term: ' + String.valueOf(record.Term_Months__c.intValue()) + ' months');
        return String.join(parts, ' | ');
    }

    /**
     * The running user's Account, by way of their Contact.
     *
     * `without sharing` only to read the caller's own User and Contact rows. It widens
     * nothing: the Account it returns is the caller's own, and it is the value everything
     * below is filtered by.
     */
    private without sharing class IdentityResolver {
        private Id accountForRunningUser() {
            // Schema-qualified: an unqualified User resolves ambiguously here and the
            // compiler reports it as "Illegal assignment from List<User> to List<User>".
            List<Schema.User> users = [
                SELECT ContactId, Contact.AccountId
                FROM User
                WHERE Id = :UserInfo.getUserId()
                LIMIT 1
            ];
            if (users.isEmpty() || users[0].ContactId == null) {
                return null;
            }
            return users[0].Contact.AccountId;
        }
    }

    /**
     * `without sharing` because LOS_Loan__c is Private/Private and a borrower is shared
     * nothing. The account filter is the boundary, and it is applied here rather than
     * left to the caller -- which is the whole point of this class.
     */
    private without sharing class BorrowerReader {
        private List<LOS_Loan__c> read(Id accountId) {
            return [
                SELECT Id, Name, Loan_ID__c, Status__c, Term_Months__c,
                       Borrower_Account__r.Name
                FROM LOS_Loan__c
                WHERE Borrower_Account__c = :accountId
                ORDER BY LastModifiedDate DESC
                LIMIT :MAX_RECORDS
            ];
        }
    }
}
