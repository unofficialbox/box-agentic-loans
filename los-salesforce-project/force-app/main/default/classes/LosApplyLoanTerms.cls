/**
 * Writes human-accepted loan terms to the record. The one governed write in the demo.
 *
 * Every other action reads. This one exists because the storyboard's Extract beat ends
 * with the values on the Loan record, and a demo that could only propose them would be
 * showing half the flow. But a write from an agent is exactly what the paved path says
 * not to do on its own, so the write is fenced three ways:
 *
 *   - `confirmed` must be true. The value is not inferred: an agent passes it only when
 *     a person has said, in the conversation, that these are the terms. Without it
 *     nothing is written and the refusal says so.
 *   - Only the seven allow-listed term fields can change, and only the ones supplied.
 *     Status, risk rating, borrower and everything else are not reachable from here.
 *   - A loan that is Closed or Servicing is refused. Its terms are what was executed,
 *     and changing them after the fact is a servicing event, not a data correction.
 *
 * `with sharing`, and it checks field-level update permission before touching a field.
 * The agent user is granted edit on exactly the allow-listed fields, so a field that is
 * not updateable is reported as skipped rather than written or silently dropped.
 */
public with sharing class LosApplyLoanTerms {

    /** The loan states in which the terms are settled and must not be edited from a conversation. */
    private static final Set<String> FROZEN = new Set<String>{ 'Closed', 'Servicing' };

    public class Request {
        @InvocableVariable(
            label='Loan ID'
            description='The loan the accepted terms belong to, for example LN-2026-0042.'
            required=true
        )
        public String loanReference;
        @InvocableVariable(
            label='Confirmed by a person'
            description='True only when a loan officer has accepted these values in the conversation. Nothing is written otherwise.'
            required=true
        )
        public Boolean confirmed;
        @InvocableVariable(label='Loan amount')
        public Decimal loanAmount;
        @InvocableVariable(label='Interest rate' description='Annual rate as a percentage, for example 6.85.')
        public Decimal interestRate;
        @InvocableVariable(label='Term in months')
        public Integer termMonths;
        @InvocableVariable(label='Collateral value' description='Appraised value.')
        public Decimal collateralValue;
        @InvocableVariable(label='Loan-to-value' description='As a percentage, for example 85.')
        public Decimal ltv;
        @InvocableVariable(label='Debt service coverage' description='As a multiple, for example 1.12.')
        public Decimal dscr;
        @InvocableVariable(label='Maturity date')
        public Date maturityDate;
    }

    public class Result {
        @InvocableVariable(label='Outcome')
        public String summary;
        @InvocableVariable(label='Whether the record was updated')
        public Boolean applied;
        @InvocableVariable(label='Fields updated')
        public String fieldsUpdated;
    }

    @InvocableMethod(
        label='Apply accepted loan terms to the record'
        description='Writes explicitly supplied, human-accepted loan terms (amount, rate, term, collateral value, LTV, DSCR, maturity date) to the named loan. Requires confirmed = true. Refuses when the loan is Closed or Servicing. Never writes any other field.'
    )
    public static List<Result> apply(List<Request> requests) {
        List<Result> results = new List<Result>();
        for (Request req : requests) {
            results.add(applyOne(req));
        }
        return results;
    }

    private static Result applyOne(Request req) {
        Result result = new Result();
        result.applied = false;
        result.fieldsUpdated = '';

        if (req == null || String.isBlank(req.loanReference)) {
            result.summary = 'I need to know which loan the terms belong to. Nothing was written.';
            return result;
        }
        if (req.confirmed != true) {
            result.summary = 'Nothing was written: a human must accept the extracted terms before they reach the record.';
            return result;
        }

        LosLoanPackage.Located found = LosLoanPackage.locate(req.loanReference);
        if (found.loan == null) {
            result.summary = 'I could not find a LOS loan matching "' + req.loanReference.trim() + '". Nothing was written.';
            return result;
        }
        if (FROZEN.contains(found.loan.Status__c)) {
            result.summary = 'Loan ' + found.loan.Loan_ID__c + ' is ' + found.loan.Status__c
                + ', so its terms are what was executed and cannot be changed from here. Nothing was written.';
            return result;
        }

        // Only the fields supplied, and only the ones this user may update. A fresh
        // sObject with the Id and the changed fields, so the DML cannot carry anything
        // the lookup happened to read.
        LOS_Loan__c changes = new LOS_Loan__c(Id = found.loan.Id);
        List<String> updated = new List<String>();
        List<String> skipped = new List<String>();
        Schema.DescribeSObjectResult objectDescribe = Schema.sObjectType.LOS_Loan__c;

        stage(changes, updated, skipped, 'Loan_Amount__c', req.loanAmount,
            Schema.sObjectType.LOS_Loan__c.fields.Loan_Amount__c.isUpdateable());
        stage(changes, updated, skipped, 'Interest_Rate__c', req.interestRate,
            Schema.sObjectType.LOS_Loan__c.fields.Interest_Rate__c.isUpdateable());
        // Term_Months__c is a Number field, which Apex types as Decimal; widen explicitly
        // rather than trust sObject.put to do it.
        stage(changes, updated, skipped, 'Term_Months__c',
            req.termMonths == null ? null : Decimal.valueOf(req.termMonths),
            Schema.sObjectType.LOS_Loan__c.fields.Term_Months__c.isUpdateable());
        stage(changes, updated, skipped, 'Collateral_Value__c', req.collateralValue,
            Schema.sObjectType.LOS_Loan__c.fields.Collateral_Value__c.isUpdateable());
        stage(changes, updated, skipped, 'LTV__c', req.ltv,
            Schema.sObjectType.LOS_Loan__c.fields.LTV__c.isUpdateable());
        stage(changes, updated, skipped, 'DSCR__c', req.dscr,
            Schema.sObjectType.LOS_Loan__c.fields.DSCR__c.isUpdateable());
        stage(changes, updated, skipped, 'Maturity_Date__c', req.maturityDate,
            Schema.sObjectType.LOS_Loan__c.fields.Maturity_Date__c.isUpdateable());

        if (updated.isEmpty() && skipped.isEmpty()) {
            result.summary = 'No terms were supplied for ' + found.loan.Loan_ID__c + '. Nothing was written.';
            return result;
        }
        if (updated.isEmpty()) {
            result.summary = 'None of the supplied fields (' + String.join(skipped, ', ')
                + ') may be updated by this user. Nothing was written.';
            return result;
        }
        if (!objectDescribe.isUpdateable()) {
            result.summary = 'This user may not update loan records. Nothing was written.';
            return result;
        }

        try {
            update changes;
        } catch (DmlException e) {
            System.debug(LoggingLevel.WARN, 'LOS apply terms failed: ' + e.getMessage());
            result.summary = 'The record update was refused by Salesforce (' + e.getDmlStatusCode(0) + '). Nothing was written.';
            return result;
        }

        result.applied = true;
        result.fieldsUpdated = String.join(updated, ', ');
        result.summary = 'Updated ' + found.loan.Loan_ID__c + ': ' + result.fieldsUpdated + '.'
            + (skipped.isEmpty() ? '' : ' Skipped (not updateable by this user): ' + String.join(skipped, ', ') + '.')
            + ' Status and risk rating are unchanged; credit approval is still a Credit Committee decision.';
        return result;
    }

    /** Stages one supplied value, or records why it was not. A null value was not supplied. */
    private static void stage(
        LOS_Loan__c changes, List<String> updated, List<String> skipped,
        String field, Object value, Boolean updateable
    ) {
        if (value == null) {
            return;
        }
        if (!updateable) {
            skipped.add(field);
            return;
        }
        changes.put(field, value);
        updated.add(field);
    }
}
