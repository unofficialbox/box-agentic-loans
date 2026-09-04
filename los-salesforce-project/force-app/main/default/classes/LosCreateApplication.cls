/**
 * The borrower's front door: one loan application, created for the organisation they are
 * signed in as, and for nobody else.
 *
 * This is the first governed write a borrower makes, and it is shaped by the same rule
 * LosBorrowerLoans follows for reads: the body carries no account. The Account comes from
 * the signed-in user's Contact, the same anchor the LOS_Borrower_Access sharing set keys
 * off, so the record a borrower creates is a record they will then be able to see. An
 * account id in the body would be an account id a borrower could change, so none is
 * accepted -- a body that carries one is simply not read.
 *
 * The write runs in user mode, deliberately. The class is `with sharing`, but sharing
 * governs which rows a user may reach, not which fields they may set; user-mode DML makes
 * the borrower's own field-level security the gate, so LOS_Borrower_Portal names exactly
 * the fields an application may carry and this class cannot quietly set more. Rate, LTV,
 * DSCR, collateral value, risk rating and loan officer are the bank's to fill in, and
 * they are never touched here.
 *
 * The Box folder is not provisioned here. Provisioning is a callout through box.Toolkit
 * that also commits DML, and Apex refuses a callout once a transaction has written, so
 * creating the loan and provisioning its folder have to be two requests: this one, then
 * POST /los/box-folder?recordId=. The browser makes both, in that order.
 *
 * Loan IDs are minted here rather than by an autonumber because the format is shared
 * with the Box Automate intake, which supplies its own, and the two must not collide:
 * the next number for the year is one more than the highest already used, whoever used
 * it. Loan_ID__c is an external id but not unique, so a collision cannot be refused by
 * the platform; the retry on a duplicate error exists for the day it is made unique.
 */
