/**
 * Creates a Box Sign request for embedded signing in the React app.
 *
 * The whole demo rests on the claim that autonomy stops at signature, so an action that
 * lets an agent put a commitment letter in front of a borrower would quietly falsify it.
 * This one is built so that it cannot:
 *
 *   - It refuses unless the loan has reached an approved state. A loan still in
 *     Underwriting is not signable and the refusal says which state it is in.
 *   - It bounds the document to the loan that was named, the same way reading one is
 *     bounded, so a Box file ID from somewhere else cannot be routed for signature.
 *   - It sets `is_document_preparation_needed = false` and includes `embed_url_external_user_id`
 *     to enable embedded signing. The sign request is created but sent via iframe in the React
 *     app, not via email. This allows the borrower to sign in-app while maintaining human control.
 *
 * The honest description is "create sign request for embedded signing", and the
 * summary it returns says exactly that rather than implying an email went out.
 */
public with sharing class LosSendForSignature {

    private static final String SIGN_ENDPOINT = 'callout:LOS_Box/2.0/sign_requests';

    /**
     * The loan states from which a signature request may be prepared. Anything earlier
     * has not cleared credit approval, and 'Closed' or 'Servicing' is already done.
     */
    private static final Set<String> SIGNABLE = new Set<String>{ 'Approved', 'Commitment' };

    public class Request {
        @InvocableVariable(
            label='Loan ID'
            description='The loan being signed, for example LN-2026-0042.'
            required=true
        )
        public String loanReference;
        @InvocableVariable(
            label='Box item ID'
            description='The Box file ID of the document to sign, taken from that loan\'s package listing.'
            required=true
        )
        public String itemId;
        @InvocableVariable(label='Signer email' required=true)
        public String signerEmail;
        @InvocableVariable(label='Signer name')
        public String signerName;
        @InvocableVariable(label='Email subject')
        public String subject;
    }

    public class Result {
        @InvocableVariable(label='Outcome')
        public String summary;
        @InvocableVariable(label='Whether a signature request was prepared')
        public Boolean prepared;
        @InvocableVariable(label='URL a human opens to review and send')
        public String prepareUrl;
        @InvocableVariable(label='Embed URL for in-app signing')
        public String embedUrl;
        @InvocableVariable(label='Box Sign request ID')
        public String requestId;
    }

    @InvocableMethod(
        label='Create Box Sign request for embedded signing'
        description='Creates a Box Sign request with embedded signing enabled. The embed URL is stored on the loan record for the borrower to sign in-app. Signature fields are pre-placed using Box Sign tags in the template.'
    )
    public static List<Result> prepare(List<Request> requests) {
        List<Result> results = new List<Result>();
        for (Request req : requests) {
            results.add(prepareOne(req));
        }
        return results;
    }

    private static Result prepareOne(Request req) {
        Result result = new Result();
        result.prepared = false;

        if (req == null || String.isBlank(req.loanReference)) {
            result.summary = 'I need to know which loan this document belongs to.';
            return result;
        }
        if (String.isBlank(req.itemId)) {
            result.summary = 'I need a Box file ID from the loan package before I can prepare a signature request.';
            return result;
        }
        if (String.isBlank(req.signerEmail)) {
            result.summary = 'I need a signer before I can prepare a signature request. I will not guess at one.';
            return result;
        }

        LosLoanPackage.Located found = LosLoanPackage.locate(req.loanReference);
        if (found.loan == null) {
            result.summary = 'I could not find a LOS loan matching "'
                + req.loanReference.trim() + '".';
            return result;
        }

        String status = found.loan.Status__c;
        if (!SIGNABLE.contains(status)) {
            result.summary = 'Loan ' + found.loan.Loan_ID__c + ' is ' + status
                + ', not approved for signature. Signature is blocked until Credit Committee'
                + ' approval is recorded; I cannot move it forward myself.';
            return result;
        }

        // The same bound reading a document has: the file must belong to this loan.
        Set<String> allowed = LosLoanPackage.documentIdsFor(req.loanReference);
        if (allowed == null) {
            result.summary = 'I could not resolve the documents for '
                + found.loan.Loan_ID__c + ', so I cannot confirm that file belongs to it.';
            return result;
        }
        if (!allowed.contains(req.itemId.trim())) {
            result.summary = 'That file is not in the Box folder for '
                + found.loan.Loan_ID__c + ', so it will not be sent for signature.';
            return result;
        }

        try {
            HttpRequest httpReq = new HttpRequest();
            httpReq.setEndpoint(SIGN_ENDPOINT);
            httpReq.setMethod('POST');
            httpReq.setHeader('Content-Type', 'application/json');
            httpReq.setHeader('Authorization', 'Bearer ' + LosBoxAuth.parentToken());
            httpReq.setTimeout(60000);
            httpReq.setBody(JSON.serialize(body(req, found)));

            HttpResponse res = new Http().send(httpReq);
            if (res.getStatusCode() == 200 || res.getStatusCode() == 201) {
                Map<String, Object> parsed =
                    (Map<String, Object>) JSON.deserializeUntyped(res.getBody());
                result.requestId = String.valueOf(parsed.get('id'));
                result.prepareUrl = parsed.get('prepare_url') == null
                    ? null : String.valueOf(parsed.get('prepare_url'));

                // Box may return the sender first. Use the requested signer's iframe URL.
                List<Object> signers = (List<Object>) parsed.get('signers');
                if (signers != null) {
                    for (Object entry : signers) {
                        Map<String, Object> signer = (Map<String, Object>)entry;
                        if (req.signerEmail.trim().equalsIgnoreCase((String)signer.get('email'))
                            && 'signer'.equals(signer.get('role'))) {
                            result.embedUrl = (String)signer.get('iframeable_embed_url');
                            break;
                        }
                    }

                    // Store embed URL on the loan record for borrower portal access
                    if (result.embedUrl != null) {
                        try {
                            found.loan.Sign_Embed_URL__c = result.embedUrl;
                            found.loan.Sign_Request_ID__c = result.requestId;
                            update found.loan;
                        } catch (Exception updateEx) {
                            System.debug(LoggingLevel.WARN, 'Could not update embed URL: ' + updateEx.getMessage());
                            result.summary = 'Box Sign created request ' + result.requestId
                                + ', but its signing URL could not be saved to the loan. Do not create a duplicate request.';
                            return result;
                        }
                    }
                }

                if (String.isBlank(result.embedUrl)) {
                    result.summary = 'Box Sign created request ' + result.requestId
                        + ', but has not returned an iframe signing URL for the requested signer. Do not create a duplicate request.';
                    return result;
                }

                result.prepared = true;
                result.summary = 'A Box Sign request is prepared for '
                    + found.loan.Loan_ID__c + ' and addressed to '
                    + req.signerEmail.trim() + '. The document is ready for embedded signing.';
                return result;
            }
            result.summary = 'Box Sign refused the request (' + res.getStatusCode()
                + '). Nothing was prepared and nothing was sent.';
            System.debug(LoggingLevel.WARN, 'LOS Sign: ' + res.getStatusCode() + ' ' + res.getBody());
        } catch (Exception e) {
            result.summary = 'The signature request could not be prepared. Nothing was sent.';
            System.debug(LoggingLevel.WARN, 'LOS Sign failed: ' + e.getMessage());
        }
        return result;
    }

    private static Map<String, Object> body(Request req, LosLoanPackage.Located found) {
        Map<String, Object> signer = new Map<String, Object>{
            'email' => req.signerEmail.trim(),
            'role' => 'signer',
            'embed_url_external_user_id' => req.signerEmail.trim()
        };
        if (String.isNotBlank(req.signerName)) {
            signer.put('name', req.signerName.trim());
        }
        return new Map<String, Object>{
            'source_files' => new List<Object>{
                new Map<String, Object>{ 'id' => req.itemId.trim(), 'type' => 'file' }
            },
            'parent_folder' => new Map<String, Object>{
                'id' => found.folderId, 'type' => 'folder'
            },
            'signers' => new List<Object>{ signer },
            'is_document_preparation_needed' => false,
            'subject' => String.isBlank(req.subject)
                ? 'Signature requested: ' + found.loan.Loan_ID__c
                : req.subject.trim()
        };
    }

}
