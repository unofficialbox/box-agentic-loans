/**
 * Names what a just-uploaded document is, with Box AI, and writes the name where every
 * surface reads it.
 *
 * The borrower's checklist, the lender's Copilot and the portfolio search all key off the
 * same fact: `losDocument.documentType` on the file. Until something writes it, an upload
 * is a file name, and the paved path is clear that a file name is not a classification --
 * a redline called `v5-final.pdf` is still a redline. So this asks Box AI to fill the
 * template's own enum from the document's content, and accepts nothing the enum does not
 * contain. A value is normalised against the template's options rather than passed
 * through, because Box rejects `appraisal` for `Appraisal` with an error that names the
 * schema path and not the fix.
 *
 * "Box AI could not name it" is an answer, not an error. The document is in the folder,
 * a loan officer will look at it, and the checklist shows it as received and awaiting
 * classification. Nothing is written in that case: a wrong type on the file would tick a
 * box the borrower has not actually satisfied.
 *
 * Bounded like the ask and extract actions: the file must be in the folder of the loan
 * named, the loan must be one the caller can read, and the Box credential stays in Apex.
 * One class serves both the invocable (agent, MCP, flow) and the REST endpoint the portal
 * calls after each upload, so there is exactly one classifier and one bound.
 */
@RestResource(urlMapping='/los/classify/*')
global with sharing class LosClassifyDocument {

    private static final String EXTRACT_ENDPOINT = 'callout:LOS_Box/2.0/ai/extract_structured';
    private static final String FILES_ENDPOINT = 'callout:LOS_Box/2.0/files/';
    private static final String TEMPLATE_SCOPE = 'enterprise';
    private static final String TEMPLATE_KEY = 'losDocument';
    /** Pinned so a Box AI schema change is a deliberate edit here, not a surprise in production. */

    /**
     * The template's own options, in the template's own spelling. `config/box/metadata-
     * templates.bcl` is the source; a value Box AI returns that is not in this list is
     * treated as "could not name it".
     */
    @TestVisible
    private static final List<String> DOCUMENT_TYPES = new List<String>{
        'Application', 'Financial Statement', 'Tax Return', 'Bank Statement', 'Appraisal',
        'Term Sheet', 'Commitment Letter', 'Loan Agreement', 'Insurance', 'Credit Memo',
        'Environmental Report'
    };
    @TestVisible
    private static final List<String> POLICY_RISKS = new List<String>{ 'Critical', 'High', 'Medium', 'Low' };

    global class Request {
        @InvocableVariable(
            label='Loan ID or record ID'
            description='The loan the document belongs to, for example LN-2026-0042 or the record ID. A document is only classified in the context of its own loan; left blank, the refusal says so rather than the platform failing the call.'
        )
        global String loanReference;
        @InvocableVariable(
            label='Box file ID'
            description='The Box file ID of the document to classify, from that loan&apos;s package listing or the upload that just completed.'
        )
        global String fileId;
    }

    global class Result {
        @InvocableVariable(label='Whether the document was classified')
        global Boolean classified;
        @InvocableVariable(label='Document type written to the file')
        global String documentType;
        @InvocableVariable(label='What happened, in a sentence')
        global String summary;
    }

    @InvocableMethod(
        label='Classify a loan document with Box AI'
        description='Reads one document of a named loan with Box AI, names its type from the losDocument template, and writes that type to the file&apos;s metadata. A file outside that loan is refused. A document Box AI cannot name is left for the loan officer, unchanged.'
    )
    global static List<Result> classify(List<Request> requests) {
        List<Result> results = new List<Result>();
        for (Request req : requests) {
            Outcome outcome = classifyOne(
                req == null ? null : req.loanReference,
                req == null ? null : req.fileId
            );
            results.add(outcome.result);
        }
        return results;
    }

    /** Lets a test stand in as a guest; a site guest user cannot be created in a test. */
    @TestVisible
    private static String userTypeOverride;

    /**
     * POST /los/classify?recordId=<loan Id>&fileId=<Box file id>.
     *
     * The portal calls this once per file after the Box uploader finishes, without waiting
     * on it. A refusal comes back as the error shape every LOS endpoint uses; an
     * unclassifiable document comes back 200 with `classified: false`, because it is not
     * something the browser should show as broken.
     */
    @HttpPost
    global static void classifyViaRest() {
        RestRequest request = RestContext.request;
        RestResponse response = RestContext.response;
        response.addHeader('Content-Type', 'application/json');
        response.addHeader('Cache-Control', 'no-store');

        if (isGuest()) {
            fail(response, 401, 'not_authenticated', 'Sign in to add documents to your loan application.');
            return;
        }

        Outcome outcome = classifyOne(request.params.get('recordId'), request.params.get('fileId'));
        if (outcome.error != null) {
            fail(response, outcome.status, outcome.error, outcome.result.summary);
            return;
        }
        response.statusCode = 200;
        response.responseBody = Blob.valueOf(JSON.serialize(outcome.result));
    }

    private static Boolean isGuest() {
        String userType = userTypeOverride != null ? userTypeOverride : UserInfo.getUserType();
        return userType == 'Guest';
    }

    /**
     * A result, and for the REST surface the status and error code a refusal carries. The
     * invocable reads only the result, whose summary is the same sentence either way.
     */
    private class Outcome {
        private Result result;
        private Integer status;
        private String error;
    }

    private static Outcome refuse(Integer status, String error, String detail) {
        Outcome outcome = new Outcome();
        outcome.status = status;
        outcome.error = error;
        outcome.result = new Result();
        outcome.result.classified = false;
        outcome.result.summary = detail;
        return outcome;
    }

    private static Outcome resolved(Boolean classified, String documentType, String summary) {
        Outcome outcome = new Outcome();
        outcome.status = 200;
        outcome.result = new Result();
        outcome.result.classified = classified;
        outcome.result.documentType = documentType;
        outcome.result.summary = summary;
        return outcome;
    }

    private static Outcome classifyOne(String loanReference, String fileIdParam) {
        if (String.isBlank(fileIdParam)) {
            return refuse(400, 'invalid_request', 'I need the Box file ID of the document to classify.');
        }
        if (String.isBlank(loanReference)) {
            return refuse(400, 'invalid_request', 'I need to know which loan the document belongs to before I can classify it.');
        }
        String fileId = fileIdParam.trim();

        // Resolved without sharing inside LosLoanPackage, so the caller's own visibility is
        // re-checked here under this class's sharing: a loan the borrower cannot read is,
        // to them, a loan that does not exist, and the answer says exactly that.
        LosLoanPackage.Located found = LosLoanPackage.locate(loanReference);
        if (found.loan == null || !canRead(found.loan.Id)) {
            return refuse(404, 'loan_not_found', 'I could not find a loan matching "' + loanReference.trim() + '".');
        }
        if (String.isBlank(found.folderId)) {
            return refuse(409, 'no_box_folder', 'This loan has no document folder yet, so there is nothing to classify.');
        }

        Set<String> allowed = LosLoanPackage.documentIdsFor(String.valueOf(found.loan.Id));
        if (allowed == null) {
            return refuse(500, 'box_listing_failed', 'Box did not list the documents for this loan, so I cannot confirm that file belongs to it.');
        }
        if (!allowed.contains(fileId)) {
            return refuse(403, 'file_not_in_loan', 'That file is not in the document folder for ' + found.loan.Loan_ID__c + ', so it cannot be classified here.');
        }

        String token = LosBoxAuth.parentToken();
        if (String.isBlank(token)) {
            return refuse(500, 'box_not_configured', 'Box did not issue a token, so the document could not be read; this is a configuration problem, not something to retry.');
        }

        HttpResponse extracted = send(extractRequest(token, fileId));
        if (extracted == null) {
            return refuse(500, 'box_ai_unavailable', 'Box AI did not respond, so the document has not been classified yet.');
        }
        if (extracted.getStatusCode() != 200 && extracted.getStatusCode() != 201) {
            System.debug(LoggingLevel.WARN, 'LOS classify: extract returned ' + extracted.getStatusCode() + ' ' + extracted.getBody());
            return refuse(500, 'box_ai_refused', 'Box AI could not read that document (HTTP ' + extracted.getStatusCode() + '), so it has not been classified yet.');
        }

        Map<String, Object> values = parseAnswer(extracted.getBody());
        String documentType = values == null ? null : canonical(valueFor(values, 'documentType'), DOCUMENT_TYPES);
        if (documentType == null) {
            // The legitimate "I do not know". Nothing is written: a guessed type would tick
            // a checklist item the borrower has not satisfied.
            return resolved(false, null, 'We received your document; it is awaiting classification by your loan officer.');
        }
        String policyRisk = canonical(valueFor(values, 'policyRisk'), POLICY_RISKS);

        Map<String, Object> instance = new Map<String, Object>{
            'documentType' => documentType,
            'versionStatus' => 'Draft',
            'aiSummaryStatus' => 'Complete',
            'approvalStatus' => 'Pending',
            'signatureStatus' => 'Not Required'
        };
        if (policyRisk != null) {
            instance.put('policyRisk', policyRisk);
        }

        HttpResponse written = send(metadataCreateRequest(token, fileId, instance));
        if (written == null) {
            return refuse(500, 'metadata_write_failed', 'Box AI recognised the document as ' + documentType
                + ' but Box did not respond when saving that, so your loan officer will classify it.');
        }
        if (written.getStatusCode() == 409) {
            // The file already carries a losDocument instance -- a re-upload, or a loan
            // officer tagged it first. Patch the two facts this action owns and leave the
            // rest of the instance as the person left it.
            written = send(metadataPatchRequest(token, fileId, documentType, policyRisk));
            if (written == null || written.getStatusCode() != 200) {
                System.debug(LoggingLevel.WARN, 'LOS classify: metadata patch returned '
                    + (written == null ? 'no response' : written.getStatusCode() + ' ' + written.getBody()));
                return refuse(500, 'metadata_write_failed', 'Box AI recognised the document as ' + documentType
                    + ' but the classification could not be saved, so your loan officer will classify it.');
            }
        } else if (written.getStatusCode() != 201 && written.getStatusCode() != 200) {
            System.debug(LoggingLevel.WARN, 'LOS classify: metadata create returned ' + written.getStatusCode() + ' ' + written.getBody());
            return refuse(500, 'metadata_write_failed', 'Box AI recognised the document as ' + documentType
                + ' but the classification could not be saved, so your loan officer will classify it.');
        }

        return resolved(true, documentType, 'Classified as ' + documentType + ' by Box AI.');
    }

    /** True when the running user can read the loan under this class's sharing. */
    private static Boolean canRead(Id loanId) {
        List<LOS_Loan__c> visible = [SELECT Id FROM LOS_Loan__c WHERE Id = :loanId LIMIT 1];
        return !visible.isEmpty();
    }

    /**
     * Box AI Extract against the metadata template itself, rather than an ad hoc field
     * list: the answer then arrives in the template's keys, and the enum options Box AI
     * chooses from are the template's own.
     */
    private static HttpRequest extractRequest(String token, String fileId) {
        HttpRequest req = new HttpRequest();
        req.setEndpoint(EXTRACT_ENDPOINT);
        req.setMethod('POST');
        req.setHeader('Authorization', 'Bearer ' + token);
        req.setHeader('Content-Type', 'application/json');
        // Box AI reads the whole document before answering, which is slower than a metadata call.
        req.setTimeout(120000);
        req.setBody(JSON.serialize(new Map<String, Object>{
            'items' => new List<Object>{
                new Map<String, Object>{ 'id' => fileId, 'type' => 'file' }
            },
            'metadata_template' => new Map<String, Object>{
                'type' => 'metadata_template',
                'scope' => TEMPLATE_SCOPE,
                'template_key' => TEMPLATE_KEY
            }
        }));
        return req;
    }

    private static HttpRequest metadataCreateRequest(String token, String fileId, Map<String, Object> instance) {
        HttpRequest req = new HttpRequest();
        req.setEndpoint(FILES_ENDPOINT + fileId + '/metadata/' + TEMPLATE_SCOPE + '/' + TEMPLATE_KEY);
        req.setMethod('POST');
        req.setHeader('Authorization', 'Bearer ' + token);
        req.setHeader('Content-Type', 'application/json');
        req.setTimeout(30000);
        req.setBody(JSON.serialize(instance));
        return req;
    }

    /**
     * JSON Patch, as Box expects for an existing instance. `add` is used for every key
     * because RFC 6902 defines it as "replace if present, else add", which is what is
     * wanted here and saves reading the instance first to choose between the two.
     */
    private static HttpRequest metadataPatchRequest(String token, String fileId, String documentType, String policyRisk) {
        List<Object> operations = new List<Object>{
            new Map<String, Object>{ 'op' => 'add', 'path' => '/documentType', 'value' => documentType },
            new Map<String, Object>{ 'op' => 'add', 'path' => '/aiSummaryStatus', 'value' => 'Complete' }
        };
        if (policyRisk != null) {
            operations.add(new Map<String, Object>{ 'op' => 'add', 'path' => '/policyRisk', 'value' => policyRisk });
        }
        HttpRequest req = new HttpRequest();
        req.setEndpoint(FILES_ENDPOINT + fileId + '/metadata/' + TEMPLATE_SCOPE + '/' + TEMPLATE_KEY);
        req.setMethod('PUT');
        req.setHeader('Authorization', 'Bearer ' + token);
        req.setHeader('Content-Type', 'application/json-patch+json');
        req.setTimeout(30000);
        req.setBody(JSON.serialize(operations));
        return req;
    }

    /** The response, or null when the callout itself failed. */
    private static HttpResponse send(HttpRequest req) {
        try {
            return new Http().send(req);
        } catch (Exception e) {
            System.debug(LoggingLevel.WARN, 'LOS classify: request to ' + req.getEndpoint() + ' failed: ' + e.getMessage());
            return null;
        }
    }

    /**
     * The `answer` of an extract response as a map. Box has returned it both as a JSON
     * object and as a string holding one; LosExtractLoanTerms tolerates both for the same
     * reason, which is that a parse failure here reads as "the document is nothing".
     */
    @TestVisible
    private static Map<String, Object> parseAnswer(String responseBody) {
        Map<String, Object> parsed;
        try {
            parsed = (Map<String, Object>) JSON.deserializeUntyped(responseBody);
        } catch (Exception e) {
            return null;
        }
        Object answer = parsed.get('answer');
        if (answer == null) {
            return null;
        }
        if (answer instanceof Map<String, Object>) {
            return (Map<String, Object>) answer;
        }
        if (answer instanceof String) {
            try {
                Object nested = JSON.deserializeUntyped((String) answer);
                if (nested instanceof Map<String, Object>) {
                    return (Map<String, Object>) nested;
                }
            } catch (Exception e) {
                // Not JSON: a bare string names no field.
            }
        }
        return null;
    }

    /** A key's value regardless of the case Box AI spelled the key in. */
    private static Object valueFor(Map<String, Object> values, String key) {
        if (values.containsKey(key)) {
            return values.get(key);
        }
        for (String candidate : values.keySet()) {
            if (candidate.equalsIgnoreCase(key)) {
                return values.get(candidate);
            }
        }
        return null;
    }

    /**
     * The template's spelling of a value, or null when it is not one of the options.
     * Case-insensitive on the way in, exact on the way out: Box's enum is case-sensitive
     * and a person's -- or a model's -- rendering of "appraisal" is not.
     */
    @TestVisible
    private static String canonical(Object raw, List<String> options) {
        if (raw == null || !(raw instanceof String)) {
            return null;
        }
        String wanted = ((String) raw).trim();
        if (String.isBlank(wanted)) {
            return null;
        }
        for (String option : options) {
            if (option.equalsIgnoreCase(wanted)) {
                return option;
            }
        }
        return null;
    }

    private static void fail(RestResponse response, Integer status, String error, String detail) {
        response.statusCode = status;
        response.responseBody = Blob.valueOf(JSON.serialize(
            new Map<String, String>{ 'error' => error, 'detail' => detail }));
    }
}
