/**
 * The Box parent token is the credential path every other governed action depends on, and
 * it had no test at all -- 0 of 47 lines covered, which is fine in a scratch org and blocks
 * any packaging or production deploy.
 *
 * What is worth pinning here is not that a mocked callout returns a mocked token. It is the
 * shape of the request body, because two details of it are load-bearing and both fail
 * silently when wrong: the credential merge fields must reach Salesforce unencoded or the
 * substitution does not happen, and the subject id must be encoded or a value with a
 * reserved character corrupts the form. A regression in either produces a 400 from Box and
 * a null token, which every caller reports as "no Box access" without naming the cause.
 */
@IsTest
private class LosBoxAuthTest {

    /** Captures the outgoing request so the body can be asserted, and answers as Box would. */
    private class TokenMock implements HttpCalloutMock {
        private final Integer status;
        private final String payload;
        private String seenBody;
        private String seenEndpoint;
        private Integer calls = 0;

        private TokenMock(Integer status, String payload) {
            this.status = status;
            this.payload = payload;
        }

        public HttpResponse respond(HttpRequest request) {
            this.calls++;
            this.seenBody = request.getBody();
            this.seenEndpoint = request.getEndpoint();
            HttpResponse response = new HttpResponse();
            response.setStatusCode(this.status);
            response.setBody(this.payload);
            return response;
        }
    }

    private static TokenMock granting() {
        return new TokenMock(200, '{"access_token":"example-parent-token","expires_in":3600}');
    }

    private static void configure(String boxUserId, String enterpriseId) {
        insert new LOS_Box_Config__c(
            SetupOwnerId = UserInfo.getOrganizationId(),
            Box_User_Id__c = boxUserId,
            Enterprise_Id__c = enterpriseId
        );
    }

    @IsTest
    static void refusesWithNoSubjectConfigured() {
        // No custom setting row: test context starts without one, which is also the state of
        // an org where nobody has run the configuration script yet.
        Test.startTest();
        String token = LosBoxAuth.parentToken();
        Test.stopTest();

        System.assertEquals(null, token, 'With no subject there is nothing to grant against.');
    }

    @IsTest
    static void refusesWhenBothSubjectFieldsAreBlank() {
        configure(null, null);

        Test.startTest();
        String token = LosBoxAuth.parentToken();
        Test.stopTest();

        System.assertEquals(null, token, 'A row with no subject is the same as no row.');
    }

    @IsTest
    static void grantsAsTheConfiguredBoxUser() {
        // A Box user id yields box_subject_type=user, which inherits that user's existing
        // access. This is the mode the demo runs in.
        configure('demo user', null);
        TokenMock mock = granting();
        Test.setMock(HttpCalloutMock.class, mock);

        Test.startTest();
        String token = LosBoxAuth.parentToken();
        Test.stopTest();

        System.assertEquals('example-parent-token', token, 'The grant returns Box\'s token.');
        System.assert(mock.seenBody.contains('box_subject_type=user'), 'A user id means a user subject.');
        System.assert(
            mock.seenBody.contains('grant_type=client_credentials'),
            'Client Credentials Grant is the demo default; no per-user consent screen.'
        );
        System.assertEquals('callout:LOS_Box/oauth2/token', mock.seenEndpoint, 'The named credential carries the secret.');
    }

    @IsTest
    static void fallsBackToTheEnterpriseSubject() {
        // An enterprise id yields a Service Account token whose root starts empty, so that
        // identity has to be collaborated onto a folder before it can read anything.
        configure(null, 'demo enterprise');
        TokenMock mock = granting();
        Test.setMock(HttpCalloutMock.class, mock);

        Test.startTest();
        LosBoxAuth.parentToken();
        Test.stopTest();

        System.assert(mock.seenBody.contains('box_subject_type=enterprise'), 'No user id means an enterprise subject.');
    }

    @IsTest
    static void leavesCredentialMergeFieldsUnencodedAndEncodesTheSubject() {
        // Salesforce substitutes the merge fields at callout time, so they must arrive
        // literally; encoding them sends the placeholder to Box as the client id. The
        // subject is ours to encode, and a space proves it is being encoded rather than
        // passed through.
        configure('demo user', null);
        TokenMock mock = granting();
        Test.setMock(HttpCalloutMock.class, mock);

        Test.startTest();
        LosBoxAuth.parentToken();
        Test.stopTest();

        System.assert(
            mock.seenBody.contains('client_id={!$Credential.LOS_Box.ClientId}'),
            'An encoded merge field is never substituted, and Box sees the placeholder.'
        );
        System.assert(
            mock.seenBody.contains('client_secret={!$Credential.LOS_Box.ClientSecret}'),
            'The secret is substituted by the platform and never appears in Apex.'
        );
        System.assert(
            mock.seenBody.contains('box_subject_id=demo+user'),
            'The subject is form-encoded, so a reserved character cannot corrupt the body.'
        );
    }

    @IsTest
    static void returnsNullWhenBoxRefuses() {
        // A refusal has to be null rather than an exception: every caller treats null as
        // "no Box access" and reports it, and a throw here would take the request with it.
        configure('demo user', null);
        Test.setMock(HttpCalloutMock.class, new TokenMock(400, '{"error":"invalid_client"}'));

        Test.startTest();
        String token = LosBoxAuth.parentToken();
        Test.stopTest();

        System.assertEquals(null, token, 'Box refused, so there is no token to hand back.');
    }

    @IsTest
    static void postSendsFormEncodedToTheNamedCredential() {
        TokenMock mock = granting();
        Test.setMock(HttpCalloutMock.class, mock);

        Test.startTest();
        HttpResponse response = LosBoxAuth.post('grant_type=client_credentials');
        Test.stopTest();

        System.assertEquals(200, response.getStatusCode(), 'The mock answered.');
        System.assertEquals(1, mock.calls, 'One request, not a retry loop.');
    }
}
