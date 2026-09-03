@IsTest
private class LosWhoAmITest {

    private static void call() {
        RestRequest request = new RestRequest();
        request.requestURI = '/services/apexrest/los/whoami';
        request.httpMethod = 'GET';
        RestContext.request = request;
        RestContext.response = new RestResponse();
        LosWhoAmI.whoAmI();
    }

    private static Map<String, Object> body() {
        return (Map<String, Object>) JSON.deserializeUntyped(
            RestContext.response.responseBody.toString()
        );
    }

    @IsTest
    static void namesTheSignedInUserAndAnswers200() {
        Test.startTest();
        call();
        Test.stopTest();

        System.assertEquals(200, RestContext.response.statusCode, 'Identity is never a refusal.');
        Map<String, Object> identity = body();
        System.assertEquals(false, identity.get('isGuest'), 'A test runs as a real user.');
        System.assertEquals(UserInfo.getName(), identity.get('name'), 'The name is the running user.');
    }

    @IsTest
    static void publishesOnlyTheThreeFactsTheHeaderNeeds() {
        // Every field here reaches whoever can open the site, so the shape is pinned and a
        // new one has to be added deliberately.
        Test.startTest();
        call();
        Test.stopTest();

        System.assertEquals(
            new Set<String>{ 'isGuest', 'name', 'accountName', 'loginUrl', 'logoutUrl' },
            body().keySet(),
            'The identity projection changed; confirm every field is safe to publish.'
        );
    }

    @IsTest
    static void reportsNoAccountForAnInternalUser() {
        // An internal user has no Contact. That is the honest answer, not a gap: this names
        // the account a borrower's rows are bounded to, and an admin is not bounded.
        Test.startTest();
        call();
        Test.stopTest();

        System.assertEquals(null, body().get('accountName'), 'An internal user has no borrower account.');
    }
}
