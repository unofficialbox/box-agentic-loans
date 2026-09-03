/**
 * Pulls the loan terms out of one document with Box AI Extract, and says where they
 * disagree with the record.
 *
 * This is the storyboard's "Extract" beat, and it is deliberately split from the write.
 * Extraction is a reading: Box AI proposes values, each one traceable to the file it came
 * from, and a loan officer decides whether the record should carry them. If this action
 * also wrote, the decision would be made by whichever document was read last -- the
 * borrower's stated $6,000,000 collateral value or the appraisal's $5,650,000 -- and
 * nobody would have chosen. So this returns the values and a validation summary, and
 * LosApplyLoanTerms writes only what a person has accepted.
 *
 * The validation is where the demo's risk actually shows. The application, the appraisal
 * and the financial statements are all in the file, and each is internally consistent;
 * the problem is only visible when a document is held against the record and against
 * policy. An LTV of 85% is not a typo in the appraisal, it is the loan against a lower
 * value than the borrower stated. Naming that beside LOS-LTV-001 is the point.
 *
 * Bounded like the ask action: the file must belong to the loan the caller named, so an
 * MCP client cannot extract from an arbitrary Box file, and the Box credential stays in
 * Apex.
 */
public with sharing class LosExtractLoanTerms {

    private static final String EXTRACT_ENDPOINT = 'callout:LOS_Box/2.0/ai/extract_structured';

    /** Credit policy thresholds the summary flags against. Standard positions only. */
    @TestVisible private static final Decimal POLICY_MAX_LTV = 75;
    @TestVisible private static final Decimal POLICY_MIN_DSCR = 1.25;

    public class Request {
        @InvocableVariable(
            label='Loan ID'
            description='The loan whose document is being read, for example LN-2026-0042. A document is only readable in the context of the loan it belongs to, so this is effectively required -- but it is not declared required, deliberately. A required invocable variable that arrives empty is rejected by the platform with REQUIRED_FIELD_MISSING and a 500 before this class runs, which tells the caller nothing it can act on. Left optional, the refusal below names what is missing and the agent can call again with it.'
        )
        public String loanReference;
        @InvocableVariable(
            label='Box item ID'
            description='The Box file ID to extract from, taken from that loan\'s package listing: the application, the appraisal, the financial statements or the term sheet.'
        )
        public String itemId;
        @InvocableVariable(
            label='Prompt'
            description='Optional guidance for the extraction, for example "Use the appraised value, not the borrower-stated value." The field list itself is fixed.'
        )
        public String prompt;
    }

    public class Result {
        @InvocableVariable(label='Extracted terms as JSON')
        public String extractedJson;
        @InvocableVariable(label='Validation against the record and credit policy')
        public String validationSummary;
        @InvocableVariable(label='Whether Box AI extracted anything')
        public Boolean extracted;
    }

    @InvocableMethod(
        label='Extract loan terms from a document'
        description='Reads one loan document with Box AI Extract and returns the loan amount, interest rate, term, collateral value, LTV, DSCR and maturity date it finds, with a validation summary naming every value that disagrees with the loan record or falls outside credit policy. Writes nothing.'
    )
    public static List<Result> extract(List<Request> requests) {
        List<Result> results = new List<Result>();
        for (Request req : requests) {
            results.add(extractOne(req));
        }
        return results;
    }

    /**
     * The fields Box AI is asked for, in the order the summary reports them.
     *
     * Keys are the template's vocabulary, not Salesforce API names: `ltv` rather than
     * `LTV__c`. The mapping to the record lives in `recordValue` below, so a renamed field
     * on either side is a compile error here rather than a silently empty column.
     */
    @TestVisible
    private static List<Map<String, Object>> fieldSpecs() {
        return new List<Map<String, Object>>{
            spec('loanAmount', 'float', 'Loan amount', 'The principal amount of the loan requested or committed, as a number with no currency symbol.'),
            spec('interestRate', 'float', 'Interest rate', 'The annual interest rate as a percentage, for example 6.85.'),
            spec('termMonths', 'float', 'Term in months', 'The loan term in months. Convert years to months.'),
            spec('collateralValue', 'float', 'Collateral value', 'The value of the collateral. Prefer an appraised value from a bank-ordered appraisal over a borrower-stated value.'),
            spec('ltv', 'float', 'Loan-to-value', 'The loan-to-value ratio as a percentage of collateral value, for example 85 for 85%.'),
            spec('dscr', 'float', 'Debt service coverage', 'The debt service coverage ratio as a multiple, for example 1.12 for 1.12x.'),
            spec('maturityDate', 'date', 'Maturity date', 'The date the loan matures, if the document states one.')
        };
    }

    private static Map<String, Object> spec(String key, String type, String displayName, String prompt) {
        return new Map<String, Object>{
            'key' => key, 'type' => type, 'displayName' => displayName, 'prompt' => prompt
        };
    }

    private static Result extractOne(Request req) {
        Result result = new Result();
        result.extracted = false;

        if (req == null || String.isBlank(req.itemId)) {
            result.validationSummary = 'I need a Box file ID from the loan package before I can extract terms from a document.';
            return result;
        }
        if (String.isBlank(req.loanReference)) {
            result.validationSummary = 'I need to know which loan that document belongs to before I can read it.';
            return result;
        }

        // The same bound the ask action has: the file must be in this loan's folder.
        Set<String> allowed = LosLoanPackage.documentIdsFor(req.loanReference);
        if (allowed == null) {
            result.validationSummary = 'I could not resolve the documents for "' + req.loanReference.trim()
                + '", so I cannot confirm that file belongs to it.';
            return result;
        }
        String itemId = req.itemId.trim();
        if (!allowed.contains(itemId)) {
            result.validationSummary = 'That file is not in the Box folder for ' + req.loanReference.trim()
                + '. Extract from a document in the loan package it does belong to.';
            return result;
        }

        LosLoanPackage.Located found = LosLoanPackage.locate(req.loanReference);
        if (found.loan == null) {
            result.validationSummary = 'I could not find a LOS loan matching "' + req.loanReference.trim() + '".';
            return result;
        }

        String token = LosBoxAuth.parentToken();
        if (String.isBlank(token)) {
            result.validationSummary = 'Box did not issue a token, so I could not read the document. This is a configuration problem, not something to retry.';
            return result;
        }

        List<Map<String, Object>> fields = fieldSpecs();
        if (String.isNotBlank(req.prompt)) {
            // Guidance applies to every field rather than replacing the field list: the
            // caller may steer the reading, not change what is read.
            for (Map<String, Object> field : fields) {
                field.put('prompt', (String) field.get('prompt') + ' ' + req.prompt.trim());
            }
        }
        String body = JSON.serialize(new Map<String, Object>{
            'items' => new List<Object>{
                new Map<String, Object>{ 'id' => itemId, 'type' => 'file' }
            },
            'fields' => fields
        });

        HttpRequest boxRequest = new HttpRequest();
        boxRequest.setEndpoint(EXTRACT_ENDPOINT);
        boxRequest.setMethod('POST');
        boxRequest.setHeader('Authorization', 'Bearer ' + token);
        boxRequest.setHeader('Content-Type', 'application/json');
        // Box AI reads the whole document before answering, which is slower than a metadata call.
        boxRequest.setTimeout(120000);
        boxRequest.setBody(body);

        HttpResponse response;
        try {
            response = new Http().send(boxRequest);
        } catch (Exception e) {
            System.debug(LoggingLevel.WARN, 'LOS Box AI extract: request failed: ' + e.getMessage());
            result.validationSummary = 'Box AI did not respond for that document.';
            return result;
        }

        if (response.getStatusCode() != 200 && response.getStatusCode() != 201) {
            System.debug(LoggingLevel.WARN, 'LOS Box AI extract: returned ' + response.getStatusCode() + ' ' + response.getBody());
            result.validationSummary = 'Box AI refused to read that document (HTTP ' + response.getStatusCode() + '). Do not guess at its contents.';
            return result;
        }

        Map<String, Object> values = parseAnswer(response.getBody());
        if (values == null || values.isEmpty()) {
            result.validationSummary = 'Box AI returned no terms for that document.';
            return result;
        }

        result.extractedJson = JSON.serialize(values);
        result.validationSummary = validate(values, found.loan);
        result.extracted = true;
        return result;
    }

    /**
     * The `answer` of an extract response, as a map of key to value.
     *
     * Box has answered this two ways: as a JSON object, and as a string holding a JSON
     * object. Both are accepted, because which one arrives is not something a caller can
     * control and a parse failure here would read as "the document says nothing".
     */
    @TestVisible
    private static Map<String, Object> parseAnswer(String responseBody) {
        Map<String, Object> parsed;
        try {
            parsed = (Map<String, Object>) JSON.deserializeUntyped(responseBody);
        } catch (Exception e) {
            return null;
        }
        Object answer = parsed.get('answer');
        if (answer == null) {
            return null;
        }
        if (answer instanceof Map<String, Object>) {
            return (Map<String, Object>) answer;
        }
        if (answer instanceof String) {
            try {
                Object nested = JSON.deserializeUntyped((String) answer);
                if (nested instanceof Map<String, Object>) {
                    return (Map<String, Object>) nested;
                }
            } catch (Exception e) {
                // Not JSON: a bare string is not a set of terms.
            }
        }
        return null;
    }

    /**
     * One line per extracted field, saying whether the document and the record agree,
     * then the policy flags. Written for a person: "ltv: document 85, record 80 (mismatch)".
     */
    @TestVisible
    private static String validate(Map<String, Object> values, LOS_Loan__c loan) {
        List<String> lines = new List<String>{ 'Extracted terms against ' + loan.Loan_ID__c + ':' };
        Integer mismatches = 0;
        for (Map<String, Object> field : fieldSpecs()) {
            String key = (String) field.get('key');
            String fromDocument = asText(values.get(key));
            String onRecord = recordValue(key, loan);
            if (fromDocument == null) {
                lines.add('- ' + key + ': not found in the document');
                continue;
            }
            if (onRecord == null) {
                lines.add('- ' + key + ': document ' + fromDocument + ', record empty (new)');
                continue;
            }
            if (sameValue(fromDocument, onRecord)) {
                lines.add('- ' + key + ': document ' + fromDocument + ', record ' + onRecord + ' (match)');
            } else {
                mismatches++;
                lines.add('- ' + key + ': document ' + fromDocument + ', record ' + onRecord + ' (mismatch)');
            }
        }

        Decimal ltv = asDecimal(values.get('ltv'));
        if (ltv != null && ltv > POLICY_MAX_LTV) {
            lines.add('- Policy flag: LTV ' + ltv + '% exceeds the ' + POLICY_MAX_LTV
                + '% standard, outside standard credit policy; see LOS-LTV-001 / LOS-DSCR-001.');
        }
        Decimal dscr = asDecimal(values.get('dscr'));
        if (dscr != null && dscr < POLICY_MIN_DSCR) {
            lines.add('- Policy flag: DSCR ' + dscr + 'x is below the ' + POLICY_MIN_DSCR
                + 'x minimum, outside standard credit policy; see LOS-LTV-001 / LOS-DSCR-001.');
        }

        lines.add(mismatches == 0
            ? 'No mismatches. Nothing has been written to the record.'
            : mismatches + ' mismatch(es). Nothing has been written to the record; a loan officer accepts or corrects each value before it is applied.');
        return String.join(lines, '\n');
    }

    /** The record's current value for an extract key, as text, or null when empty. */
    private static String recordValue(String key, LOS_Loan__c loan) {
        Object value;
        if (key == 'loanAmount') value = loan.Loan_Amount__c;
        else if (key == 'interestRate') value = loan.Interest_Rate__c;
        else if (key == 'termMonths') value = loan.Term_Months__c;
        else if (key == 'collateralValue') value = loan.Collateral_Value__c;
        else if (key == 'ltv') value = loan.LTV__c;
        else if (key == 'dscr') value = loan.DSCR__c;
        else if (key == 'maturityDate') value = loan.Maturity_Date__c;
        return asText(value);
    }

    /**
     * A value as a person would write it. Numbers are normalised through Decimal with
     * trailing zeros stripped, so a currency field read back as 80.00 and a JSON 80 both
     * say "80" -- otherwise every comparison line reads as a mismatch of formatting.
     */
    private static String asText(Object value) {
        if (value == null) {
            return null;
        }
        if (value instanceof Date) {
            return String.valueOf((Date) value);
        }
        if (value instanceof Decimal || value instanceof Double || value instanceof Integer || value instanceof Long) {
            return Decimal.valueOf(String.valueOf(value)).stripTrailingZeros().toPlainString();
        }
        String text = String.valueOf(value).trim();
        return String.isBlank(text) ? null : text;
    }

    private static Decimal asDecimal(Object value) {
        if (value == null) {
            return null;
        }
        try {
            return Decimal.valueOf(String.valueOf(value).trim());
        } catch (Exception e) {
            return null;
        }
    }

    /** Numbers compare as numbers, so 85 and 85.00 agree; everything else compares as text. */
    private static Boolean sameValue(String a, String b) {
        Decimal da = asDecimal(a);
        Decimal db = asDecimal(b);
        if (da != null && db != null) {
            return da == db;
        }
        return a.equalsIgnoreCase(b);
    }
}
