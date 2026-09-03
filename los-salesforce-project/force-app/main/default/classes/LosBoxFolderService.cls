/**
 * Provision a Box workspace folder for a LOS record.
 *
 * Separate from LosBoxTokenService because the two cannot share a transaction.
 * `createFolderForRecordId` writes the record-to-folder association, and Apex refuses a
 * callout once a transaction has done DML -- "You have uncommitted work pending" -- so
 * provisioning and minting a folder-scoped token have to be two requests. The client
 * calls this only when the token endpoint reports no_box_folder_mapping, so the common
 * case stays a single round trip.
 *
 * The package decides where the folder goes and what it is called; this class only asks
 * for it. `optCreateRootFolder` is true so the object's root folder is provisioned on the
 * first loan rather than failing.
 *
 * It then collaborates the configured Box user onto the new folder, because a folder the
 * package provisions is otherwise unreachable by the workspace. See `grantWorkspaceAccess`.
 *
 * POST rather than GET: this creates something.
 */
@RestResource(urlMapping='/los/box-folder/*')
global with sharing class LosBoxFolderService {

    global class FolderResponse {
        global String folderId;
        global String recordId;
    }

    @HttpPost
    global static void provisionFolder() {
        RestRequest request = RestContext.request;
        RestResponse response = RestContext.response;
        response.addHeader('Content-Type', 'application/json');
        response.addHeader('Cache-Control', 'no-store');

        String recordParam = request.params.get('recordId');
        Id recordId;
        try {
            recordId = Id.valueOf(recordParam);
        } catch (Exception e) {
            fail(response, 400, 'invalid_record_id', 'recordId is required and must be a Salesforce id.');
            return;
        }

        String folderId = new Provisioner().forRecord(recordId);
        if (String.isBlank(folderId)) {
            fail(response, 500, 'box_folder_not_provisioned',
                'The Box for Salesforce package did not return a folder for that record.');
            return;
        }

        FolderResponse payload = new FolderResponse();
        payload.folderId = folderId;
        payload.recordId = recordId;
        response.statusCode = 200;
        response.responseBody = Blob.valueOf(JSON.serialize(payload));
    }

    /**
     * `without sharing` for the same reason as the token endpoint: the Experience Cloud
     * guest user sees no association records under normal sharing, and this returns a
     * folder id rather than granting any record access.
     */
    private without sharing class Provisioner {
        private String forRecord(Id recordId) {
            box.Toolkit toolkit = new box.Toolkit();
            try {
                // Returns the existing folder when the record already has one, so this is
                // safe to call twice and two racing callers converge on one folder.
                String folderId = toolkit.createFolderForRecordId(recordId, null, true);
                if (String.isBlank(folderId)) {
                    System.debug(LoggingLevel.WARN,
                        'LOS Box: could not provision a folder for ' + recordId + ': ' + toolkit.mostRecentError);
                    return folderId;
                }
                // Before the finally block commits: the Toolkit has only staged the
                // association so far, so a callout is still legal here and will not be
                // once commitChanges has run.
                grantWorkspaceAccess(folderId);
                return folderId;
            } catch (Exception e) {
                System.debug(LoggingLevel.WARN, 'LOS Box: provisioning threw: ' + e.getMessage());
                return null;
            } finally {
                // Mandatory after any folder operation, or the association is left out of
                // sync. Guarded so a commit failure cannot replace the result.
                try {
                    toolkit.commitChanges();
                } catch (Exception commitError) {
                    System.debug(LoggingLevel.WARN, 'LOS Box: commitChanges failed: ' + commitError.getMessage());
                }
            }
        }
    }

    /**
     * Collaborate the configured Box user onto a folder the package just created.
     *
     * Without this the workspace cannot open the loan file at all. Box refuses to downscope
     * a token to a folder the subject is not *directly* collaborated on -- inherited access
     * through a parent is not enough -- and the refusal is well disguised: the folder reads
     * back over the API with `permissions.can_upload = true`, and the token exchange still
     * answers `invalid_resource`. Nothing in that error points at collaborations.
     *
     * So every folder the package provisions needs this grant, or its loan silently falls
     * back to synthetic fixtures. The CLM predecessor's demo workspace only ever worked
     * because someone made the same grant by hand.
     *
     * Failure is logged, not raised: the folder exists and the association is real either
     * way, and the token endpoint reports the downscope problem in its own terms. A 409
     * means the collaboration is already there, which is success for our purposes.
     */
    @TestVisible
    private static void grantWorkspaceAccess(String folderId) {
        LOS_Box_Config__c config = LOS_Box_Config__c.getOrgDefaults();
        String boxUserId = config == null ? null : config.Box_User_Id__c;
        if (String.isBlank(boxUserId)) {
            // An enterprise subject is the service account the package already creates as.
            return;
        }
        String token = LosBoxAuth.parentToken();
        if (String.isBlank(token)) {
            System.debug(LoggingLevel.WARN, 'LOS Box: no token to collaborate ' + folderId);
            return;
        }
        try {
            HttpRequest req = new HttpRequest();
            req.setEndpoint('callout:LOS_Box/2.0/collaborations');
            req.setMethod('POST');
            req.setHeader('Authorization', 'Bearer ' + token);
            req.setHeader('Content-Type', 'application/json');
            req.setTimeout(30000);
            req.setBody(JSON.serialize(new Map<String, Object>{
                'item' => new Map<String, Object>{ 'id' => folderId, 'type' => 'folder' },
                'accessible_by' => new Map<String, Object>{ 'id' => boxUserId, 'type' => 'user' },
                'role' => 'editor'
            }));
            HttpResponse res = new Http().send(req);
            Integer status = res.getStatusCode();
            if (status != 201 && status != 409) {
                System.debug(LoggingLevel.WARN, 'LOS Box: collaboration on ' + folderId
                    + ' returned ' + status + ' ' + res.getBody());
            }
        } catch (Exception e) {
            System.debug(LoggingLevel.WARN, 'LOS Box: collaboration threw: ' + e.getMessage());
        }
    }

    private static void fail(RestResponse response, Integer status, String error, String detail) {
        response.statusCode = status;
        response.responseBody = Blob.valueOf(JSON.serialize(
            new Map<String, String>{ 'error' => error, 'detail' => detail }));
    }
}
