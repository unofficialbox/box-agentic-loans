@IsTest
private class LosWorkspaceSecurityTest {
    private class BoxMock implements HttpCalloutMock {
        public List<String> scopes = new List<String>();
        public HttpResponse respond(HttpRequest req) {
            HttpResponse res = new HttpResponse(); res.setStatusCode(200);
            if (req.getEndpoint().contains('/items')) {
                res.setBody('{"total_count":3,"entries":['
                    + '{"id":"101","name":"Shared.pdf","type":"file","metadata":{"enterprise":{"losDocument":{"versionStatus":"Draft","approvalStatus":"Approved","documentType":"Application","policyRisk":"Critical"}}}},'
                    + '{"id":"102","name":"Internal.pdf","type":"file","metadata":{"enterprise":{"losDocument":{"versionStatus":"Internal"}}}},'
                    + '{"id":"103","name":"Unclassified.pdf","type":"file"}]}');
            } else {
                scopes.add(req.getBody());
                res.setBody('{"access_token":"example-scoped-test-value","expires_in":2400}');
            }
            return res;
        }
    }
    private static LOS_Loan__c loan(Id account) {
        LOS_Loan__c row = new LOS_Loan__c(Name='Security fixture', Borrower_Account__c=account);
        insert row;
        insert new box__FRUP__c(box__Record_ID__c=row.Id, box__Record_ID_Indexed__c=row.Id,
            box__Object_Name__c='LOS_Loan__c', box__Folder_ID__c='123456');
        return row;
    }
    private static void invoke(String endpoint, String recordId, String fileId) {
        RestContext.request = new RestRequest(); RestContext.response = new RestResponse();
        RestContext.request.requestURI='/services/apexrest/los/'+endpoint;
        if (recordId != null) RestContext.request.addParameter('recordId',recordId);
        if (fileId != null) RestContext.request.addParameter('fileId',fileId);
        if (endpoint == 'box-token') LosBoxTokenService.getDownscopedToken();
        else LosBoxFolderService.provisionFolder();
    }
    @IsTest static void guestsCannotMintOrProvision() {
        LosWorkspaceAccess.userTypeOverride='Guest';
        invoke('box-token',null,null); System.assertEquals(401,RestContext.response.statusCode);
        invoke('box-folder',null,null); System.assertEquals(401,RestContext.response.statusCode);
        System.assertEquals(0,Limits.getCallouts());
    }
    @IsTest static void borrowerCannotNameAnotherAccountOrFolder() {
        Account a=new Account(Name='Borrower A'), b=new Account(Name='Borrower B'); insert new List<Account>{a,b};
        LOS_Loan__c own=loan(a.Id), other=loan(b.Id);
        LosWorkspaceAccess.accountOverride=a.Id;
        System.assertNotEquals(null,LosWorkspaceAccess.loan(own.Id));
        System.assertEquals(null,LosWorkspaceAccess.loan(other.Id));
        invoke('box-token',other.Id,null); System.assertEquals(404,RestContext.response.statusCode);
        invoke('box-folder',other.Id,null); System.assertEquals(404,RestContext.response.statusCode);
        invoke('box-token',a.Id,null); System.assertEquals(404,RestContext.response.statusCode);
        System.assertEquals(false,LosWorkspaceAccess.mayNameFolder());
        System.assertEquals(0,Limits.getCallouts());
    }
    @IsTest static void loanSharingIsRequiredForInternalUsers() {
        Profile p=[SELECT Id FROM Profile WHERE Name='Minimum Access - Salesforce' LIMIT 1];
        Schema.User u=new Schema.User(Alias='lossec',Email='los-security@example.invalid',EmailEncodingKey='UTF-8',
            LastName='Security',LanguageLocaleKey='en_US',LocaleSidKey='en_US',TimeZoneSidKey='America/New_York',
            ProfileId=p.Id,Username='los-security-'+System.now().getTime()+'@example.invalid');
        insert u;
        LOS_Loan__c row;
        System.runAs(new Schema.User(Id=UserInfo.getUserId())) { row=loan(null); }
        System.runAs(u) {
            System.assertEquals(null,LosWorkspaceAccess.loan(row.Id));
            invoke('box-token',row.Id,null); System.assertEquals(404,RestContext.response.statusCode);
            invoke('box-folder',row.Id,null); System.assertEquals(404,RestContext.response.statusCode);
            System.assertEquals(0,Limits.getCallouts());
        }
    }
    @IsTest static void borrowerReceivesOnlyVisibleProjectionAndUploadScope() {
        Account a=new Account(Name='Borrower A'); insert a; LOS_Loan__c own=loan(a.Id);
        LosWorkspaceAccess.accountOverride=a.Id;
        insert new LOS_Box_Config__c(SetupOwnerId=UserInfo.getOrganizationId(),Enterprise_Id__c='999');
        BoxMock mock=new BoxMock(); Test.setMock(HttpCalloutMock.class,mock);
        Test.startTest(); invoke('box-token',own.Id,null); Test.stopTest();
        System.assertEquals(200,RestContext.response.statusCode);
        String raw=RestContext.response.responseBody.toString();
        Map<String,Object> result=(Map<String,Object>)JSON.deserializeUntyped(raw);
        System.assertEquals('base_upload',result.get('scope'));
        System.assertEquals(true,result.get('borrower'));
        System.assertEquals(2,((List<Object>)result.get('files')).size());
        System.assert(raw.contains('"approvalStatus":"Approved"'));
        System.assert(!raw.contains('Internal.pdf') && !raw.contains('Critical'));
        System.assert(mock.scopes[mock.scopes.size()-1].contains('scope=base_upload'));
    }
    @IsTest static void previewIsFileScopedAndInternalFilesAreDenied() {
        Account a=new Account(Name='Borrower A'); insert a; LOS_Loan__c own=loan(a.Id);
        LosWorkspaceAccess.accountOverride=a.Id;
        insert new LOS_Box_Config__c(SetupOwnerId=UserInfo.getOrganizationId(),Enterprise_Id__c='999');
        BoxMock mock=new BoxMock(); Test.setMock(HttpCalloutMock.class,mock);
        Test.startTest();
        invoke('box-token',own.Id,'102'); System.assertEquals(403,RestContext.response.statusCode);
        invoke('box-token',own.Id,'999'); System.assertEquals(403,RestContext.response.statusCode);
        invoke('box-token',own.Id,'101'); System.assertEquals(200,RestContext.response.statusCode);
        Test.stopTest();
        String grant=mock.scopes[mock.scopes.size()-1];
        System.assert(grant.contains('scope=base_preview'));
        System.assert(grant.contains(EncodingUtil.urlEncode('https://api.box.com/2.0/files/101','UTF-8')));
    }
    @IsTest static void emptyAllowlistAndMissingCapabilityDenyDirectFolders() {
        insert new LOS_Box_Config__c(SetupOwnerId=UserInfo.getOrganizationId(),Enterprise_Id__c='999');
        invoke('box-token',null,null);
        RestContext.request.addParameter('folderId','123456');
        LosWorkspaceAccess.directFolderOverride=false;
        LosBoxTokenService.getDownscopedToken(); System.assertEquals(403,RestContext.response.statusCode);
        LosWorkspaceAccess.directFolderOverride=true;
        LosBoxTokenService.getDownscopedToken(); System.assertEquals(403,RestContext.response.statusCode);
        System.assertEquals(0,Limits.getCallouts());
    }
    private class PagingMock implements HttpCalloutMock {
        private Integer mode;
        private Integer calls = 0;
        PagingMock(Integer mode) { this.mode=mode; }
        public HttpResponse respond(HttpRequest req) {
            calls++;
            HttpResponse res=new HttpResponse(); res.setStatusCode(mode == 1 ? 503 : 200);
            if (mode == 2) res.setBody('{}');
            else if (mode == 3) res.setBody('{"total_count":1,"entries":[]}');
            else res.setBody('{"total_count":2,"entries":[{"id":"' + calls + '","type":"file","name":"Visible.pdf",'
                + '"metadata":{"enterprise":{"losDocument":{"versionStatus":"Executed"}}}}]}');
            return res;
        }
    }
    @IsTest static void paginationReturnsEveryPermittedFile() {
        PagingMock mock=new PagingMock(0); Test.setMock(HttpCalloutMock.class,mock);
        List<Object> files=LosBorrowerDocuments.listFiles('123','example-token');
        System.assertEquals(2,files.size()); System.assertEquals(2,mock.calls);
        System.assertEquals(true,LosBorrowerDocuments.containsFile(files,'2'));
    }
    @IsTest static void listingErrorsFailClosed() {
        for (Integer mode : new List<Integer>{1,2,3}) {
            Test.setMock(HttpCalloutMock.class,new PagingMock(mode));
            Boolean refused=false;
            try { LosBorrowerDocuments.listFiles('123','example-token'); }
            catch (LosBorrowerDocuments.ListingException expected) { refused=true; }
            System.assert(refused,'A failed or non-advancing listing must not be accepted');
        }
    }


