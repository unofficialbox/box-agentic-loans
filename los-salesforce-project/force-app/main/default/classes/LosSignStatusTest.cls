@IsTest
private class LosSignStatusTest {
    private static final String EMBED = 'https://app.box.com/embed/sign/document/request-one/signer/';
    @TestSetup static void seed() {
        Account account = new Account(Name='Signing borrower'); insert account;
        LOS_Loan__c l=new LOS_Loan__c(Name='Signing test', Status__c='Approved', Borrower_Account__c=account.Id, Sign_Embed_URL__c=EMBED); insert l;
        insert new box__FRUP__c(box__Record_ID__c=l.Id, box__Record_ID_Indexed__c=l.Id,
            box__Object_Name__c='LOS_Loan__c', box__Folder_ID__c='123456');
    }
    private class BoxMock implements HttpCalloutMock {
        String status; Integer code;
        BoxMock(String status, Integer code) { this.status=status; this.code=code; }
        public HttpResponse respond(HttpRequest req) {
            if (req.getEndpoint().contains('/files/')) {
                HttpResponse artifact = new HttpResponse();
                if (req.getMethod() == 'GET') {
                    String fileId = req.getEndpoint().contains('/111?') ? '111' : '222';
                    artifact.setStatusCode(200);artifact.setBody('{"id":"'+fileId+'","path_collection":{"entries":[{"id":"123456"}]}}');
                } else if (req.getMethod() == 'POST') { artifact.setStatusCode(409);artifact.setBody('{}'); }
                else {System.assert(req.getBody().contains('Executed'));artifact.setStatusCode(200);artifact.setBody('{}');}
                return artifact;
            }
            System.assertEquals('callout:LOS_Box/2.0/sign_requests/request-one',req.getEndpoint());
            HttpResponse res=new HttpResponse();res.setStatusCode(code);res.setBody(JSON.serialize(new Map<String,Object>{'status'=>status,
                'parent_folder'=>new Map<String,Object>{'id'=>'123456'},
                'sign_files'=>new Map<String,Object>{'is_ready_for_download'=>true,'files'=>new List<Object>{new Map<String,Object>{'id'=>'111'}}},
                'signing_log'=>new Map<String,Object>{'id'=>'222'}}));return res;
        }
    }
    private static LOS_Loan__c loan() { return [SELECT Id,Sign_Embed_URL__c,Sign_Request_ID__c,Status__c,Signing_Receipt__c FROM LOS_Loan__c LIMIT 1]; }
    private static void run(String recordId, String status, Integer code) {
        RestContext.request=new RestRequest();RestContext.request.addParameter('recordId',recordId);
        RestContext.response=new RestResponse();Test.setMock(HttpCalloutMock.class,new BoxMock(status,code));
        Test.startTest();LosSignStatus.reconcile();Test.stopTest();
    }
    @IsTest static void signedClearsOnlyEmbedAndReturnsStatus() {
        run(loan().Id,'signed',200);System.assertEquals(200,RestContext.response.statusCode);System.assertEquals(null,loan().Sign_Embed_URL__c);
        System.assert(RestContext.response.responseBody.toString().contains('signed'));
        System.assertEquals('Closed',loan().Status__c);
        System.assert(loan().Signing_Receipt__c.contains('Signed Commitment Letter'));
        System.assert(loan().Signing_Receipt__c.contains('Signing Log'));
    }
    @IsTest static void servicingDoesNotRegress() {
        LOS_Loan__c l=loan();l.Status__c='Servicing';update l;
        run(l.Id,'signed',200);System.assertEquals('Servicing',loan().Status__c);
    }
    private class IncompleteMock implements HttpCalloutMock {
        public HttpResponse respond(HttpRequest req) {
            HttpResponse res=new HttpResponse();res.setStatusCode(200);
            res.setBody('{"status":"signed","parent_folder":{"id":"123456"},"sign_files":{"is_ready_for_download":false,"files":[]}}');return res;
        }
    }
    @IsTest static void waitsForFinalArtifacts() {
        RestContext.request=new RestRequest();RestContext.request.addParameter('recordId',loan().Id);
        RestContext.response=new RestResponse();Test.setMock(HttpCalloutMock.class,new IncompleteMock());
        Test.startTest();LosSignStatus.reconcile();Test.stopTest();
        System.assertEquals('Approved',loan().Status__c);System.assertEquals(EMBED,loan().Sign_Embed_URL__c);
        System.assert(RestContext.response.responseBody.toString().contains('finalizing'));
    }
    @IsTest static void pendingKeepsEmbed() { run(loan().Id,'viewed',200);System.assertEquals(EMBED,loan().Sign_Embed_URL__c); }
    @IsTest static void declinedClearsEmbed() { run(loan().Id,'declined',200);System.assertEquals(null,loan().Sign_Embed_URL__c);System.assertEquals('Approved',loan().Status__c);System.assertEquals(null,loan().Signing_Receipt__c); }
    @IsTest static void failureDoesNotClearEmbed() { run(loan().Id,'signed',503);System.assertEquals(503,RestContext.response.statusCode);System.assertEquals(EMBED,loan().Sign_Embed_URL__c); }
    @IsTest static void guestDenied() { LosWorkspaceAccess.userTypeOverride='Guest';run(loan().Id,'signed',200);System.assertEquals(401,RestContext.response.statusCode);System.assertEquals(EMBED,loan().Sign_Embed_URL__c); }
    @IsTest static void otherBorrowerDenied() { Account other=new Account(Name='Other');insert other;LosWorkspaceAccess.accountOverride=other.Id;run(loan().Id,'signed',200);System.assertEquals(404,RestContext.response.statusCode); }
    @IsTest static void invalidRecordDenied() { run('bad','signed',200);System.assertEquals(400,RestContext.response.statusCode); }
    @IsTest static void noRequestAvoidsCallout() { LOS_Loan__c l=loan();l.Sign_Embed_URL__c=null;update l;run(l.Id,'signed',200);System.assertEquals(200,RestContext.response.statusCode);System.assert(RestContext.response.responseBody.toString().contains('none')); }
    @IsTest static void invalidUrlAvoidsCallout() { LOS_Loan__c l=loan();l.Sign_Embed_URL__c='https://example.com/request';update l;run(l.Id,'signed',200);System.assertEquals(503,RestContext.response.statusCode); }