@RestResource(urlMapping='/los/applications/*')
global with sharing class LosCreateApplication {

    /** What the portal will accept without a conversation with the bank first. */
    @TestVisible private static final Decimal MAX_LOAN_AMOUNT = 50000000;
    @TestVisible private static final Integer MIN_TERM_MONTHS = 6;
    @TestVisible private static final Integer MAX_TERM_MONTHS = 360;
    @TestVisible private static final Integer MIN_PURPOSE_LENGTH = 10;
    @TestVisible private static final Integer MAX_PURPOSE_LENGTH = 2000;
    /** Borrower_Entity__c is Text(120); a longer name would fail the DML with a worse message. */
    private static final Integer MAX_ENTITY_LENGTH = 120;
    /** The standard Name field on a custom object. */
    private static final Integer MAX_NAME_LENGTH = 80;
    private static final String LOAN_ID_PREFIX = 'LN-';
    private static final String DEFAULT_COLLATERAL_TYPE = 'None';

    /**
     * The LoanSummary shape LosLoanListService publishes, plus the purpose. Mirrored rather
     * than reused because a global inner class cannot be extended, and the browser expects
     * the same keys from both endpoints so a new loan slots straight into the list.
     */
    global class ApplicationSummary {
        global String recordId;
        global String loanId;
        global String name;
        global String borrower;
        global String borrowerEntity;
        global String loanType;
        global String status;
        global Decimal loanAmount;
        global Integer termMonths;
        /** Always null here: maturity is set when the bank commits, not when the borrower applies. */
        global String maturityDate;
        /** Always null here: the browser provisions the folder with its next request. */
        global String boxFolderId;
        global String purpose;
    }

    /**
     * Lets a test pin the borrower's account, for the reason LosBorrowerLoans gives: a
     * Customer Community user with a Contact cannot be conjured inside a test without
     * org configuration the test cannot create, and the identity read is one query that
     * either finds a Contact or does not.
     */
    @TestVisible
    private static Id accountOverride;

    /** Lets a test stand in as a guest; a site guest user cannot be created in a test. */
    @TestVisible
    private static String userTypeOverride;

    @HttpPost
    global static void createApplication() {
        RestRequest request = RestContext.request;
        RestResponse response = RestContext.response;
        response.addHeader('Content-Type', 'application/json');
        response.addHeader('Cache-Control', 'no-store');

        // Same refusal as the loan list: a guest is nobody, not a borrower with nothing.
        if (isGuest()) {
            fail(response, 401, 'not_authenticated', 'Sign in to start a loan application with us.');
            return;
        }

        Borrower borrower = boundBorrower();
        if (borrower == null) {
            fail(response, 403, 'no_borrower_account',
                'Your sign-in is not linked to a borrower organisation, so we cannot tell who this application is for.');
            return;
        }

        Draft draft;
        try {
            draft = parse(request.requestBody == null ? null : request.requestBody.toString());
        } catch (InvalidApplicationException e) {
            fail(response, 400, 'invalid_application', e.getMessage());
            return;
        }

        LOS_Loan__c created;
        try {
            created = insertWithNextLoanId(draft, borrower);
        } catch (DmlException e) {
            System.debug(LoggingLevel.WARN, 'LOS create application: ' + e.getMessage());
            fail(response, 500, 'application_not_created',
                'We could not save your application (' + e.getDmlStatusCode(0) + '), so nothing was created.');
            return;
        } catch (Exception e) {
            System.debug(LoggingLevel.WARN, 'LOS create application: ' + e.getTypeName() + ' ' + e.getMessage());
            fail(response, 500, 'application_not_created',
                'We could not save your application, so nothing was created.');
            return;
        }

        response.statusCode = 201;
        response.responseBody = Blob.valueOf(JSON.serialize(summarise(created)));
    }

    private static Boolean isGuest() {
        String userType = userTypeOverride != null ? userTypeOverride : UserInfo.getUserType();
        return userType == 'Guest';
    }

    /** The organisation this session is bounded to, or null for a caller with no Contact. */
    private static Borrower boundBorrower() {
        if (accountOverride != null) {
            List<Account> pinned = [SELECT Id, Name FROM Account WHERE Id = :accountOverride LIMIT 1];
            if (pinned.isEmpty()) {
                return null;
            }
            Borrower borrower = new Borrower();
            borrower.accountId = pinned[0].Id;
            borrower.accountName = pinned[0].Name;
            return borrower;
        }
        return new IdentityResolver().forRunningUser();
    }

    /** The one input this endpoint decides for itself. */
    private class Borrower {
        private Id accountId;
        private String accountName;
    }

    /** The validated body. Only these values reach the record. */
    private class Draft {
        private String loanType;
        private Decimal loanAmount;
        private Integer termMonths;
        private String purpose;
        private String borrowerEntity;
        private String collateralType;
    }

    private class InvalidApplicationException extends Exception {}

    /**
     * Every refusal here is a sentence the form can show beside the field. The rules are
     * the same ones the form checks first, so a borrower only ever sees these when the
     * browser and the server disagree -- which is the case worth a clear sentence.
     */
    @TestVisible
    private static Draft parse(String body) {
        Map<String, Object> raw;
        try {
            raw = (Map<String, Object>) JSON.deserializeUntyped(body);
        } catch (Exception e) {
            throw new InvalidApplicationException('Send the application as a JSON object.');
        }
        if (raw == null) {
            throw new InvalidApplicationException('Send the application as a JSON object.');
        }
        Draft draft = new Draft();

        draft.loanType = picklistValue(raw.get('loanType'),
            Schema.sObjectType.LOS_Loan__c.fields.Loan_Type__c.getPicklistValues());
        if (draft.loanType == null) {
            throw new InvalidApplicationException('Choose one of the loan types we offer: '
                + String.join(activeValues(Schema.sObjectType.LOS_Loan__c.fields.Loan_Type__c.getPicklistValues()), ', ') + '.');
        }

        draft.loanAmount = asDecimal(raw.get('loanAmount'));
        if (draft.loanAmount == null || draft.loanAmount <= 0 || draft.loanAmount > MAX_LOAN_AMOUNT) {
            throw new InvalidApplicationException('Enter a loan amount greater than zero and no more than '
                + MAX_LOAN_AMOUNT.format() + '.');
        }

        Decimal term = asDecimal(raw.get('termMonths'));
        if (term == null || term.stripTrailingZeros().scale() > 0
            || term < MIN_TERM_MONTHS || term > MAX_TERM_MONTHS) {
            throw new InvalidApplicationException('Enter a term between ' + MIN_TERM_MONTHS
                + ' and ' + MAX_TERM_MONTHS + ' whole months.');
        }
        draft.termMonths = term.intValue();

        String purpose = asText(raw.get('purpose'));
        if (purpose == null || purpose.length() < MIN_PURPOSE_LENGTH || purpose.length() > MAX_PURPOSE_LENGTH) {
            throw new InvalidApplicationException('Tell us what the loan is for, in at least '
                + MIN_PURPOSE_LENGTH + ' and at most ' + MAX_PURPOSE_LENGTH + ' characters.');
        }
        draft.purpose = purpose;

        String entity = asText(raw.get('borrowerEntity'));
        if (entity != null && entity.length() > MAX_ENTITY_LENGTH) {
            throw new InvalidApplicationException('Keep the borrowing entity name to '
                + MAX_ENTITY_LENGTH + ' characters or fewer.');
        }
        draft.borrowerEntity = entity;

        if (asText(raw.get('collateralType')) == null) {
            draft.collateralType = DEFAULT_COLLATERAL_TYPE;
        } else {
            draft.collateralType = picklistValue(raw.get('collateralType'),
                Schema.sObjectType.LOS_Loan__c.fields.Collateral_Type__c.getPicklistValues());
            if (draft.collateralType == null) {
                throw new InvalidApplicationException('Choose one of the collateral types we list, or leave it blank: '
                    + String.join(activeValues(Schema.sObjectType.LOS_Loan__c.fields.Collateral_Type__c.getPicklistValues()), ', ') + '.');
            }
        }
        return draft;
    }

    /**
     * Inserts the record with the next loan number for the year, and once more with the
     * number after that if the platform reports the first as a duplicate. Two attempts,
     * not a loop: a second collision means something other than a race is wrong.
     */
    private static LOS_Loan__c insertWithNextLoanId(Draft draft, Borrower borrower) {
        Integer year = Date.today().year();
        LOS_Loan__c record = build(draft, borrower, nextLoanId(year, 0));
        try {
            Database.insert(record, AccessLevel.USER_MODE);
            return record;
        } catch (DmlException e) {
            if (e.getDmlType(0) != System.StatusCode.DUPLICATE_VALUE) {
                throw e;
            }
        }
        record = build(draft, borrower, nextLoanId(year, 1));
        Database.insert(record, AccessLevel.USER_MODE);
        return record;
    }

    /**
     * A fresh sObject carrying only the fields the application may set. Nothing from the
     * request reaches the record except through `draft`, and nothing about the bank's
     * assessment is set at all.
     */
    private static LOS_Loan__c build(Draft draft, Borrower borrower, String loanId) {
        String entity = String.isBlank(draft.borrowerEntity) ? borrower.accountName : draft.borrowerEntity;
        String name = borrower.accountName + ' ' + draft.loanType + ' ' + Date.today().year();
        return new LOS_Loan__c(
            Name = name.left(MAX_NAME_LENGTH),
            Loan_ID__c = loanId,
            Status__c = 'Application',
            Record_Source__c = 'Borrower Portal',
            Borrower_Account__c = borrower.accountId,
            Borrower__c = borrower.accountName,
            Borrower_Entity__c = entity,
            Applicant_Name__c = UserInfo.getName(),
            Applicant_Email__c = UserInfo.getUserEmail(),
            Loan_Type__c = draft.loanType,
            Loan_Amount__c = draft.loanAmount,
            Term_Months__c = draft.termMonths,
            Purpose__c = draft.purpose,
            Collateral_Type__c = draft.collateralType
        );
    }

    /** LN-<yyyy>-<NNNN>: one past the highest number already used this year, plus `offset`. */
    @TestVisible
    private static String nextLoanId(Integer year, Integer offset) {
        Integer next = new Sequence().highestFor(year) + 1 + offset;
        return LOAN_ID_PREFIX + year + '-' + String.valueOf(next).leftPad(4, '0');
    }

    private static ApplicationSummary summarise(LOS_Loan__c record) {
        ApplicationSummary summary = new ApplicationSummary();
        summary.recordId = record.Id;
        summary.loanId = record.Loan_ID__c;
        summary.name = record.Name;
        summary.borrower = record.Borrower__c;
        summary.borrowerEntity = record.Borrower_Entity__c;
        summary.loanType = record.Loan_Type__c;
        summary.status = record.Status__c;
        summary.loanAmount = record.Loan_Amount__c;
        summary.termMonths = record.Term_Months__c == null ? null : Integer.valueOf(record.Term_Months__c);
        summary.maturityDate = null;
        summary.boxFolderId = null;
        summary.purpose = record.Purpose__c;
        return summary;
    }

    /**
     * The canonical picklist value matching what was sent, or null. Matched against the
     * field's own describe so a value added to the picklist is accepted here without an
     * edit, and matched case-insensitively because a form's value and a person's typing
     * are not the same thing; what reaches the record is always the picklist's spelling.
     */
    private static String picklistValue(Object sent, List<Schema.PicklistEntry> entries) {
        String wanted = asText(sent);
        if (wanted == null) {
            return null;
        }
        for (Schema.PicklistEntry entry : entries) {
            if (entry.isActive() && entry.getValue().equalsIgnoreCase(wanted)) {
                return entry.getValue();
            }
        }
        return null;
    }

    private static List<String> activeValues(List<Schema.PicklistEntry> entries) {
        List<String> values = new List<String>();
        for (Schema.PicklistEntry entry : entries) {
            if (entry.isActive()) {
                values.add(entry.getValue());
            }
        }
        return values;
    }

    /** A trimmed non-empty string, or null for anything else. */
    private static String asText(Object value) {
        if (value == null || !(value instanceof String)) {
            return null;
        }
        String text = ((String) value).trim();
        return String.isBlank(text) ? null : text;
    }

    /**
     * JSON numbers arrive as Integer, Long, Double or Decimal depending on their shape,
     * and a form that serialises its inputs as strings is common enough to accept too.
     */
    private static Decimal asDecimal(Object value) {
        if (value == null) {
            return null;
        }
        if (value instanceof Decimal) return (Decimal) value;
        if (value instanceof Integer) return Decimal.valueOf((Integer) value);
        if (value instanceof Long) return Decimal.valueOf((Long) value);
        if (value instanceof Double) return Decimal.valueOf((Double) value);
        if (value instanceof String) {
            try {
                return Decimal.valueOf(((String) value).trim());
            } catch (Exception e) {
                return null;
            }
        }
        return null;
    }

    private static void fail(RestResponse response, Integer status, String error, String detail) {
        response.statusCode = status;
        response.responseBody = Blob.valueOf(JSON.serialize(
            new Map<String, String>{ 'error' => error, 'detail' => detail }));
    }

    /**
     * The running user's Account, by way of their Contact. `without sharing` only to read
     * the caller's own User and Contact rows, which a community user cannot read under
     * sharing; the value it returns is the caller's own organisation, and it is the only
     * account this endpoint will ever write.
     */
    private without sharing class IdentityResolver {
        private Borrower forRunningUser() {
            // Schema-qualified: an unqualified User resolves ambiguously here and the
            // compiler reports it as "Illegal assignment from List<User> to List<User>".
            // LosBorrowerLoans and LosWhoAmI carry the same note.
            List<Schema.User> users = [
                SELECT ContactId, Contact.AccountId, Contact.Account.Name
                FROM User
                WHERE Id = :UserInfo.getUserId()
                LIMIT 1
            ];
            if (users.isEmpty() || users[0].ContactId == null || users[0].Contact.AccountId == null) {
                return null;
            }
            Borrower borrower = new Borrower();
            borrower.accountId = users[0].Contact.AccountId;
            borrower.accountName = users[0].Contact.Account.Name;
            return borrower;
        }
    }

    /**
     * `without sharing` because the loan number is org-wide. A borrower sees only their
     * own loans, and a sequence computed from those would reissue numbers the bank has
     * already given to other customers. Nothing leaves this class but the highest number.
     */
    private without sharing class Sequence {
        private Integer highestFor(Integer year) {
            String pattern = LOAN_ID_PREFIX + year + '-%';
            Integer highest = 0;
            for (LOS_Loan__c record : [SELECT Loan_ID__c FROM LOS_Loan__c WHERE Loan_ID__c LIKE :pattern]) {
                // Only LN-yyyy-NNNN counts; a hand-typed LN-2026-0042-A or a test id is
                // skipped rather than allowed to throw the whole request.
                List<String> parts = record.Loan_ID__c.split('-');
                if (parts.size() != 3 || !parts[2].isNumeric()) {
                    continue;
                }
                Integer sequenceNumber = Integer.valueOf(parts[2]);
                if (sequenceNumber > highest) {
                    highest = sequenceNumber;
                }
            }
            return highest;
        }
    }
}
