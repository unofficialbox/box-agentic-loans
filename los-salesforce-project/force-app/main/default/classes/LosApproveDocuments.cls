/**
 * Approves pending loan documents and auto-releases held term sheet when prerequisites met.
 *
 * The demo workflow is: borrower uploads 7 documents (6 required + 1 term sheet marked-up).
 * All documents start with approvalStatus="Pending". The term sheet additionally has
 * versionStatus="Internal" to hide it from the borrower and from Beat 2's critical risk search.
 *
 * When this action approves the 6 required documents, it automatically releases the term
 * sheet by updating it from versionStatus="Internal" to versionStatus="Draft", making it
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

        // Use folder listing instead of metadata query to avoid MDQL complexity
        Set<String> documentIds = LosLoanPackage.documentIdsFor(String.valueOf(found.loan.Id));
        if (documentIds == null || documentIds.isEmpty()) {
            return resolved(0, false, 'No documents found to approve.');
        }

        // Approve all documents with approvalStatus="Pending"
        Integer approvedCount = 0;
        Integer requiredApprovedCount = 0;

        for (String fileId : documentIds) {
            FileMetadata meta = getFileMetadata(token, fileId);
            if (meta == null) {
                continue;
            }

            // Approve if currently pending
            if ('Pending'.equalsIgnoreCase(meta.approvalStatus)) {
                if (updateApprovalStatus(token, fileId, 'Approved')) {
                    approvedCount++;
                    if (REQUIRED_DOC_TYPES.contains(meta.documentType)) {
                        requiredApprovedCount++;
                    }
                }
            } else if ('Approved'.equalsIgnoreCase(meta.approvalStatus)) {
                // Count already-approved required docs
                if (REQUIRED_DOC_TYPES.contains(meta.documentType)) {
                    requiredApprovedCount++;
                }
            }
        }

        // Check if we should release the term sheet
        Boolean termSheetReleased = false;

        if (requiredApprovedCount >= 6) {
            // Find and release Internal term sheet
            for (String fileId : documentIds) {
                FileMetadata meta = getFileMetadata(token, fileId);
                if (meta != null &&
                    'Term Sheet'.equalsIgnoreCase(meta.documentType) &&
                    'Internal'.equalsIgnoreCase(meta.versionStatus)) {
                    if (updateVersionStatus(token, fileId, 'Draft')) {
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

    private class FileMetadata {
        String fileId;
        String documentType;
        String approvalStatus;
        String versionStatus;
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
            meta.versionStatus = (String) metadata.get('versionStatus');
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
        return updateMetadataField(token, fileId, 'approvalStatus', newStatus);
    }

    /**
     * Update the versionStatus field on a file's metadata.
     */
    private static Boolean updateVersionStatus(String token, String fileId, String newStatus) {
        return updateMetadataField(token, fileId, 'versionStatus', newStatus);
    }

    /**
     * Update a single metadata field using JSON Patch.
     */
    private static Boolean updateMetadataField(String token, String fileId, String fieldName, String newValue) {
        HttpRequest req = new HttpRequest();
        req.setEndpoint(METADATA_ENDPOINT + fileId + '/metadata/' + TEMPLATE_SCOPE + '/' + TEMPLATE_KEY);
        req.setMethod('PUT');
        req.setHeader('Authorization', 'Bearer ' + token);
        req.setHeader('Content-Type', 'application/json-patch+json');
        req.setTimeout(30000);

        List<Object> operations = new List<Object>{
            new Map<String, Object>{
                'op' => 'add',
                'path' => '/' + fieldName,
                'value' => newValue
            }
        };
        req.setBody(JSON.serialize(operations));

        HttpResponse res = send(req);
        if (res == null || res.getStatusCode() != 200) {
            System.debug(LoggingLevel.WARN, 'LOS approve: metadata update for ' + fileId + ' field ' + fieldName + ' returned ' +
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