    @IsTest static void retainedRequestCanRecoverWithoutAnEmbed() {
        LOS_Loan__c l=loan();l.Sign_Embed_URL__c=null;l.Sign_Request_ID__c='request-one';update l;
        run(l.Id,'signed',200);
        System.assertEquals('Closed',loan().Status__c);
        System.assertEquals('request-one',loan().Sign_Request_ID__c);
    }
    @IsTest static void completedReceiptMakesReconciliationIdempotent() {
        LOS_Loan__c l=loan();l.Sign_Embed_URL__c=null;l.Sign_Request_ID__c='request-one';l.Status__c='Closed';
        l.Signing_Receipt__c='{"111":{"requestId":"request-one","folderId":"123456","documentType":"Signed Commitment Letter"}}';update l;
        // A 503 mock would fail a redundant provider call.
        run(l.Id,'signed',503);
        System.assertEquals(200,RestContext.response.statusCode);
        System.assertEquals('Closed',loan().Status__c);
    }

    private class FailedPublicationMock implements HttpCalloutMock {
        public HttpResponse respond(HttpRequest req) {
            if (req.getMethod() != 'GET') {
                HttpResponse res=new HttpResponse();res.setStatusCode(503);res.setBody('{}');return res;
            }
            return new BoxMock('signed',200).respond(req);
        }
    }
    @IsTest static void publicationFailurePreservesRequestAndLoan() {
        RestContext.request=new RestRequest();RestContext.request.addParameter('recordId',loan().Id);
        RestContext.response=new RestResponse();Test.setMock(HttpCalloutMock.class,new FailedPublicationMock());
        Test.startTest();LosSignStatus.reconcile();Test.stopTest();
        System.assertEquals(503,RestContext.response.statusCode);
        System.assertEquals('Approved',loan().Status__c);
        System.assertEquals(EMBED,loan().Sign_Embed_URL__c);
        System.assertEquals(null,loan().Signing_Receipt__c);
    }
}
