/**
 * Approves pending loan documents and auto-releases held term sheet when prerequisites met.
 *
 * The demo workflow is: borrower uploads 7 documents (6 required + 1 term sheet marked-up).
 * All 6 required docs start with reviewStatus="Pending". The term sheet starts with
 * reviewStatus="Held" to hide it from critical risk searches until review is complete.
 *
 * When this action approves the 6 required documents, it automatically releases the term
 * sheet by updating it from reviewStatus="Held" to reviewStatus="Pending", making it
 * visible in Beat 2's critical risk document search.
 *
 * Bounded like classify and extract: the loan must exist and the caller must be able to
 * read it. The Box credential stays in Apex.
 */
global with sharing class LosApproveDocuments {

    private static final String METADATA_ENDPOINT = 'callout:LOS_Box/2.0/files/';
    private static final String SEARCH_ENDPOINT = 'callout:LOS_Box/2.0/metadata_queries/execute_read';
    private static final String TEMPLATE_SCOPE = 'enterprise';
    private static final String TEMPLATE_KEY = 'losDocument';

    /** Document types that are required (not the term sheet) */
    @TestVisible
    private static final Set<String> REQUIRED_DOC_TYPES = new Set<String>{
        'Financial Statement', 'Tax Return', 'Bank Statement',
        'Appraisal', 'Insurance', 'Environmental Report'
    };

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
        @InvocableVariable(label='Whether term sheet was released')
        global Boolean termSheetReleased;
        @InvocableVariable(label='What happened, in a sentence')
        global String summary;
    }

    @InvocableMethod(
        label='Approve pending loan documents'
        description='Approves all pending documents for a loan. When 6 required documents are approved, automatically releases the held term sheet for review.'
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
        outcome.result.termSheetReleased = false;
        outcome.result.summary = detail;
        return outcome;
    }

    private static Outcome resolved(Integer approvedCount, Boolean termSheetReleased, String summary) {
        Outcome outcome = new Outcome();
        outcome.status = 200;
        outcome.result = new Result();
        outcome.result.approvedCount = approvedCount;
        outcome.result.termSheetReleased = termSheetReleased;
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

        // Query for all pending documents in this folder
        List<FileMetadata> pendingDocs = queryMetadata(token, found.folderId, 'reviewStatus=\'Pending\'');
        if (pendingDocs == null) {
            return refuse(500, 'query_failed', 'Could not query documents for this loan.');
        }

        if (pendingDocs.isEmpty()) {
            return resolved(0, false, 'No pending documents found to approve.');
        }

        // Approve all pending documents
        Integer approvedCount = 0;
        for (FileMetadata doc : pendingDocs) {
            if (updateReviewStatus(token, doc.fileId, 'Approved')) {
                approvedCount++;
            }
        }

        // Check if we should release the term sheet
        Boolean termSheetReleased = false;
        Integer requiredApprovedCount = countRequiredApproved(token, found.folderId);

        if (requiredApprovedCount >= 6) {
            // Find and release held term sheet
            List<FileMetadata> heldTermSheets = queryMetadata(
                token,
                found.folderId,
                'documentType=\'Term Sheet\' AND reviewStatus=\'Held\''
            );

            if (heldTermSheets != null && !heldTermSheets.isEmpty()) {
                for (FileMetadata termSheet : heldTermSheets) {
                    if (updateReviewStatus(token, termSheet.fileId, 'Pending')) {
                        termSheetReleased = true;
                    }
                }
            }
        }

        String summary = 'Approved ' + approvedCount + ' document' + (approvedCount == 1 ? '' : 's') + '.';
        if (termSheetReleased) {
            summary += ' Term sheet released for review.';
        }

        return resolved(approvedCount, termSheetReleased, summary);
    }

    private static Boolean canRead(Id loanId) {
        List<LOS_Loan__c> visible = [SELECT Id FROM LOS_Loan__c WHERE Id = :loanId LIMIT 1];
        return !visible.isEmpty();
    }

    /**
     * Query Box metadata for files matching the MDQL query in the given folder.
     */
    private static List<FileMetadata> queryMetadata(String token, String folderId, String query) {
        HttpRequest req = new HttpRequest();
        req.setEndpoint(SEARCH_ENDPOINT);
        req.setMethod('POST');
        req.setHeader('Authorization', 'Bearer ' + token);
        req.setHeader('Content-Type', 'application/json');
        req.setTimeout(30000);

        String mdql = 'from=' + TEMPLATE_SCOPE + '_' + TEMPLATE_KEY + ' AND ' + query;
        req.setBody(JSON.serialize(new Map<String, Object>{
            'from' => TEMPLATE_SCOPE + '_' + TEMPLATE_KEY,
            'ancestor_folder_id' => folderId,
            'query' => query,
            'fields' => new List<String>{ 'documentType', 'reviewStatus' }
        }));

        HttpResponse res = send(req);
        if (res == null || res.getStatusCode() != 200) {
            System.debug(LoggingLevel.WARN, 'LOS approve: metadata query returned ' +
                (res == null ? 'no response' : res.getStatusCode() + ' ' + res.getBody()));
            return null;
        }

        return parseMetadataResults(res.getBody());
    }

    /**
     * Count how many required documents (not term sheets) are approved.
     */
    private static Integer countRequiredApproved(String token, String folderId) {
        List<FileMetadata> approvedDocs = queryMetadata(token, folderId, 'reviewStatus=\'Approved\'');
        if (approvedDocs == null) {
            return 0;
        }

        Integer count = 0;
        for (FileMetadata doc : approvedDocs) {
            if (REQUIRED_DOC_TYPES.contains(doc.documentType)) {
                count++;
            }
        }
        return count;
    }

    /**
     * Update the reviewStatus field on a file's metadata.
     */
    private static Boolean updateReviewStatus(String token, String fileId, String newStatus) {
        HttpRequest req = new HttpRequest();
        req.setEndpoint(METADATA_ENDPOINT + fileId + '/metadata/' + TEMPLATE_SCOPE + '/' + TEMPLATE_KEY);
        req.setMethod('PUT');
        req.setHeader('Authorization', 'Bearer ' + token);
        req.setHeader('Content-Type', 'application/json-patch+json');
        req.setTimeout(30000);

        List<Object> operations = new List<Object>{
            new Map<String, Object>{
                'op' => 'add',
                'path' => '/reviewStatus',
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

    private class FileMetadata {
        String fileId;
        String documentType;
        String reviewStatus;
    }

    /**
     * Parse Box metadata query results into FileMetadata objects.
     */
    private static List<FileMetadata> parseMetadataResults(String responseBody) {
        List<FileMetadata> results = new List<FileMetadata>();

        try {
            Map<String, Object> parsed = (Map<String, Object>) JSON.deserializeUntyped(responseBody);
            List<Object> entries = (List<Object>) parsed.get('entries');

            if (entries == null) {
                return results;
            }

            for (Object entry : entries) {
                Map<String, Object> entryMap = (Map<String, Object>) entry;
                Map<String, Object> item = (Map<String, Object>) entryMap.get('item');
                Map<String, Object> metadata = (Map<String, Object>) entryMap.get('metadata');

                if (item == null || metadata == null) {
                    continue;
                }

                FileMetadata fileMeta = new FileMetadata();
                fileMeta.fileId = (String) item.get('id');
                fileMeta.documentType = (String) metadata.get('documentType');
                fileMeta.reviewStatus = (String) metadata.get('reviewStatus');
                results.add(fileMeta);
            }
        } catch (Exception e) {
            System.debug(LoggingLevel.WARN, 'LOS approve: failed to parse metadata results: ' + e.getMessage());
            return null;
        }

        return results;
    }
}
