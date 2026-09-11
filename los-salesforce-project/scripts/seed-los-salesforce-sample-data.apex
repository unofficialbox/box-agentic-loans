// Seed sample Salesforce records for the LOS demo.
// Idempotent by keys:
// - Accounts by Name
// - Contacts by Email
// - Opportunities by Name + AccountId
// - Loans by Loan_ID__c
//
// Values mirror ../sample-data/los-sample-records.bcl and DOMAIN-MAPPING section 2.

final String DOCKWRIGHT = 'Dockwright Logistics';
final String PINECREST = 'Pinecrest Dental Group';
final String DOCKWRIGHT_CONTACT = 'kadams@boxdemo.com';
final String PINECREST_CONTACT = 'sarah.kim@pinecrestdental.example';
final String OPP_2023 = 'Dockwright Working Capital Line 2023';
final String OPP_2025 = 'Dockwright Fleet Expansion 2025';
final String OPP_2026 = 'Dockwright Logistics - Distribution Facility Acquisition';
final String OPP_PINECREST = 'Pinecrest Dental Practice Expansion 2026';

// ---------- Accounts ----------
Map<String, Account> accountsByName = new Map<String, Account>();
for (Account acct : [SELECT Id, Name FROM Account WHERE Name IN :new List<String>{ DOCKWRIGHT, PINECREST }]) {
    accountsByName.put(acct.Name, acct);
}

Integer accountsCreated = 0;
List<Account> accountsToInsert = new List<Account>();
if (!accountsByName.containsKey(DOCKWRIGHT)) {
    accountsToInsert.add(new Account(
        Name = DOCKWRIGHT,
        Industry = 'Transportation',
        Phone = '(617) 555-0101',
        Website = 'https://www.dockwrightlogistics.example'
    ));
}
if (!accountsByName.containsKey(PINECREST)) {
    accountsToInsert.add(new Account(
        Name = PINECREST,
        Industry = 'Healthcare',
        Phone = '(704) 555-0102',
        Website = 'https://www.pinecrestdental.example'
    ));
}
if (!accountsToInsert.isEmpty()) {
    insert accountsToInsert;
    accountsCreated += accountsToInsert.size();
}

accountsByName.clear();
for (Account acct : [SELECT Id, Name FROM Account WHERE Name IN :new List<String>{ DOCKWRIGHT, PINECREST }]) {
    accountsByName.put(acct.Name, acct);
}

// ---------- Contacts ----------
Map<String, Contact> contactsByEmail = new Map<String, Contact>();
for (Contact c : [SELECT Id, Email FROM Contact WHERE Email IN :new List<String>{ DOCKWRIGHT_CONTACT, PINECREST_CONTACT }]) {
    contactsByEmail.put(c.Email, c);
}

Integer contactsCreated = 0;
List<Contact> contactsToInsert = new List<Contact>();
if (!contactsByEmail.containsKey(DOCKWRIGHT_CONTACT)) {
    contactsToInsert.add(new Contact(
        FirstName = 'Jordan',
        LastName = 'Pike',
        Title = 'Chief Financial Officer',
        Email = DOCKWRIGHT_CONTACT,
        AccountId = accountsByName.get(DOCKWRIGHT).Id
    ));
}
if (!contactsByEmail.containsKey(PINECREST_CONTACT)) {
    contactsToInsert.add(new Contact(
        FirstName = 'Sarah',
        LastName = 'Kim',
        Email = PINECREST_CONTACT,
        AccountId = accountsByName.get(PINECREST).Id
    ));
}
if (!contactsToInsert.isEmpty()) {
    insert contactsToInsert;
    contactsCreated += contactsToInsert.size();
}

// ---------- Opportunities ----------
List<String> opportunityNames = new List<String>{ OPP_2023, OPP_2025, OPP_2026, OPP_PINECREST };
Map<String, Opportunity> opportunitiesByKey = new Map<String, Opportunity>();
for (Opportunity opp : [SELECT Id, Name, AccountId FROM Opportunity WHERE Name IN :opportunityNames]) {
    opportunitiesByKey.put(opp.Name + '|' + opp.AccountId, opp);
}

