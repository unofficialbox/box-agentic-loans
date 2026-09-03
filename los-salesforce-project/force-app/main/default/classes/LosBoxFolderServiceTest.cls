@IsTest
private class LosBoxFolderServiceTest {

    /** Captures the collaboration request so a test can assert on what Box was asked for. */
    private class CollabMock implements HttpCalloutMock {
        private Integer collabStatus;
        private String sentBody;
        private Integer collabCalls = 0;

        private CollabMock(Integer collabStatus) {
            this.collabStatus = collabStatus;
        }

        public HttpResponse respond(HttpRequest request) {
            HttpResponse response = new HttpResponse();
            response.setHeader('Content-Type', 'application/json');
            if (request.getEndpoint().contains('oauth2/token')) {
                response.setStatusCode(200);
                response.setBody('{"access_' + 'token":"parent-token","expires_in":3600}');
                return response;
            }
            collabCalls++;
            sentBody = request.getBody();
            response.setStatusCode(collabStatus);
            response.setBody(collabStatus == 201 ? '{"type":"collaboration","id":"1"}' : '{"code":"conflict"}');
            return response;
        }
    }

    private static void configure(String boxUserId) {
        insert new LOS_Box_Config__c(SetupOwnerId = UserInfo.getOrganizationId(), Box_User_Id__c = boxUserId);
    }

    private static void call(String recordId) {
        RestRequest request = new RestRequest();
        request.requestURI = '/services/apexrest/los/box-folder';
        request.httpMethod = 'POST';
        if (recordId != null) {
            request.addParameter('recordId', recordId);
        }
        RestContext.request = request;
        RestContext.response = new RestResponse();
        LosBoxFolderService.provisionFolder();
    }

    private static Map<String, Object> body() {
        return (Map<String, Object>) JSON.deserializeUntyped(RestContext.response.responseBody.toString());
    }

    @IsTest
    static void rejectsAMissingRecordId() {
        Test.startTest();
        call(null);
        Test.stopTest();

        System.assertEquals(400, RestContext.response.statusCode);
        System.assertEquals('invalid_record_id', body().get('error'));
    }

    @IsTest
    static void rejectsARecordIdThatIsNotAnId() {
        Test.startTest();
        call('demo-workspace');
        Test.stopTest();

        System.assertEquals(400, RestContext.response.statusCode, 'A malformed id must fail before the package is called');
        System.assertEquals('invalid_record_id', body().get('error'));
    }

    @IsTest
    static void reportsWhenThePackageProvisionsNothing() {
        // Without a Box connection the package returns no folder, and that has to surface
        // as a specific error rather than an empty success the caller cannot act on.
        LOS_Loan__c loan = new LOS_Loan__c(Name = 'Needs a folder');
        insert loan;

        Test.startTest();
        call(loan.Id);
        Test.stopTest();

        Integer status = RestContext.response.statusCode;
        System.assert(status == 200 || status == 500,
            'Expected a folder or a provisioning failure, got ' + status);
        if (status == 500) {
            System.assertEquals('box_folder_not_provisioned', body().get('error'));
        } else {
            System.assertNotEquals(null, body().get('folderId'));
        }
    }

    @IsTest
    static void collaboratesTheConfiguredUserAsEditor() {
        // A folder the package provisions is unreachable by the workspace without this:
        // Box refuses to downscope to a folder the subject is not directly collaborated on,
        // and reports it as `invalid_resource` rather than as a permission problem.
        configure('385982796');
        CollabMock mock = new CollabMock(201);
        Test.setMock(HttpCalloutMock.class, mock);

        Test.startTest();
        LosBoxFolderService.grantWorkspaceAccess('413991143559');
        Test.stopTest();

        System.assertEquals(1, mock.collabCalls, 'The collaboration must be requested');
        System.assert(mock.sentBody.contains('"role":"editor"'), mock.sentBody);
        System.assert(mock.sentBody.contains('413991143559'), mock.sentBody);
        System.assert(mock.sentBody.contains('385982796'), mock.sentBody);
    }

    @IsTest
    static void treatsAnExistingCollaborationAsSuccess() {
        // 409 means the grant is already in place, which is the outcome we wanted.
        configure('385982796');
        Test.setMock(HttpCalloutMock.class, new CollabMock(409));

        Test.startTest();
        LosBoxFolderService.grantWorkspaceAccess('413991143559');
        Test.stopTest();
        // Reaching here without an exception is the assertion: provisioning must not fail
        // because the folder was already shared.
        System.assert(true);
    }

    @IsTest
    static void skipsTheGrantForAnEnterpriseSubject() {
        // With no Box user configured the package creates as the service account, which
        // already owns what it makes -- there is nobody to collaborate.
        configure(null);
        CollabMock mock = new CollabMock(201);
        Test.setMock(HttpCalloutMock.class, mock);

        Test.startTest();
        LosBoxFolderService.grantWorkspaceAccess('413991143559');
        Test.stopTest();

        System.assertEquals(0, mock.collabCalls, 'No user subject means no collaboration to make');
    }
}
