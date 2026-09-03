/**
 * The loans in flight, so a question can be asked about a portfolio rather than one
 * named record.
 *
 * This exists because the alternative is worse. Without it, "where are we exposed across
 * open applications" can only be answered for loans the person already knows to name,
 * which is exactly the blind spot the question is trying to close -- the policy exception
 * you have not thought of is the one that hurts.
 *
 * It is deliberately not offered to the Experience Cloud agent. That surface serves a
 * borrower looking at one loan, and enumerating the pipeline there would hand an external
 * party a list of every deal in the bank. The same governed action, exposed on one
 * surface and withheld from the other, is the point rather than an oversight.
 *
 * The projection is fixed and narrow: enough to choose a loan to look at, and nothing
 * that would make this a data export. Amounts and borrowers are already visible to
 * anyone who can read the object.
 */
public with sharing class LosLoanList {

    /** Bounded so a portfolio question cannot turn into a table scan. */
    private static final Integer MAX_RECORDS = 50;

    public class Request {
        @InvocableVariable(
            label='Status filter'
            description='Optional. Return only loans in this status: Application, Underwriting, Credit Review, Approved, Commitment, Closed, or Servicing. Omit to return all, then filter from the statuses shown.'
        )
        public String inputStatus;
        @InvocableVariable(
            label='Borrower filter'
            description='Optional. Return only loans whose borrower contains this text.'
        )
        public String inputBorrower;
    }

    public class Result {
        @InvocableVariable(label='Loan list')
        public String outputSummary;
        @InvocableVariable(label='How many loans matched')
        public Integer outputCount;
    }

    @InvocableMethod(
        label='List LOS loans'
        description='Lists LOS loans with their loan ID, borrower, status, risk rating and amount, so a portfolio question can be answered. Use the loan ID from here to get a loan package.'
    )
    public static List<Result> listLoans(List<Request> requests) {
        List<Result> results = new List<Result>();
        for (Request req : requests) {
            results.add(build(req));
        }
        return results;
    }

    private static Result build(Request req) {
        Result result = new Result();
        List<LOS_Loan__c> found = new LoanReader().read(
            req == null ? null : req.inputStatus,
            req == null ? null : req.inputBorrower
        );
        result.outputCount = found.size();

        if (found.isEmpty()) {
            result.outputSummary = 'No LOS loans matched.';
            return result;
        }

        List<String> lines = new List<String>{
            'LOS loans (' + found.size() + (found.size() == MAX_RECORDS ? ', capped at ' + MAX_RECORDS : '') + '):'
        };
        for (LOS_Loan__c record : found) {
            List<String> parts = new List<String>{ '- ' + record.Loan_ID__c + ' -- ' + record.Name };
            if (String.isNotBlank(record.Borrower__c)) parts.add(record.Borrower__c);
            if (String.isNotBlank(record.Status__c)) parts.add('Status: ' + record.Status__c);
            if (String.isNotBlank(record.Risk_Rating__c)) parts.add('Risk: ' + record.Risk_Rating__c);
            if (record.Loan_Amount__c != null) parts.add('Amount: ' + record.Loan_Amount__c.format());
            lines.add(String.join(parts, ' | '));
        }
        result.outputSummary = String.join(lines, '\n');
        return result;
    }

    /**
     * `without sharing` for the same reason as LosLoanListService: the agent user owns
     * no loans and is shared none, so a record-scoped read returns an empty pipeline
     * and the answer reads as "you have no exposure" -- the most dangerous wrong answer
     * this action could give.
     */
    private without sharing class LoanReader {
        private List<LOS_Loan__c> read(String status, String borrower) {
            String statusFilter = String.isBlank(status) ? null : status.trim();
            String borrowerFilter = String.isBlank(borrower) ? null : '%' + borrower.trim() + '%';

            // Dynamic because both filters are optional and SOQL has no way to say
            // "ignore this predicate". The values stay bound rather than concatenated, so
            // a borrower name carrying a quote is a search term and not an injection.
            List<String> predicates = new List<String>();
            if (statusFilter != null) {
                predicates.add('Status__c = :statusFilter');
            }
            if (borrowerFilter != null) {
                predicates.add('Borrower__c LIKE :borrowerFilter');
            }
            String soql = 'SELECT Id, Name, Loan_ID__c, Borrower__c, Status__c, '
                + 'Risk_Rating__c, Loan_Amount__c FROM LOS_Loan__c';
            if (!predicates.isEmpty()) {
                soql += ' WHERE ' + String.join(predicates, ' AND ');
            }
            soql += ' ORDER BY LastModifiedDate DESC LIMIT ' + MAX_RECORDS;
            return Database.query(soql);
        }
    }
}
