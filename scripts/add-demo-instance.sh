#!/bin/bash
# Add a new demo workspace instance to the LOS demo
# Usage: ./scripts/add-demo-instance.sh <alias> <box-workspace-folder-id> <loan-id>

set -e

if [ $# -ne 3 ]; then
    echo "Usage: $0 <sf-alias> <box-workspace-folder-id> <loan-id>"
    echo "Example: $0 agentforce <folder-id> LN-2026-0042"
    exit 1
fi

ALIAS=$1
FOLDER_ID=$2
LOAN_ID=$3

echo "Adding demo instance:"
echo "  Folder ID: $FOLDER_ID"
echo "  Loan ID: $LOAN_ID"
echo ""

# Create Apex script to add folder and link loan
cat > /tmp/add-demo-instance.apex <<EOF
// Get current config
LOS_Box_Config__c config = LOS_Box_Config__c.getOrgDefaults();
String currentFolders = config.Allowed_Folder_Ids__c;

// Add new folder to allowed list if not already there
if (String.isBlank(currentFolders)) {
    currentFolders = '${FOLDER_ID}';
} else if (!currentFolders.contains('${FOLDER_ID}')) {
    currentFolders = currentFolders + ',${FOLDER_ID}';
}
config.Allowed_Folder_Ids__c = currentFolders;
update config;
System.debug('Updated allowed folders: ' + config.Allowed_Folder_Ids__c);

// Link loan to folder
List<LOS_Loan__c> loans = [SELECT Id, Loan_ID__c FROM LOS_Loan__c WHERE Loan_ID__c = '${LOAN_ID}' LIMIT 1];
if (loans.isEmpty()) {
    System.debug('ERROR: Loan ${LOAN_ID} not found');
} else {
    LOS_Loan__c loan = loans[0];
    loan.Box_Workspace_Folder_ID__c = '${FOLDER_ID}';
    update loan;
    System.debug('Linked loan ${LOAN_ID} to folder ${FOLDER_ID}');

    // Create or update box__FRUP__c
    List<box__FRUP__c> frups = [SELECT Id FROM box__FRUP__c WHERE box__Record_ID__c = :loan.Id LIMIT 1];
    if (frups.isEmpty()) {
        box__FRUP__c frup = new box__FRUP__c(
            box__Record_ID__c = loan.Id,
            box__Folder_ID__c = '${FOLDER_ID}',
            box__Object_Name__c = 'LOS_Loan__c'
        );
        insert frup;
        System.debug('Created box__FRUP__c for loan ${LOAN_ID}');
    } else {
        frups[0].box__Folder_ID__c = '${FOLDER_ID}';
        update frups[0];
        System.debug('Updated box__FRUP__c for loan ${LOAN_ID}');
    }
}
EOF

# Execute
sf apex run --file /tmp/add-demo-instance.apex --target-org "$ALIAS"

echo ""
echo "Demo instance added successfully!"
echo "Reconnect MCP connectors in Claude Desktop to pick up the change."