Integer opportunitiesCreated = 0;
List<Opportunity> opportunitiesToInsert = new List<Opportunity>();

String opp2023Key = OPP_2023 + '|' + accountsByName.get(DOCKWRIGHT).Id;
String opp2025Key = OPP_2025 + '|' + accountsByName.get(DOCKWRIGHT).Id;
String opp2026Key = OPP_2026 + '|' + accountsByName.get(DOCKWRIGHT).Id;
String oppPinecrestKey = OPP_PINECREST + '|' + accountsByName.get(PINECREST).Id;

if (!opportunitiesByKey.containsKey(opp2023Key)) {
    opportunitiesToInsert.add(new Opportunity(
        Name = OPP_2023,
        AccountId = accountsByName.get(DOCKWRIGHT).Id,
        Amount = 1500000,
        CloseDate = Date.newInstance(2023, 9, 15),
        StageName = 'Closed Won'
    ));
}
if (!opportunitiesByKey.containsKey(opp2025Key)) {
    opportunitiesToInsert.add(new Opportunity(
        Name = OPP_2025,
        AccountId = accountsByName.get(DOCKWRIGHT).Id,
        Amount = 2150000,
        CloseDate = Date.newInstance(2025, 5, 20),
        StageName = 'Closed Won'
    ));
}
if (!opportunitiesByKey.containsKey(opp2026Key)) {
    opportunitiesToInsert.add(new Opportunity(
        Name = OPP_2026,
        AccountId = accountsByName.get(DOCKWRIGHT).Id,
        Amount = 4800000,
        CloseDate = Date.today().addMonths(4),
        StageName = 'Proposal/Price Quote'
    ));
}
if (!opportunitiesByKey.containsKey(oppPinecrestKey)) {
    opportunitiesToInsert.add(new Opportunity(
        Name = OPP_PINECREST,
        AccountId = accountsByName.get(PINECREST).Id,
        Amount = 650000,
        CloseDate = Date.today().addMonths(6),
        StageName = 'Qualification'
    ));
}
if (!opportunitiesToInsert.isEmpty()) {
    insert opportunitiesToInsert;
    opportunitiesCreated += opportunitiesToInsert.size();
}

opportunitiesByKey.clear();
for (Opportunity opp : [SELECT Id, Name, AccountId FROM Opportunity WHERE Name IN :opportunityNames]) {
    opportunitiesByKey.put(opp.Name + '|' + opp.AccountId, opp);
}

// ---------- Loans ----------
List<String> loanIds = new List<String>{ 'LN-2023-0311', 'LN-2025-0148', 'LN-2026-0042', 'LN-2026-0088' };
Map<String, LOS_Loan__c> loansByLoanId = new Map<String, LOS_Loan__c>();
for (LOS_Loan__c loan : [SELECT Id, Loan_ID__c FROM LOS_Loan__c WHERE Loan_ID__c IN :loanIds]) {
    loansByLoanId.put(loan.Loan_ID__c, loan);
}

Integer loansCreated = 0;
Integer loansUpdated = 0;
List<LOS_Loan__c> loansToInsert = new List<LOS_Loan__c>();
List<LOS_Loan__c> loansToUpdate = new List<LOS_Loan__c>();

