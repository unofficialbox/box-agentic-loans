/*
 * Seed each loan's Opportunity Box folder with its loan document.
 * Run AFTER seed-los-salesforce-sample-data.apex (records + per-loan Opportunities must exist).
 *   sf apex run --target-org <alias> --file los-salesforce-project/scripts/seed-los-loan-files.apex
 *
 * Each LOS_Loan__c links to its own Opportunity, and Opportunity is the Box-mapped object, so
 * the file is uploaded into the loan's Opportunity Box folder. For each loan, enqueues
 * BoxEmailAttachmentUploader (resolves/creates the Opportunity's Box folder via box.Toolkit, then
 * uploads the file: preflight + version-if-exists). Bytes come from packaged Static Resources.
 *
 * Prior years get their EXECUTED loan agreement PDF; the current year gets the borrower's
 * marked-up term sheet in Word. Uploads run asynchronously in Queueables.
 *
 * Not yet run against a live org for the loans variant; the CLM predecessor proved the same
 * code path live.
 */
Map<String, String> fileByLoan = new Map<String, String>{
    'LN-2023-0311' => 'Los_Sample_Loan_2023_Executed:dockwright-loan-agreement-2023-executed.pdf',
    'LN-2025-0148' => 'Los_Sample_Loan_2025_Executed:dockwright-loan-agreement-2025-executed.pdf',
    'LN-2026-0042' => 'Los_Sample_Term_Sheet_2026_Markup:dockwright-term-sheet-2026-markup.docx'
};

// Upload into the loan's Opportunity Box folder (Opportunity is the Box-mapped object).
Map<String, Id> oppIdByLoan = new Map<String, Id>();
for (LOS_Loan__c loan : [SELECT Loan_ID__c, Opportunity__c FROM LOS_Loan__c WHERE Loan_ID__c IN :fileByLoan.keySet()]) {
    if (loan.Opportunity__c != null) {
        oppIdByLoan.put(loan.Loan_ID__c, loan.Opportunity__c);
    }
}

Set<String> resourceNames = new Set<String>();
for (String spec : fileByLoan.values()) {
    resourceNames.add(spec.substringBefore(':'));
}
Map<String, Blob> bodyByResource = new Map<String, Blob>();
for (StaticResource sr : [SELECT Name, Body FROM StaticResource WHERE Name IN :resourceNames]) {
    bodyByResource.put(sr.Name, sr.Body);
}

Integer enqueued = 0;
for (String loanExternalId : fileByLoan.keySet()) {
    Id oppId = oppIdByLoan.get(loanExternalId);
    if (oppId == null) {
        System.debug(LoggingLevel.WARN, 'LOAN FILES: no Opportunity for ' + loanExternalId + ' (seed records first)');
        continue;
    }
    String spec = fileByLoan.get(loanExternalId);
    String resourceName = spec.substringBefore(':');
    String fileName = spec.substringAfter(':');
    Blob body = bodyByResource.get(resourceName);
    if (body == null) {
        System.debug(LoggingLevel.WARN, 'LOAN FILES: no static resource ' + resourceName);
        continue;
    }
    List<BoxEmailAttachmentUploader.Attachment> attachments = new List<BoxEmailAttachmentUploader.Attachment>{
        new BoxEmailAttachmentUploader.Attachment(fileName, EncodingUtil.base64Encode(body))
    };
    System.enqueueJob(new BoxEmailAttachmentUploader(oppId, attachments));
    enqueued++;
}
System.debug(LoggingLevel.INFO, 'LOAN FILES: enqueued ' + enqueued + ' upload job(s)');
