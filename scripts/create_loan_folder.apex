// Manual folder creation script for new loan applications
// Run this after creating a loan application to provision its Box folder

String loanRecordId = 'a0Kfn000005gtgLEAQ'; // UPDATE THIS
String parentFolderId = '416380062104'; // Loan Origination Demo folder
String boxUserId = '27583878577';

// Get loan details
LOS_Loan__c loan = [SELECT Loan_ID__c, Name, Borrower_Entity__c FROM LOS_Loan__c WHERE Id = :loanRecordId];
String folderName = loan.Borrower_Entity__c + ' ' + loan.Loan_ID__c;

System.debug('Creating folder: ' + folderName);
String token = LosBoxAuth.parentToken();

// Create folder in Box
HttpRequest req = new HttpRequest();
req.setEndpoint('callout:LOS_Box/2.0/folders');
req.setMethod('POST');
req.setHeader('Authorization', 'Bearer ' + token);
req.setHeader('Content-Type', 'application/json');
req.setTimeout(30000);
req.setBody(JSON.serialize(new Map<String, Object>{
    'name' => folderName,
    'parent' => new Map<String, Object>{ 'id' => parentFolderId }
}));

HttpResponse res = new Http().send(req);
System.debug('Create folder status: ' + res.getStatusCode());

if (res.getStatusCode() != 201) {
    System.debug('ERROR: ' + res.getBody());
    return;
}

Map<String, Object> folder = (Map<String, Object>)JSON.deserializeUntyped(res.getBody());
String newFolderId = (String)folder.get('id');
System.debug('SUCCESS - Created folder: ' + newFolderId);

// Create subfolder structure
String[] subfolders = new String[]{'01 - Application Intake', '02 - Borrower Documents', '03 - Underwriting', '04 - Approval', '05 - Closing', '06 - Executed Loan Documents'};
for (String subfolder : subfolders) {
    HttpRequest subReq = new HttpRequest();
    subReq.setEndpoint('callout:LOS_Box/2.0/folders');
    subReq.setMethod('POST');
    subReq.setHeader('Authorization', 'Bearer ' + token);
    subReq.setHeader('Content-Type', 'application/json');
    subReq.setTimeout(30000);
    subReq.setBody(JSON.serialize(new Map<String, Object>{
        'name' => subfolder,
        'parent' => new Map<String, Object>{ 'id' => newFolderId }
    }));
    HttpResponse subRes = new Http().send(subReq);
    System.debug('Created: ' + subfolder + ' (' + subRes.getStatusCode() + ')');
}

// Add collaboration
HttpRequest collabReq = new HttpRequest();
collabReq.setEndpoint('callout:LOS_Box/2.0/collaborations');
collabReq.setMethod('POST');
collabReq.setHeader('Authorization', 'Bearer ' + token);
collabReq.setHeader('Content-Type', 'application/json');
collabReq.setTimeout(30000);
collabReq.setBody(JSON.serialize(new Map<String, Object>{
    'item' => new Map<String, Object>{ 'id' => newFolderId, 'type' => 'folder' },
    'accessible_by' => new Map<String, Object>{ 'id' => boxUserId, 'type' => 'user' },
    'role' => 'editor'
}));
HttpResponse collabRes = new Http().send(collabReq);
System.debug('Collaboration: ' + collabRes.getStatusCode());

// Update/create FRUP mapping
List<box__FRUP__c> existingMappings = [SELECT Id FROM box__FRUP__c WHERE box__Record_ID__c = :loanRecordId];
if (!existingMappings.isEmpty()) {
    existingMappings[0].box__Folder_ID__c = newFolderId;
    update existingMappings[0];
} else {
    insert new box__FRUP__c(
        box__Folder_ID__c = newFolderId,
        box__Object_Name__c = 'LOS_Loan__c',
        box__Record_ID__c = loanRecordId
    );
}

// Update loan record
loan.Box_Workspace_Folder_ID__c = newFolderId;
update loan;

System.debug('COMPLETE - Loan ' + loan.Loan_ID__c + ' workspace ready at: https://app.box.com/folder/' + newFolderId);