    private class SignedFileMock implements HttpCalloutMock {
        String parent; String version; Integer code;
        SignedFileMock(String parent, String version, Integer code) {this.parent=parent;this.version=version;this.code=code;}
        public HttpResponse respond(HttpRequest req) {
            System.assert(req.getEndpoint().contains('/files/111?'));
            HttpResponse res=new HttpResponse();res.setStatusCode(code);
            res.setBody(JSON.serialize(new Map<String,Object>{'id'=>'111','type'=>'file','name'=>'executed.pdf',
                'path_collection'=>new Map<String,Object>{'entries'=>new List<Object>{new Map<String,Object>{'id'=>parent}}},
                'metadata'=>new Map<String,Object>{'enterprise'=>new Map<String,Object>{'losDocument'=>new Map<String,Object>{
                    'versionStatus'=>version,'policyRisk'=>'Critical'}}}}));return res;
        }
    }
    private static String signingReceipt() {
        return '{"111":{"folderId":"123456","documentType":"Signed Commitment Letter","requestId":"test"}}';
    }
    @IsTest static void signedOutputsUseExactReceiptAndSafeProjection() {
        Test.setMock(HttpCalloutMock.class,new SignedFileMock('123456','Executed',200));
        List<Object> visible=new List<Object>{new Map<String,Object>{'id'=>'111','name'=>'old.pdf'}};
        Test.startTest();LosBorrowerDocuments.addSignedFiles(visible,'123456','example-token',signingReceipt());Test.stopTest();
        System.assertEquals(1,visible.size());System.assert(LosBorrowerDocuments.containsFile(visible,'111'));
        System.assert(JSON.serialize(visible).contains('Signed Commitment Letter'));
        System.assert(!JSON.serialize(visible).contains('policyRisk'));
    }
    @IsTest static void movedSignedFileCannotBePreviewed() {
        Test.setMock(HttpCalloutMock.class,new SignedFileMock('999','Executed',200));
        List<Object> visible=new List<Object>();
        LosBorrowerDocuments.addSignedFiles(visible,'123456','example-token',signingReceipt());
        System.assertEquals(0,visible.size());
    }
    @IsTest static void internalSignedFileCannotBePreviewed() {
        Test.setMock(HttpCalloutMock.class,new SignedFileMock('123456','Internal',200));
        List<Object> visible=new List<Object>();
        LosBorrowerDocuments.addSignedFiles(visible,'123456','example-token',signingReceipt());
        System.assertEquals(0,visible.size());
    }
    @IsTest static void deletedSignedFileIsOmitted() {
        Test.setMock(HttpCalloutMock.class,new SignedFileMock('123456','Executed',404));
        List<Object> visible=new List<Object>();
        LosBorrowerDocuments.addSignedFiles(visible,'123456','example-token',signingReceipt());
        System.assertEquals(0,visible.size());
    }
    @IsTest static void otherLoanReceiptDoesNotGrantAccess() {
        List<Object> visible=new List<Object>();
        LosBorrowerDocuments.addSignedFiles(visible,'999','example-token',signingReceipt());
        System.assertEquals(0,visible.size());
    }
}
