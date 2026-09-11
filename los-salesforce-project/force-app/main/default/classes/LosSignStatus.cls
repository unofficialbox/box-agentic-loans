/** Reconcile a loan's current signing request against Box, never browser messages. */
@RestResource(urlMapping='/los/sign-status/*')
global with sharing class LosSignStatus {
    @HttpPost
    global static void reconcile() {
        RestContext.response.addHeader('Content-Type', 'application/json');
        RestContext.response.addHeader('Cache-Control', 'no-store');
        if (LosWorkspaceAccess.isGuest()) { reply(401, 'unauthorized'); return; }
        Id recordId;
        try { recordId = Id.valueOf(RestContext.request.params.get('recordId')); }
        catch (Exception e) { reply(400, 'invalid_record'); return; }
        if (LosWorkspaceAccess.loan(recordId) == null) { reply(404, 'not_found'); return; }
        LOS_Loan__c loan = [SELECT Sign_Embed_URL__c, Sign_Request_ID__c, Signing_Receipt__c FROM LOS_Loan__c WHERE Id = :recordId];
        String embed = loan.Sign_Embed_URL__c;
        if (String.isBlank(embed) && String.isBlank(loan.Sign_Request_ID__c)) { reply(200, 'none'); return; }
        Matcher match = Pattern.compile('^https://[A-Za-z0-9.-]+\\.box\\.com/embed/sign/document/([A-Za-z0-9-]+)/').matcher(embed == null ? '' : embed);
        String requestId = loan.Sign_Request_ID__c;
        if (String.isBlank(requestId)) {
            if (!match.find()) { reply(503, 'invalid_request'); return; }
            requestId = match.group(1);
        }
        if (!Pattern.matches('[A-Za-z0-9-]+',requestId)) { reply(503, 'invalid_request'); return; }
        if (String.isBlank(embed) && String.isNotBlank(loan.Signing_Receipt__c)) {
            Map<String,Object> saved = (Map<String,Object>)JSON.deserializeUntyped(loan.Signing_Receipt__c);
            for (Object artifact : saved.values()) {
                if (((Map<String,Object>)artifact).get('requestId') == requestId) { reply(200, 'signed'); return; }
            }
        }
        try {
            HttpRequest req = new HttpRequest();
            req.setEndpoint('callout:LOS_Box/2.0/sign_requests/' + requestId);
            req.setMethod('GET');
            String token = LosBoxAuth.parentToken();
            req.setHeader('Authorization', 'Bearer ' + token);
            HttpResponse res = new Http().send(req);
            if (res.getStatusCode() != 200) { reply(503, 'unavailable'); return; }
            Map<String,Object> payload = (Map<String,Object>)JSON.deserializeUntyped(res.getBody());
            String status = (String)payload.get('status');
            if (String.isBlank(status)) { reply(503, 'unavailable'); return; }
            Map<String,Object> artifacts = new Map<String,Object>();
            if (status == 'signed') {
                String folderId = LosBoxTokenService.mappedFolder(recordId);
                Map<String,Object> parent = (Map<String,Object>)payload.get('parent_folder');
                if (String.isBlank(folderId) || parent == null || parent.get('id') != folderId) {
                    reply(503, 'folder_mismatch'); return;
                }
                Map<String,Object> signedFiles = (Map<String,Object>)payload.get('sign_files');
                Map<String,Object> log = (Map<String,Object>)payload.get('signing_log');
                List<Object> files = signedFiles == null ? null : (List<Object>)signedFiles.get('files');
                if (signedFiles == null || signedFiles.get('is_ready_for_download') != true
                    || files == null || files.isEmpty() || log == null || log.get('id') == null) {
                    reply(200, 'finalizing'); return;
                }
                for (Object entry : files) {
                    Map<String,Object> file = (Map<String,Object>)entry;
                    String fileId = (String)file.get('id');
                    if (String.isBlank(fileId) || !fileId.isNumeric()) { reply(503, 'invalid_files'); return; }
                    artifacts.put(fileId, new Map<String,Object>{'documentType'=>'Signed Commitment Letter',
                        'folderId'=>folderId, 'requestId'=>requestId});
                }
                String logId = (String)log.get('id');
                if (!logId.isNumeric()) { reply(503, 'invalid_files'); return; }
                artifacts.put(logId, new Map<String,Object>{'documentType'=>'Signing Log',
                    'folderId'=>folderId, 'requestId'=>requestId});
            }
            if (status == 'signed') LosBorrowerDocuments.publishSignedFiles(artifacts, LosBoxTokenService.mappedFolder(recordId), token);
            if (status == 'signed' || status == 'declined' || status == 'cancelled' || status == 'expired') {
                // Re-read under lock after the callout: never clear a replacement request.
                LOS_Loan__c current = [SELECT Sign_Embed_URL__c, Sign_Request_ID__c, Status__c, Signing_Receipt__c FROM LOS_Loan__c WHERE Id = :recordId FOR UPDATE];
                if (current.Sign_Embed_URL__c == embed && current.Sign_Request_ID__c == loan.Sign_Request_ID__c) {
                    if (status == 'signed') {
                        current.Sign_Request_ID__c = requestId;
                        Map<String,Object> saved = String.isBlank(current.Signing_Receipt__c)
                            ? new Map<String,Object>() : (Map<String,Object>)JSON.deserializeUntyped(current.Signing_Receipt__c);
                        saved.putAll(artifacts);
                        current.Signing_Receipt__c = JSON.serialize(saved);
                        // Never regress a loan that has already entered servicing.
                        if (current.Status__c != 'Servicing') current.Status__c = 'Closed';
                    }
                    if (status != 'signed') current.Sign_Request_ID__c = null;
                    current.Sign_Embed_URL__c = null;
                    // Borrowers cannot edit loans. Only this verified current request may
                    // persist its receipt, close the loan and clear the link.
                    Database.update(current, AccessLevel.SYSTEM_MODE);
                } else { reply(200, 'replaced'); return; }
            }
            reply(200, status);
        } catch (Exception e) { reply(503, 'unavailable'); }
    }
    private static void reply(Integer code, String status) {
        RestContext.response.statusCode = code;
        RestContext.response.responseBody = Blob.valueOf(JSON.serialize(new Map<String,Object>{'status'=>status}));
    }
}
