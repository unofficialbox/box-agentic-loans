/**
 * Generates the commitment letter for a loan whose terms have been resolved.
 *
 * Once underwriting has settled where the loan lands against policy, the useful artifact
 * is not "the loan agreement" -- that is drafted by Loan Documentation at closing. It is a
 * commitment: the terms the bank will lend on, the policy at issue and where the deal
 * sits against it, who owns the exception, and what the borrower has accepted before.
 * Box Doc Gen assembles those into one governed document that lands in the loan's own
 * folder.
 *
 * The split of authority matters and is deliberate. The **record** supplies the loan facts
 * -- id, borrower, amount, status -- so a caller cannot misattribute a letter to a loan it
 * is not about. The **caller** supplies the analysis, because the caller is the agent that
 * just read the credit policy Hub and the prior executed loan agreements and can cite
 * both. The letter says so on its face: prepared as a draft, pending Credit Committee
 * approval, and it authorises nothing.
 *
 * The Box credential stays in Apex. A client holding an MCP token holds no Box token.
 */
public with sharing class LosGenerateCommitmentLetter {

    private static final String BATCH_ENDPOINT = 'callout:LOS_Box/2.0/docgen_batches';

    /**
     * Box Doc Gen is a versioned API and the version is not optional: without this header
     * the batch endpoint is not reachable at all, and with the wrong one Box answers 400
     * naming the versions it does accept.
     */
    private static final String DOCGEN_API_VERSION = '2025.0';

    public class Request {
        @InvocableVariable(
            label='Loan ID'
            description='The loan the commitment letter is for, for example LN-2026-0042. The loan facts on the letter come from that record, not from this request.'
            required=true
        )
        public String loanReference;
        @InvocableVariable(
            label='Policy at issue'
            description='Which credit policy the application is measured against and where, for example "LTV and DSCR covenants, Section 9.3 and Schedule A".'
            required=true
        )
        public String policyAtIssue;
        @InvocableVariable(label='What the borrower requested' description='The position the application or the borrower\'s term sheet markup takes.')
        public String requestedPosition;
        @InvocableVariable(label='Approved position' description='The standard policy and its ID from the credit policy Hub, for example LOS-LTV-001.')
        public String approvedPosition;
        @InvocableVariable(label='Approved exception' description='The approved exception policy and its ID, for example LOS-LTV-002.')
        public String exceptionPosition;
        @InvocableVariable(label='Exception owner' description='The named function that owns approval of this exception. Defaults to Credit Risk.')
        public String owner;
        @InvocableVariable(label='What they accepted before' description='The precedent from prior executed loan agreements with this borrower.')
        public String precedentSummary;
        @InvocableVariable(label='Proposed terms' description='The terms the bank proposes to commit to.')
        public String proposedTerms;
        @InvocableVariable(label='Term sheet reference' description='The term sheet version this commitment answers, if known.')
        public String termSheetReference;
    }

    public class Result {
        @InvocableVariable(label='Outcome')
        public String summary;
        @InvocableVariable(label='Whether a document was generated')
        public Boolean generated;
        @InvocableVariable(label='Box Doc Gen batch ID')
        public String batchId;
    }

    @InvocableMethod(
        label='Generate a LOS commitment letter'
        description='Generates the draft commitment letter for a loan into its governed Box folder, from the credit policy position and prior executed loan agreements. The draft is pending Credit Committee approval and authorises nothing.'
    )
    public static List<Result> generate(List<Request> requests) {
        List<Result> results = new List<Result>();
        for (Request req : requests) {
            results.add(generateOne(req));
        }
        return results;
    }

    private static Result generateOne(Request req) {
        Result result = new Result();
        result.generated = false;

        if (req == null || String.isBlank(req.loanReference)) {
            result.summary = 'I need to know which loan the commitment letter is for.';
            return result;
        }
        if (String.isBlank(req.policyAtIssue)) {
            result.summary = 'I need the policy at issue before I can draft a commitment position on it.';
            return result;
        }

        LOS_Box_Config__c config = LOS_Box_Config__c.getOrgDefaults();
        String templateId = config == null ? null : config.Commitment_Letter_Template_ID__c;
        if (String.isBlank(templateId)) {
            result.summary = 'No commitment letter template is configured, so there is nothing to generate from.';
            return result;
        }

        LosLoanPackage.Located found = LosLoanPackage.locate(req.loanReference);
        if (found.loan == null) {
            result.summary = 'I could not find a LOS loan matching "'
                + req.loanReference.trim() + '".';
            return result;
        }
        if (String.isBlank(found.folderId)) {
            result.summary = 'Loan ' + found.loan.Loan_ID__c
                + ' has no Box folder, so there is nowhere governed to put the letter.';
            return result;
        }

        try {
            HttpRequest httpReq = new HttpRequest();
            httpReq.setEndpoint(BATCH_ENDPOINT);
            httpReq.setMethod('POST');
            httpReq.setHeader('Content-Type', 'application/json');
            httpReq.setHeader('box-version', DOCGEN_API_VERSION);
            httpReq.setHeader('Authorization', 'Bearer ' + LosBoxAuth.parentToken());
            httpReq.setTimeout(60000);
            httpReq.setBody(JSON.serialize(body(req, found, templateId)));

            HttpResponse res = new Http().send(httpReq);
            // Doc Gen is asynchronous: 202 means the batch was accepted, not that the file
            // exists yet. Reporting it as done would be a lie by a few seconds, so the
            // summary says submitted and names where it will land.
            if (res.getStatusCode() == 202 || res.getStatusCode() == 201) {
                Map<String, Object> parsed =
                    (Map<String, Object>) JSON.deserializeUntyped(res.getBody());
                result.batchId = String.valueOf(parsed.get('id'));
                result.generated = true;
                result.summary = 'Commitment letter submitted for ' + found.loan.Loan_ID__c
                    + '. It lands in Box folder ' + found.folderId
                    + ' as ' + fileName(found.loan) + '.pdf. '
                    + 'It is a draft pending Credit Committee approval and authorises nothing.';
                return result;
            }
            result.summary = 'Box Doc Gen refused the request (' + res.getStatusCode()
                + '). No letter was generated.';
            System.debug(LoggingLevel.WARN, 'LOS DocGen: ' + res.getStatusCode() + ' ' + res.getBody());
        } catch (Exception e) {
            result.summary = 'The commitment letter could not be generated.';
            System.debug(LoggingLevel.WARN, 'LOS DocGen failed: ' + e.getMessage());
        }
        return result;
    }

    /**
     * The Doc Gen payload.
     *
     * `user_input` keys are the template's tag namespace, not Salesforce field names --
     * the template is authored against this shape, so the two move together and a rename
     * on either side leaves an unresolved `{{tag}}` in the output rather than an error.
     */
    private static Map<String, Object> body(
        Request req,
        LosLoanPackage.Located found,
        String templateId
    ) {
        LOS_Loan__c loan = found.loan;
        Map<String, Object> userInput = new Map<String, Object>{
            'loan' => new Map<String, Object>{
                'id' => blankToDash(loan.Loan_ID__c),
                'borrower' => blankToDash(loan.Borrower__c),
                'termSheetReference' => blankToDash(req.termSheetReference),
                'loanAmount' => loan.Loan_Amount__c == null
                    ? '--' : String.valueOf(loan.Loan_Amount__c),
                'status' => blankToDash(loan.Status__c)
            },
            'letter' => new Map<String, Object>{
                'preparedOn' => Datetime.now().format('d MMMM yyyy'),
                'preparedBy' => 'Loan Copilot (draft)'
            },
            'terms' => new Map<String, Object>{
                'policyAtIssue' => blankToDash(req.policyAtIssue),
                'requestedPosition' => blankToDash(req.requestedPosition),
                'approvedPosition' => blankToDash(req.approvedPosition),
                'exceptionPosition' => blankToDash(req.exceptionPosition),
                'owner' => String.isBlank(req.owner) ? 'Credit Risk' : req.owner.trim(),
                'risk' => blankToDash(loan.Risk_Rating__c),
                'proposedTerms' => blankToDash(req.proposedTerms)
            },
            'precedent' => new Map<String, Object>{
                'summary' => String.isBlank(req.precedentSummary)
                    ? 'No prior executed loan agreement with this borrower was cited.'
                    : req.precedentSummary.trim()
            }
        };

        return new Map<String, Object>{
            'file' => new Map<String, Object>{ 'id' => templateId, 'type' => 'file' },
            'input_source' => 'api',
            'destination_folder' => new Map<String, Object>{
                'id' => found.folderId, 'type' => 'folder'
            },
            'output_type' => 'pdf',
            'document_generation_data' => new List<Object>{
                new Map<String, Object>{
                    'generated_file_name' => fileName(loan),
                    'user_input' => userInput
                }
            }
        };
    }

    private static String fileName(LOS_Loan__c loan) {
        return 'commitment-letter-' + loan.Loan_ID__c;
    }

    /**
     * An em-dash rather than an empty string, because Doc Gen leaves an unfilled tag
     * looking like a rendering bug and a dash reads as "nothing to say here".
     */
    private static String blankToDash(String value) {
        return String.isBlank(value) ? '--' : value.trim();
    }
}
