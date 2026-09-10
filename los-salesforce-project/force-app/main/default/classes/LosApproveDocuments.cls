/**
 * Approves all pending documents for a loan by updating approvalStatus from Pending to Approved.
 */
public with sharing class LosApproveDocuments {

    public class Request {
        @InvocableVariable(
            label='Loan ID or record ID'
            description='The loan whose documents should be approved, for example LN-2026-0042 or the record ID.'
            required=true
        )
        public String loanReference;
    }

    public class Result {
        @InvocableVariable(label='Outcome')
        public String summary;
        @InvocableVariable(label='Number of documents approved')
        public Integer approvedCount;
    }

    @InvocableMethod(
        label='Approve pending loan documents'
        description='Approves all pending documents for a loan by updating approvalStatus from Pending to Approved.'
    )
    public static List<Result> approve(List<Request> requests) {
        List<Result> results = new List<Result>();
        for (Request req : requests) {
            results.add(approveOne(req));
        }
        return results;
    }

    private static Result approveOne(Request req) {
        Result result = new Result();
        result.approvedCount = 0;

        if (req == null || String.isBlank(req.loanReference)) {
            result.summary = 'I need to know which loan to approve documents for.';
            return result;
        }

        LosLoanPackage.Located found = LosLoanPackage.locate(req.loanReference.trim());
        if (found.loan == null) {
            result.summary = 'I could not find a LOS loan matching "' + req.loanReference.trim() + '".';
            return result;
        }
        if (String.isBlank(found.folderId)) {
            result.summary = 'Loan ' + found.loan.Loan_ID__c + ' has no Box folder, so there are no documents to approve.';
            return result;
        }

        try {
            String token = LosBoxAuth.parentToken();
            Set<String> fileIds = LosLoanPackage.documentIdsFor(req.loanReference.trim());

            if (fileIds == null || fileIds.isEmpty()) {
                result.summary = 'No documents found for ' + found.loan.Loan_ID__c + '.';
                return result;
            }

            Integer approvedCount = 0;
            for (String fileId : fileIds) {
                // Get current metadata
                Map<String, Object> meta = getMetadata(token, fileId);
                if (meta != null && 'Pending'.equalsIgnoreCase((String)meta.get('approvalStatus'))) {
                    if (updateApprovalStatus(token, fileId, 'Approved')) {
                        approvedCount++;
                    }
                }
            }

            result.approvedCount = approvedCount;
            result.summary = 'Approved ' + approvedCount + ' document' + (approvedCount == 1 ? '' : 's')
                + ' for ' + found.loan.Loan_ID__c + '.';
            return result;
        } catch (Exception e) {
            System.debug(LoggingLevel.WARN, 'LOS approve documents failed: ' + e.getMessage());
            result.summary = 'Could not approve documents: ' + e.getMessage();
            return result;
        }
    }

    private static Map<String, Object> getMetadata(String token, String fileId) {
        try {
            HttpRequest req = new HttpRequest();
            req.setEndpoint('https://api.box.com/2.0/files/' + fileId + '/metadata/enterprise/losDocument');
            req.setMethod('GET');
            req.setHeader('Authorization', 'Bearer ' + token);
            req.setTimeout(30000);

            HttpResponse res = new Http().send(req);
            if (res.getStatusCode() == 200) {
                return (Map<String, Object>) JSON.deserializeUntyped(res.getBody());
            }
            return null;
        } catch (Exception e) {
            System.debug('Failed to get metadata for file ' + fileId + ': ' + e.getMessage());
            return null;
        }
    }

    private static Boolean updateApprovalStatus(String token, String fileId, String status) {
        try {
            HttpRequest req = new HttpRequest();
            req.setEndpoint('https://api.box.com/2.0/files/' + fileId + '/metadata/enterprise/losDocument');
            req.setMethod('PUT');
            req.setHeader('Authorization', 'Bearer ' + token);
            req.setHeader('Content-Type', 'application/json-patch+json');
            req.setTimeout(30000);

            List<Map<String, Object>> operations = new List<Map<String, Object>>{
                new Map<String, Object>{
                    'op' => 'replace',
                    'path' => '/approvalStatus',
                    'value' => status
                }
            };
            req.setBody(JSON.serialize(operations));

            HttpResponse res = new Http().send(req);
            return res.getStatusCode() == 200;
        } catch (Exception e) {
            System.debug('Failed to update approval status for file ' + fileId + ': ' + e.getMessage());
            return false;
        }
    }
}
