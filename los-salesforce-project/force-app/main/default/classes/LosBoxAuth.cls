/**
 * The Box parent token, in one place.
 *
 * Both the workspace token endpoint and the agent actions need a Client Credentials
 * Grant against the same app; before this class each would have had to carry its own
 * copy of the merge-field body, the subject-type rule and the cache key, and they would
 * have drifted the first time the subject changed.
 *
 * Credentials never appear here. They live in the LOS_Box external credential as Custom
 * authentication parameters and are substituted into the request body by Salesforce at
 * callout time, so this class holds only placeholders.
 *
 * `with sharing` is deliberate even though the custom setting is org-wide: nothing here
 * reads a user's records, and the token it returns carries the app's access, not the
 * caller's. Every caller is responsible for bounding what it does with that.
 */
public with sharing class LosBoxAuth {

    @TestVisible
    private static final String TOKEN_ENDPOINT = 'callout:LOS_Box/oauth2/token';

    /** Reuse the parent token across requests so a call costs one Box round trip, not two. */
    private static final String CACHE_KEY_PREFIX = 'LosBoxParentToken';
    private static final Integer CACHE_SAFETY_MARGIN_SECONDS = 300;

    /**
     * A parent token for the configured subject, or null when Box refuses.
     *
     * A Box user id on LOS_Box_Config__c yields box_subject_type=user and inherits that
     * user's existing access; an enterprise id yields a Service Account token whose root
     * starts empty, so that identity must be collaborated onto the folder.
     */
    public static String parentToken() {
        LOS_Box_Config__c config = LOS_Box_Config__c.getOrgDefaults();
        if (config == null) {
            return null;
        }
        Boolean asUser = String.isNotBlank(config.Box_User_Id__c);
        String subjectType = asUser ? 'user' : 'enterprise';
        String subjectId = asUser ? config.Box_User_Id__c : config.Enterprise_Id__c;
        if (String.isBlank(subjectId)) {
            return null;
        }
        // Key by subject: switching subject type must not serve the previous token.
        String cacheKey = CACHE_KEY_PREFIX + subjectType + subjectId;

        String cached = cacheGet(cacheKey);
        if (String.isNotBlank(cached)) {
            return cached;
        }
        HttpResponse res = post(
            'grant_type=client_credentials'
            // Merge fields are substituted by Salesforce and must not be encoded here.
            + '&client_id={!$Credential.LOS_Box.ClientId}'
            + '&client_secret={!$Credential.LOS_Box.ClientSecret}'
            + '&box_subject_type=' + subjectType
            + '&box_subject_id=' + EncodingUtil.urlEncode(subjectId, 'UTF-8')
        );
        if (res.getStatusCode() != 200) {
            return null;
        }
        Map<String, Object> body = (Map<String, Object>) JSON.deserializeUntyped(res.getBody());
        String token = (String) body.get('access_token');
        Integer expiresIn = body.get('expires_in') == null ? 0 : Integer.valueOf(body.get('expires_in'));
        cachePut(cacheKey, token, expiresIn);
        return token;
    }

    /** Form-encoded POST to the token endpoint, through the named credential. */
    public static HttpResponse post(String body) {
        HttpRequest req = new HttpRequest();
        req.setEndpoint(TOKEN_ENDPOINT);
        req.setMethod('POST');
        req.setHeader('Content-Type', 'application/x-www-form-urlencoded');
        req.setTimeout(20000);
        req.setBody(body);
        return new Http().send(req);
    }

    /** Org cache is optional: without a partition these are no-ops, not failures. */
    private static String cacheGet(String cacheKey) {
        try {
            return (String) Cache.Org.get(cacheKey);
        } catch (Exception e) {
            return null;
        }
    }

    private static void cachePut(String cacheKey, String token, Integer expiresIn) {
        if (String.isBlank(token)) {
            return;
        }
        Integer ttl = expiresIn - CACHE_SAFETY_MARGIN_SECONDS;
        if (ttl < 60) {
            return;
        }
        try {
            Cache.Org.put(cacheKey, token, Math.min(ttl, 28800));
        } catch (Exception e) {
            // No partition allocated; every request simply re-grants.
        }
    }
}