// Prior executed Dockwright loans (loan history for the same borrower). Both carry the
// negotiated Schedule 1 covenants: 70% LTV and a 1.30x DSCR test, which is the precedent
// the 2026 markup regresses.
LOS_Loan__c loan2023 = loansByLoanId.get('LN-2023-0311');
if (loan2023 == null) {
    loan2023 = new LOS_Loan__c(Loan_ID__c = 'LN-2023-0311');
    loansToInsert.add(loan2023);
} else {
    loansToUpdate.add(loan2023);
}
loan2023.Name = 'Dockwright Logistics Revolving Line of Credit 2023';
loan2023.Borrower__c = DOCKWRIGHT;
loan2023.Borrower_Account__c = accountsByName.get(DOCKWRIGHT).Id;
loan2023.Opportunity__c = opportunitiesByKey.get(opp2023Key).Id;
loan2023.Loan_Type__c = 'Line of Credit';
loan2023.Status__c = 'Closed';
loan2023.Loan_Amount__c = 1500000;
loan2023.Term_Months__c = 36;
loan2023.Interest_Rate__c = 7.25;
loan2023.LTV__c = 70;
loan2023.DSCR__c = 1.34;
loan2023.Collateral_Value__c = 2150000;
loan2023.Maturity_Date__c = Date.newInstance(2026, 9, 30);
loan2023.Region__c = 'Northeast';
loan2023.Collateral_Type__c = 'Receivables';
loan2023.Target_Closing_Date__c = Date.newInstance(2023, 9, 15);
loan2023.Applicant_Name__c = 'Jordan Pike';
loan2023.Applicant_Email__c = DOCKWRIGHT_CONTACT;
loan2023.Loan_Officer_Name__c = 'Alex Bennett';
loan2023.Record_Source__c = 'Manual';
loan2023.Risk_Rating__c = 'Low';
loan2023.Underwriting_Notes__c = 'Executed prior-year line of credit; retained for demo loan history. Schedule 1: LTV 70% maximum, DSCR 1.30x tested quarterly.';

LOS_Loan__c loan2025 = loansByLoanId.get('LN-2025-0148');
if (loan2025 == null) {
    loan2025 = new LOS_Loan__c(Loan_ID__c = 'LN-2025-0148');
    loansToInsert.add(loan2025);
} else {
    loansToUpdate.add(loan2025);
}
loan2025.Name = 'Dockwright Logistics Equipment Term Loan 2025';
loan2025.Borrower__c = DOCKWRIGHT;
loan2025.Borrower_Account__c = accountsByName.get(DOCKWRIGHT).Id;
loan2025.Opportunity__c = opportunitiesByKey.get(opp2025Key).Id;
loan2025.Loan_Type__c = 'Equipment Finance';
loan2025.Status__c = 'Closed';
loan2025.Loan_Amount__c = 2150000;
loan2025.Term_Months__c = 60;
loan2025.Interest_Rate__c = 6.95;
loan2025.LTV__c = 70;
loan2025.DSCR__c = 1.31;
loan2025.Collateral_Value__c = 3075000;
loan2025.Maturity_Date__c = Date.newInstance(2030, 5, 31);
loan2025.Region__c = 'Northeast';
loan2025.Collateral_Type__c = 'Equipment';
loan2025.Target_Closing_Date__c = Date.newInstance(2025, 5, 20);
loan2025.Applicant_Name__c = 'Jordan Pike';
loan2025.Applicant_Email__c = DOCKWRIGHT_CONTACT;
loan2025.Loan_Officer_Name__c = 'Alex Bennett';
loan2025.Record_Source__c = 'Manual';
loan2025.Risk_Rating__c = 'Low';
loan2025.Underwriting_Notes__c = 'Executed prior-year equipment term loan; retained for demo loan history. Schedule 1 carried forward: LTV 70% maximum, DSCR 1.30x tested quarterly.';

// The current deal: the application is in underwriting and the appraisal came in below
// the borrower-stated value, so LTV and DSCR sit outside even the approved exception.
LOS_Loan__c loan2026 = loansByLoanId.get('LN-2026-0042');
if (loan2026 == null) {
    loan2026 = new LOS_Loan__c(Loan_ID__c = 'LN-2026-0042');
    loansToInsert.add(loan2026);
} else {
    loansToUpdate.add(loan2026);
}
loan2026.Name = 'Dockwright Logistics Distribution Facility Loan 2026';
loan2026.Borrower__c = DOCKWRIGHT;
loan2026.Borrower_Account__c = accountsByName.get(DOCKWRIGHT).Id;
loan2026.Borrower_Entity__c = 'Dockwright Logistics Holdings LLC';
loan2026.Opportunity__c = opportunitiesByKey.get(opp2026Key).Id;
loan2026.Loan_Type__c = 'Commercial Real Estate';
loan2026.Status__c = 'Underwriting';
loan2026.Loan_Amount__c = 4800000;
loan2026.Term_Months__c = 120;
loan2026.Interest_Rate__c = 6.85;
loan2026.LTV__c = 85;
loan2026.DSCR__c = 1.12;
loan2026.Collateral_Value__c = 5650000;
loan2026.Maturity_Date__c = null;
loan2026.Region__c = 'Northeast';
loan2026.Collateral_Type__c = 'Real Estate';
loan2026.Target_Closing_Date__c = Date.today().addMonths(4);
loan2026.Applicant_Name__c = 'Jordan Pike';
loan2026.Applicant_Email__c = DOCKWRIGHT_CONTACT;
loan2026.Loan_Officer_Name__c = 'Alex Bennett';
loan2026.Record_Source__c = 'Manual';
loan2026.Risk_Rating__c = 'High';
loan2026.Underwriting_Notes__c = 'Appraisal came in at $5,650,000 against a stated $6,000,000: LTV 85% and DSCR 1.12x, outside LOS-LTV-002 and LOS-DSCR-002. Borrower markup weakens the DSCR test in Section 9.3 and adds FF&E to Schedule A. Owned by Credit Risk.';

