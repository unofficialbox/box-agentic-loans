/**
 * Asks Box AI about one file, using the app's own credentials.
 *
 * The managed package ships `box__BoxAIAskByItemId`, and it is the obvious choice until
 * you run it as an agent: it authenticates as the *Salesforce user*, and an Agentforce
 * agent runs as its own user, which has never linked a Box account. The call comes back
 * 401 Unauthorized, and the conversation reports an authorization problem the person
 * cannot act on -- there is no Box login for them to fix.
 *
 * This takes the same route the rest of the workspace already takes: a Client Credentials
 * Grant for the configured Box subject, through the LOS_Box named credential. No per-user
 * Box linkage, and the same identity that lists the folder reads the file, so a document
 * the workspace can show is a document the agent can quote.
 */
public with sharing class LosBoxAskDocument {

    private static final String ASK_ENDPOINT = 'callout:LOS_Box/2.0/ai/ask';

    public class Request {
        @InvocableVariable(
            label='Loan ID'
            description='The loan whose document is being read, for example LN-2026-0042. A document is only readable in the context of the loan it belongs to, so this is effectively required -- but it is not declared required, deliberately. A required invocable variable that arrives empty is rejected by the platform with REQUIRED_FIELD_MISSING and a 500 before this class runs, which tells the caller nothing it can act on. Left optional, the refusal below names what is missing and the agent can call again with it.'
        )
        public String loanReference;
        @InvocableVariable(
            label='Box item ID'
            description='The Box file ID to ask about, taken from that loan\'s package listing. Ignored when itemType is hub, because the credit policy library is configuration rather than a caller argument.'
        )
        public String itemId;
        @InvocableVariable(
            label='Box item type'
            description='"file" for one document, or "hub" to ask across a Box Hub such as the credit policy library. Defaults to file.'
        )
        public String itemType;
        @InvocableVariable(
            label='Prompt'
            description='The question to ask about that file.'
            required=true
        )
        public String prompt;
    }

    public class Result {
        @InvocableVariable(label='Answer')
        public String answer;
        @InvocableVariable(label='Whether Box AI answered')
        public Boolean answered;
    }

    @InvocableMethod(
        label='Ask Box AI about a LOS loan document'
        description='Asks Box AI a question about one loan document, identified by its Box file ID. The answer is grounded in that file.'
    )
    public static List<Result> ask(List<Request> requests) {
        List<Result> results = new List<Result>();
        for (Request req : requests) {
            results.add(askOne(req));
        }
        return results;
    }

    /** What this request is allowed to read, or why it is not. */
    private class Scope {
        private String itemId;
        private String itemType;
        private String refusal;
    }

    /**
     * Bounds a request to the loan it names.
     *
     * Two different reads, two different bounds. A document must belong to the folder of
     * the loan the caller named: without that check the action will read any Box file ID
     * handed to it, which is a far wider reach than "ask about this loan" implies, and an
     * MCP client is exactly the kind of caller that would stumble into it. The credit
     * policy library is the other case -- it is bank policy rather than loan content, so
     * its Hub comes from configuration and the caller does not get to name which policy
     * library to consult.
     */
    private static Scope resolveScope(Request req) {
        Scope scope = new Scope();
        scope.itemType = itemType(req.itemType);

        if (scope.itemType == 'hubs') {
            LOS_Box_Config__c config = LOS_Box_Config__c.getOrgDefaults();
            String hubId = config == null ? null : config.Credit_Policy_Hub_Id__c;
            if (String.isBlank(hubId)) {
                scope.refusal = 'No approved credit policy library is configured, so there is no policy to read.';
                return scope;
            }
            scope.itemId = hubId;
            return scope;
        }

        if (String.isBlank(req.itemId)) {
            scope.refusal = 'I need a Box file ID from the loan package before I can read a document.';
            return scope;
        }
        if (String.isBlank(req.loanReference)) {
            scope.refusal = 'I need to know which loan that document belongs to before I can read it.';
            return scope;
        }

        Set<String> allowed = LosLoanPackage.documentIdsFor(req.loanReference);
        if (allowed == null) {
            scope.refusal = 'I could not resolve the documents for "' + req.loanReference.trim()
                + '", so I cannot confirm that file belongs to it.';
            return scope;
        }
        String requested = req.itemId.trim();
        if (!allowed.contains(requested)) {
            scope.refusal = 'That file is not in the Box folder for ' + req.loanReference.trim()
                + '. Read it through the loan package it does belong to.';
            return scope;
        }
        scope.itemId = requested;
        return scope;
    }

    /**
     * The Box item type, defaulting to a single document.
     *
     * A Hub is how the credit policy library is asked about: one id standing for a
     * governed set of policies, with Box AI citing the individual files it drew from.
     *
     * Box spells it `hubs`, plural, in `items[].type` -- the singular is rejected by the
     * enum with a 400, which is an easy hour to lose because the message names the schema
     * path rather than the accepted values. The singular is normalized here so a caller
     * who writes the obvious thing gets the working request.
     */
    private static String itemType(String requested) {
        String normalized = String.isBlank(requested) ? 'file' : requested.trim().toLowerCase();
        return normalized == 'hub' ? 'hubs' : normalized;
    }

    private static Result askOne(Request req) {
        Result result = new Result();
        result.answered = false;

        if (req == null || String.isBlank(req.prompt)) {
            result.answer = 'I need a question before I can read anything.';
            return result;
        }

        Scope scope = resolveScope(req);
        if (scope.refusal != null) {
            result.answer = scope.refusal;
            return result;
        }

        String token = LosBoxAuth.parentToken();
        if (String.isBlank(token)) {
            result.answer = 'Box did not issue a token, so I could not read the document. This is a configuration problem, not something to retry.';
            return result;
        }

        Map<String, Object> item = new Map<String, Object>{
            'id' => scope.itemId,
            'type' => scope.itemType
        };
        String body = JSON.serialize(new Map<String, Object>{
            'mode' => 'single_item_qa',
            'prompt' => req.prompt,
            'items' => new List<Object>{ item }
        });

        HttpRequest boxRequest = new HttpRequest();
        boxRequest.setEndpoint(ASK_ENDPOINT);
        boxRequest.setMethod('POST');
        boxRequest.setHeader('Authorization', 'Bearer ' + token);
        boxRequest.setHeader('Content-Type', 'application/json');
        // Box AI reads the document before answering, which is slower than a metadata call.
        boxRequest.setTimeout(120000);
        boxRequest.setBody(body);

        HttpResponse response;
        try {
            response = new Http().send(boxRequest);
        } catch (Exception e) {
            System.debug(LoggingLevel.WARN, 'LOS Box AI: request failed: ' + e.getMessage());
            result.answer = 'Box AI did not respond for that document.';
            return result;
        }

        if (response.getStatusCode() != 200 && response.getStatusCode() != 201) {
            System.debug(LoggingLevel.WARN, 'LOS Box AI: returned ' + response.getStatusCode() + ' ' + response.getBody());
            result.answer = 'Box AI refused to read that document (HTTP ' + response.getStatusCode() + '). Do not guess at its contents.';
            return result;
        }

        Map<String, Object> parsed = (Map<String, Object>) JSON.deserializeUntyped(response.getBody());
        String answer = (String) parsed.get('answer');
        if (String.isBlank(answer)) {
            result.answer = 'Box AI returned nothing for that document.';
            return result;
        }
        result.answer = answer;
        result.answered = true;
        return result;
    }
}
