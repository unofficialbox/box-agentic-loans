/**
 * Which documents across the whole loan book carry a given policy risk, asked in business
 * terms.
 *
 * This exists because the alternative made a person paste an ID. Box metadata search
 * bounds on `ancestor_folder_id`, so the query has to name a folder -- and the demo used
 * to do that by putting the raw id in the prompt. An id means nothing to the person
 * saying it, cannot be checked by them, and is exactly the plumbing a governed action is
 * supposed to hold.
 *
 * So the caller supplies a risk level, and the boundary comes from configuration. Same
 * division as everywhere else here: the caller names business facts, the action owns
 * which folder, which enterprise and which template are legitimate to read.
 *
 * The scope is not decoration. Box metadata search is enterprise-wide, and this
 * enterprise still holds documents from earlier demo environments with the same file
 * names and different IDs; unscoped, the query returns files that are not in a loan
 * folder at all.
 */
public with sharing class LosPortfolioSearch {

    private static final String QUERY_ENDPOINT = 'https://api.box.com/2.0/metadata_queries/execute_read';
    private static final String TEMPLATE_KEY = 'losDocument';
    private static final Integer MAX_RESULTS = 50;

    public class Request {
        @InvocableVariable(
            label='Risk level'
            description='The policy risk to look for: Critical, High, Medium or Low.'
            required=true
        )
        public String inputRiskLevel;
    }

    public class Result {
        @InvocableVariable(label='Matching documents')
        public String outputSummary;
        @InvocableVariable(label='How many documents matched')
        public Integer outputCount;
    }

    @InvocableMethod(
        label='Find loan documents by policy risk'
        description='Finds documents across every governed loan carrying a given credit policy risk, with a link to each. Use for a portfolio question; the search is bounded to the loans root by configuration.'
    )
    public static List<Result> find(List<Request> requests) {
        List<Result> results = new List<Result>();
        for (Request req : requests) {
            results.add(search(req == null ? null : req.inputRiskLevel));
        }
        return results;
    }

    private static Result search(String riskLevel) {
        Result result = new Result();
        result.outputCount = 0;

        if (String.isBlank(riskLevel)) {
            result.outputSummary = 'Tell me which risk level to look for: Critical, High, Medium or Low.';
            return result;
        }

        LOS_Box_Config__c config = LOS_Box_Config__c.getOrgDefaults();
        String root = config == null ? null : config.Loans_Root_Folder_Id__c;
        String enterprise = config == null ? null : config.Enterprise_Id__c;
        if (String.isBlank(root) || String.isBlank(enterprise)) {
            result.outputSummary =
                'The loans root folder or enterprise ID is not configured, so a portfolio search '
                + 'cannot be bounded. This is a configuration problem, not something to retry.';
            return result;
        }

        String token = LosBoxAuth.parentToken();
        if (String.isBlank(token)) {
            result.outputSummary = 'Box did not issue a token, so I could not search. This is a configuration problem, not something to retry.';
            return result;
        }

        String body = JSON.serialize(new Map<String, Object>{
            'from' => 'enterprise_' + enterprise + '.' + TEMPLATE_KEY,
            'query' => 'policyRisk = :risk',
            'query_params' => new Map<String, Object>{ 'risk' => riskLevel },
            'ancestor_folder_id' => root,
            'fields' => new List<String>{ 'name' },
            'limit' => MAX_RESULTS
        });

        HttpRequest boxRequest = new HttpRequest();
        boxRequest.setEndpoint(QUERY_ENDPOINT);
        boxRequest.setMethod('POST');
        boxRequest.setHeader('Authorization', 'Bearer ' + token);
        boxRequest.setHeader('Content-Type', 'application/json');
        boxRequest.setTimeout(60000);
        boxRequest.setBody(body);

        HttpResponse response;
        try {
            response = new Http().send(boxRequest);
        } catch (Exception e) {
            System.debug(LoggingLevel.WARN, 'LOS portfolio search: request failed: ' + e.getMessage());
            result.outputSummary = 'Box did not respond to the metadata search.';
            return result;
        }

        if (response.getStatusCode() != 200) {
            System.debug(LoggingLevel.WARN, 'LOS portfolio search: ' + response.getStatusCode() + ' ' + response.getBody());
            result.outputSummary = 'Box refused the metadata search (' + response.getStatusCode() + ').';
            return result;
        }

        List<String> lines = new List<String>();
        Map<String, Object> parsed = (Map<String, Object>) JSON.deserializeUntyped(response.getBody());
        for (Object entry : (List<Object>) parsed.get('entries')) {
            Map<String, Object> file = (Map<String, Object>) entry;
            // A link, not an id. The id is the last path segment when a caller needs it.
            lines.add('- ' + file.get('name') + ' - https://app.box.com/file/' + file.get('id'));
        }

        result.outputCount = lines.size();
        if (lines.isEmpty()) {
            result.outputSummary = 'No governed loan document is flagged ' + riskLevel + '.';
            return result;
        }
        lines.add(0, lines.size() + ' document(s) flagged ' + riskLevel + ' across the loan portfolio:');
        result.outputSummary = String.join(lines, '\n');
        return result;
    }
}