LOS_Loan__c loanPinecrest = loansByLoanId.get('LN-2026-0088');
if (loanPinecrest == null) {
    loanPinecrest = new LOS_Loan__c(Loan_ID__c = 'LN-2026-0088');
    loansToInsert.add(loanPinecrest);
} else {
    loansToUpdate.add(loanPinecrest);
}
loanPinecrest.Name = 'Pinecrest Dental Group Practice Expansion 2026';
loanPinecrest.Borrower__c = PINECREST;
loanPinecrest.Borrower_Account__c = accountsByName.get(PINECREST).Id;
loanPinecrest.Opportunity__c = opportunitiesByKey.get(oppPinecrestKey).Id;
loanPinecrest.Loan_Type__c = 'SBA 7(a)';
loanPinecrest.Status__c = 'Application';
loanPinecrest.Loan_Amount__c = 650000;
loanPinecrest.Term_Months__c = 120;
loanPinecrest.Interest_Rate__c = 8.10;
loanPinecrest.LTV__c = null;
loanPinecrest.DSCR__c = null;
loanPinecrest.Collateral_Value__c = null;
loanPinecrest.Maturity_Date__c = null;
loanPinecrest.Region__c = 'Southeast';
loanPinecrest.Collateral_Type__c = 'None';
loanPinecrest.Target_Closing_Date__c = Date.today().addMonths(6);
loanPinecrest.Applicant_Name__c = 'Sarah Kim';
loanPinecrest.Applicant_Email__c = PINECREST_CONTACT;
loanPinecrest.Loan_Officer_Name__c = 'Alex Bennett';
loanPinecrest.Record_Source__c = 'Manual';
loanPinecrest.Risk_Rating__c = 'Medium';
loanPinecrest.Underwriting_Notes__c = 'Sample loan record for demo use only. Application received; financial statements pending.';

if (!loansToInsert.isEmpty()) {
    insert loansToInsert;
    loansCreated += loansToInsert.size();
}
if (!loansToUpdate.isEmpty()) {
    update loansToUpdate;
    loansUpdated += loansToUpdate.size();
}

System.debug(LoggingLevel.INFO, 'SEED COMPLETE accounts new=' + accountsCreated + ' contacts new=' + contactsCreated + ' opportunities new=' + opportunitiesCreated + ' loans new=' + loansCreated + ' loans updated=' + loansUpdated);
System.debug(LoggingLevel.INFO, 'SEED IDS: ' +
    'account.Dockwright=' + accountsByName.get(DOCKWRIGHT).Id +
    ', account.Pinecrest=' + accountsByName.get(PINECREST).Id +
    ', opp.Dockwright2026=' + opportunitiesByKey.get(opp2026Key).Id +
    ', opp.Pinecrest=' + opportunitiesByKey.get(oppPinecrestKey).Id +
    ', loan.LN-2026-0042=' + (loan2026.Id == null ? 'pending_insert' : loan2026.Id) +
    ', loan.LN-2026-0088=' + (loanPinecrest.Id == null ? 'pending_insert' : loanPinecrest.Id));
