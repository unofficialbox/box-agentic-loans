/**
 * Approves pending loan documents.
 *
 * Simple workflow: update all documents with approvalStatus="Pending" to
 * approvalStatus="Approved". No hiding mechanism - all uploaded documents are
 * visible from the start.
 *
 * Bounded like classify and extract: the loan must exist and the caller must be
 * able to read it. The Box credential stays in Apex.
 */
global with sharing class LosApproveDocuments {

    private static final String METADATA_ENDPOINT = 'callout:LOS_Box/2.0/files/';
    private static final String TEMPLATE_SCOPE = 'enterprise';
    private static final String TEMPLATE_KEY = 'losDocument';

    global class Request {
        @InvocableVariable(
            label='Loan ID or record ID'
            description='The loan whose documents should be approved, for example LN-2026-0042 or the record ID.'
            required=true
        )
        global String loanReference;
    }

    global class Result {
        @InvocableVariable(label='Number of documents approved')
        global Integer approvedCount;
        @InvocableVariable(label='What happened, in a sentence')
        global String summary;
    }

    @InvocableMethod(
        label='Approve pending loan documents'
        description='Approves all pending documents for a loan by updating approvalStatus from Pending to Approved.'
    )
    global static List<Result> approve(List<Request> requests) {
        List<Result> results = new List<Result>();
        for (Request req : requests) {
            Outcome outcome = approveOne(
                req == null ? null : req.loanReference
            );
            results.add(outcome.result);
        }
        return results;
    }

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
        outcome.result.approvedCount = 0;
        outcome.result.summary = detail;
        return outcome;
    }

    private static Outcome resolved(Integer approvedCount, String summary) {
        Outcome outcome = new Outcome();
        outcome.status = 200;
        outcome.result = new Result();
        outcome.result.approvedCount = approvedCount;
        outcome.result.summary = summary;
        return outcome;
    }

    private static Outcome approveOne(String loanReference) {
        if (String.isBlank(loanReference)) {
            return refuse(400, 'invalid_request', 'I need to know which loan to approve documents for.');
        }

        LosLoanPackage.Located found = LosLoanPackage.locate(loanReference);
        if (found.loan == null || !canRead(found.loan.Id)) {
            return refuse(404, 'loan_not_found', 'I could not find a loan matching "' + loanReference.trim() + '".');
        }
        if (String.isBlank(found.folderId)) {
            return refuse(409, 'no_box_folder', 'This loan has no document folder yet, so there are no documents to approve.');
        }

        String token = LosBoxAuth.parentToken();
        if (String.isBlank(token)) {
            return refuse(500, 'box_not_configured', 'Box did not issue a token; this is a configuration problem, not something to retry.');
        }

        // Get all documents in the loan folder
        Set<String> documentIds = LosLoanPackage.documentIdsFor(String.valueOf(found.loan.Id));
        if (documentIds == null || documentIds.isEmpty()) {
            return resolved(0, 'No documents found to approve.');
        }

        // Approve all documents with approvalStatus="Pending"
        Integer approvedCount = 0;

        for (String fileId : documentIds) {
            FileMetadata meta = getFileMetadata(token, fileId);
            if (meta == null) {
                continue;
            }

            // Approve if currently pending
            if ('Pending'.equalsIgnoreCase(meta.approvalStatus)) {
                if (updateApprovalStatus(token, fileId, 'Approved')) {
                    approvedCount++;
                }
            }
        }

        String summary = 'Approved ' + approvedCount + ' document' + (approvedCount == 1 ? '' : 's') + '.';
        return resolved(approvedCount, summary);
    }

    private static Boolean canRead(Id loanId) {
        List<LOS_Loan__c> visible = [SELECT Id FROM LOS_Loan__c WHERE Id = :loanId LIMIT 1];
        return !visible.isEmpty();
    }

    private class FileMetadata {
        String fileId;
        String documentType;
        String approvalStatus;
    }

    /**
     * Get metadata for a single file.
     */
    private static FileMetadata getFileMetadata(String token, String fileId) {
        HttpRequest req = new HttpRequest();
        req.setEndpoint(METADATA_ENDPOINT + fileId + '/metadata/' + TEMPLATE_SCOPE + '/' + TEMPLATE_KEY);
        req.setMethod('GET');
        req.setHeader('Authorization', 'Bearer ' + token);
        req.setTimeout(30000);

        HttpResponse res = send(req);
        if (res == null || res.getStatusCode() != 200) {
            return null;
        }

        try {
            Map<String, Object> metadata = (Map<String, Object>) JSON.deserializeUntyped(res.getBody());
            FileMetadata meta = new FileMetadata();
            meta.fileId = fileId;
            meta.documentType = (String) metadata.get('documentType');
            meta.approvalStatus = (String) metadata.get('approvalStatus');
            return meta;
        } catch (Exception e) {
            System.debug(LoggingLevel.WARN, 'LOS approve: failed to parse metadata for ' + fileId + ': ' + e.getMessage());
            return null;
        }
    }

    /**
     * Update the approvalStatus field on a file's metadata.
     */
    private static Boolean updateApprovalStatus(String token, String fileId, String newStatus) {
        HttpRequest req = new HttpRequest();
        req.setEndpoint(METADATA_ENDPOINT + fileId + '/metadata/' + TEMPLATE_SCOPE + '/' + TEMPLATE_KEY);
        req.setMethod('PUT');
        req.setHeader('Authorization', 'Bearer ' + token);
        req.setHeader('Content-Type', 'application/json-patch+json');
        req.setTimeout(30000);

        List<Object> operations = new List<Object>{
            new Map<String, Object>{
                'op' => 'add',
                'path' => '/approvalStatus',
                'value' => newStatus
            }
        };
        req.setBody(JSON.serialize(operations));

        HttpResponse res = send(req);
        if (res == null || res.getStatusCode() != 200) {
            System.debug(LoggingLevel.WARN, 'LOS approve: metadata update for ' + fileId + ' returned ' +
                (res == null ? 'no response' : res.getStatusCode() + ' ' + res.getBody()));
            return false;
        }

        return true;
    }

    private static HttpResponse send(HttpRequest req) {
        try {
            return new Http().send(req);
        } catch (Exception e) {
            System.debug(LoggingLevel.WARN, 'LOS approve: request to ' + req.getEndpoint() + ' failed: ' + e.getMessage());
            return null;
        }
    }
}
