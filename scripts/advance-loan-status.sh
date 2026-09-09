#!/bin/bash
# Advance loan status through the approval workflow
# Usage: ./scripts/advance-loan-status.sh <alias> <loan-id> <new-status>

set -e

if [ $# -ne 3 ]; then
    echo "Usage: $0 <sf-alias> <loan-id> <new-status>"
    echo ""
    echo "Valid statuses:"
    echo "  Application → Underwriting → Credit Review → Approved → Commitment → Closed"
    echo ""
    echo "Example: $0 agentforce LN-2026-0042 Approved"
    exit 1
fi

ALIAS=$1
LOAN_ID=$2
NEW_STATUS=$3

# Validate status
case "$NEW_STATUS" in
    "Application"|"Underwriting"|"Credit Review"|"Approved"|"Commitment"|"Closed"|"Declined")
        ;;
    *)
        echo "Error: Invalid status '$NEW_STATUS'"
        echo "Valid: Application, Underwriting, Credit Review, Approved, Commitment, Closed, Declined"
        exit 1
        ;;
esac

echo "Advancing $LOAN_ID to status: $NEW_STATUS"
echo ""

# Create Apex script
cat > /tmp/advance-status.apex <<EOF
List<LOS_Loan__c> loans = [SELECT Id, Loan_ID__c, Status__c FROM LOS_Loan__c WHERE Loan_ID__c = '${LOAN_ID}' LIMIT 1];

if (loans.isEmpty()) {
    System.debug('ERROR: Loan ${LOAN_ID} not found');
} else {
    LOS_Loan__c loan = loans[0];
    String oldStatus = loan.Status__c;
    loan.Status__c = '${NEW_STATUS}';
    update loan;

    System.debug('✓ Advanced ${LOAN_ID} from ' + oldStatus + ' to ${NEW_STATUS}');
}
EOF

# Execute
sf apex run --file /tmp/advance-status.apex --target-org "$ALIAS" 2>&1 | grep -E "✓|ERROR"

echo ""
echo "Status updated. Verify with:"
echo "  sf data query --query \"SELECT Loan_ID__c, Status__c FROM LOS_Loan__c WHERE Loan_ID__c = '${LOAN_ID}'\" --target-org $ALIAS"
