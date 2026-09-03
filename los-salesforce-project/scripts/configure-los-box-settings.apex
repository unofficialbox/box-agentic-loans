/*
 * Create or update the LOS Box Config org-default record (MT-039).
 * Run with the wrapper, which injects the values so no live ID lands in the working tree:
 *   BOX_USER_ID=<id> BOX_ALLOWED_FOLDER_IDS=<id,id> \
 *     los-salesforce-project/scripts/configure-los-box-settings.sh <org-alias>
 *
 * LosBoxTokenService reads LOS_Box_Config__c.getOrgDefaults() on every request and
 * returns box_not_configured (503) until a CCG subject is set, so this is the gate that
 * makes the downscoped-token endpoint reachable at all. It sets only the non-secret half
 * of the configuration -- the Box client id and secret belong on the LOS_Box external
 * credential (MT-038) and are never touched here.
 *
 * Subject choice. BOX_USER_ID grants as that Box user, so the token inherits access the
 * user already has and no folder collaboration is needed; this is the demo default.
 * BOX_ENTERPRISE_ID instead grants a Service Account token, whose root starts empty, so
 * the service identity must be collaborated onto the folder. Set one. If both are set the
 * user wins, matching LosBoxTokenService.
 *
 * Idempotent by the org-default record: reruns update the same row rather than adding
 * one, and report whether anything actually changed.
 *
 * The tokens below are substituted by the wrapper. Running this file directly without
 * substitution aborts instead of writing placeholder text into the org.
 */
String boxUserId        = '__BOX_USER_ID__';
String enterpriseId     = '__BOX_ENTERPRISE_ID__';
String allowedFolderIds = '__BOX_ALLOWED_FOLDER_IDS__';

// ---------- Guard: refuse unsubstituted input ----------
for (String raw : new List<String>{ boxUserId, enterpriseId, allowedFolderIds }) {
    if (raw.startsWith('__BOX_')) {
        throw new System.IllegalArgumentException(
            'BOX CONFIG: values were not substituted. Run configure-los-box-settings.sh instead of this file.');
    }
}

// ---------- Validate against what the endpoint and the fields will accept ----------
boxUserId = boxUserId.trim();
enterpriseId = enterpriseId.trim();

if (String.isBlank(boxUserId) && String.isBlank(enterpriseId)) {
    throw new System.IllegalArgumentException(
        'BOX CONFIG: set a Box user id or an enterprise id; without one the endpoint returns box_not_configured.');
}
if (String.isNotBlank(boxUserId) && !boxUserId.isNumeric()) {
    throw new System.IllegalArgumentException('BOX CONFIG: Box user id must be numeric.');
}
if (String.isNotBlank(enterpriseId) && !enterpriseId.isNumeric()) {
    throw new System.IllegalArgumentException('BOX CONFIG: enterprise id must be numeric.');
}
if (boxUserId.length() > 64 || enterpriseId.length() > 64) {
    throw new System.IllegalArgumentException('BOX CONFIG: subject id exceeds the 64-character field length.');
}

// Normalize the allowlist so stored values match the numeric folder ids the endpoint
// compares against. LosBoxTokenService trims each entry, but a non-numeric entry would
// be dead weight: such a folderId is rejected by isNumeric() before the list is consulted.
List<String> normalizedFolderIds = new List<String>();
for (String candidate : allowedFolderIds.split(',')) {
    String folderId = candidate.trim();
    if (String.isBlank(folderId)) {
        continue;
    }
    if (!folderId.isNumeric()) {
        throw new System.IllegalArgumentException(
            'BOX CONFIG: allowlist entry "' + folderId + '" is not numeric; the endpoint rejects non-numeric folder ids with invalid_folder_id.');
    }
    normalizedFolderIds.add(folderId);
}
String normalizedAllowlist = String.join(normalizedFolderIds, ',');
if (normalizedAllowlist.length() > 255) {
    throw new System.IllegalArgumentException('BOX CONFIG: folder allowlist exceeds the 255-character field length.');
}

// ---------- Upsert the org default ----------
LOS_Box_Config__c config = LOS_Box_Config__c.getOrgDefaults();
if (config == null) {
    config = new LOS_Box_Config__c();
}
Boolean creating = config.Id == null;
if (creating) {
    config.SetupOwnerId = UserInfo.getOrganizationId();
}

Boolean changed = creating
    || boxUserId != (config.Box_User_Id__c == null ? '' : config.Box_User_Id__c)
    || enterpriseId != (config.Enterprise_Id__c == null ? '' : config.Enterprise_Id__c)
    || normalizedAllowlist != (config.Allowed_Folder_Ids__c == null ? '' : config.Allowed_Folder_Ids__c);

config.Box_User_Id__c = boxUserId;
config.Enterprise_Id__c = enterpriseId;
config.Allowed_Folder_Ids__c = normalizedAllowlist;
upsert config;

// ---------- Report without echoing the values ----------
String subjectType = String.isNotBlank(boxUserId) ? 'user' : 'enterprise';
String subjectId = String.isNotBlank(boxUserId) ? boxUserId : enterpriseId;
String action = creating ? 'created' : (changed ? 'updated' : 'unchanged');
System.debug(LoggingLevel.INFO, 'BOX CONFIG: org-default record ' + action
    + ' (subject ' + subjectType + ' ...' + subjectId.right(4)
    + ', ' + normalizedFolderIds.size() + ' allowed folder id(s))');

if (String.isNotBlank(boxUserId) && String.isNotBlank(enterpriseId)) {
    System.debug(LoggingLevel.WARN, 'BOX CONFIG: both a user id and an enterprise id are set. '
        + 'LosBoxTokenService grants as the user; the enterprise id is unused.');
}
if (normalizedFolderIds.isEmpty()) {
    System.debug(LoggingLevel.WARN, 'BOX CONFIG: the allowlist is empty, which LosBoxTokenService treats as "allow any folder". '
        + 'Populate Allowed Folder Ids to scope the endpoint to the demo workspace.');
}
System.debug(LoggingLevel.INFO, 'BOX CONFIG: next, verify the endpoint: '
    + 'sf api request rest "/services/apexrest/los/box-token?folderId=<box-folder-id>" --target-org <alias>');
