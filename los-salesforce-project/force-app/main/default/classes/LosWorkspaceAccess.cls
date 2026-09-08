/** Authorization shared by the token and provisioning endpoints. */
public with sharing class LosWorkspaceAccess {
    @TestVisible private static String userTypeOverride;
    @TestVisible private static Id accountOverride;
    @TestVisible private static Boolean directFolderOverride;

    public static Boolean isGuest() {
        return (userTypeOverride == null ? UserInfo.getUserType() : userTypeOverride) == 'Guest';
    }
    public static Id borrowerAccount() {
        if (accountOverride != null) return accountOverride;
        try { return new IdentityReader().account(); }
        catch (QueryException unavailable) { return null; }
    }
    public static Boolean mayNameFolder() {
        if (isGuest() || borrowerAccount() != null) return false;
        return directFolderOverride != null ? directFolderOverride
            : FeatureManagement.checkPermission('LOS_Direct_Box_Folder');
    }
    /** The record query enforces sharing; external users must also match their Contact account. */
    public static LOS_Loan__c loan(Id recordId) {
        if (isGuest() || recordId == null || recordId.getSObjectType() != LOS_Loan__c.SObjectType) return null;
        List<LOS_Loan__c> visible;
        try {
            visible = [SELECT Id, Borrower_Account__c, Status__c FROM LOS_Loan__c WHERE Id = :recordId LIMIT 1];
        } catch (QueryException denied) {
            return null;
        }
        if (visible.isEmpty()) return null;
        Id account = borrowerAccount();
        String userType = userTypeOverride == null ? UserInfo.getUserType() : userTypeOverride;
        if (account != null && visible[0].Borrower_Account__c != account) return null;
        if (account == null && userType != 'Standard') return null;
        return visible[0];
    }
    private without sharing class IdentityReader {
        private Id account() {
            List<Schema.User> users = [SELECT Contact.AccountId FROM User WHERE Id = :UserInfo.getUserId()];
            return users.isEmpty() || users[0].Contact == null ? null : users[0].Contact.AccountId;
        }
    }
}
