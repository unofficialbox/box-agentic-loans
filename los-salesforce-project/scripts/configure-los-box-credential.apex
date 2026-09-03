/*
 * Set the Box client id and secret on the LOS_Box external credential (MT-038).
 * Run with the wrapper, which injects the values so no secret lands in the working tree:
 *   BOX_CLIENT_ID=<id> BOX_CLIENT_SECRET=<secret> \
 *     los-salesforce-project/scripts/configure-los-box-credential.sh <org-alias>
 *
 * This replaces typing the values into Setup by hand. ConnectApi.CredentialInput accepts
 * only AwsSv4 or Custom as an authentication protocol, which is why LOS_Box uses Custom
 * with ClientId/ClientSecret parameters: a Basic principal cannot be populated through
 * the API at all. LosBoxTokenService reads them as
 * {!$Credential.LOS_Box.ClientId} / {!$Credential.LOS_Box.ClientSecret}.
 *
 * Both values are stored with encrypted = true, so Salesforce keeps them encrypted at
 * rest and never returns them -- not to source, not to Apex, not to this script on a
 * later run.
 *
 * Idempotent: createCredential fails when the principal already holds credentials, so an
 * existing principal is updated instead. Rerunning with the same values is a no-op from
 * the caller's perspective.
 *
 * The tokens below are substituted by the wrapper. Running this file directly without
 * substitution aborts instead of writing placeholder text into the org.
 */
String clientId     = '__BOX_CLIENT_ID__';
String appSecret = '__BOX_CLIENT_SECRET__';

final String EXTERNAL_CREDENTIAL = 'LOS_Box';
final String PRINCIPAL_NAME = 'LOS_Box_Principal';

// ---------- Guard: refuse unsubstituted or empty input ----------
for (String raw : new List<String>{ clientId, appSecret }) {
    if (raw.startsWith('__BOX_')) {
        throw new System.IllegalArgumentException(
            'BOX CREDENTIAL: values were not substituted. Run configure-los-box-credential.sh instead of this file.');
    }
}
clientId = clientId.trim();
appSecret = appSecret.trim();
if (String.isBlank(clientId) || String.isBlank(appSecret)) {
    throw new System.IllegalArgumentException('BOX CREDENTIAL: both a client id and a client secret are required.');
}

// ---------- Build the credential payload ----------
Map<String, ConnectApi.CredentialValueInput> values = new Map<String, ConnectApi.CredentialValueInput>();

ConnectApi.CredentialValueInput idValue = new ConnectApi.CredentialValueInput();
idValue.value = clientId;
idValue.encrypted = true;
values.put('ClientId', idValue);

ConnectApi.CredentialValueInput secretValue = new ConnectApi.CredentialValueInput();
secretValue.value = appSecret;
secretValue.encrypted = true;
values.put('ClientSecret', secretValue);

ConnectApi.CredentialInput input = new ConnectApi.CredentialInput();
input.authenticationProtocol = ConnectApi.CredentialAuthenticationProtocol.Custom;
input.externalCredential = EXTERNAL_CREDENTIAL;
input.principalName = PRINCIPAL_NAME;
input.principalType = ConnectApi.CredentialPrincipalType.NamedPrincipal;
input.credentials = values;

// ---------- Create or update ----------
Boolean exists = false;
try {
    ConnectApi.Credential existing = ConnectApi.NamedCredentials.getCredential(
        EXTERNAL_CREDENTIAL, PRINCIPAL_NAME, ConnectApi.CredentialPrincipalType.NamedPrincipal);
    exists = existing != null;
} catch (Exception e) {
    // No credential yet. getCredential throws rather than returning null on a bare principal.
    exists = false;
}

if (exists) {
    ConnectApi.NamedCredentials.updateCredential(input);
} else {
    ConnectApi.NamedCredentials.createCredential(input);
}

// ---------- Report without echoing the values ----------
System.debug(LoggingLevel.INFO, 'BOX CREDENTIAL: ' + (exists ? 'updated' : 'created')
    + ' ' + EXTERNAL_CREDENTIAL + '/' + PRINCIPAL_NAME
    + ' (client id ...' + clientId.right(4) + ', secret set)');
System.debug(LoggingLevel.INFO, 'BOX CREDENTIAL: next, set the CCG subject and folder allowlist: '
    + 'BOX_USER_ID=<id> BOX_ALLOWED_FOLDER_IDS=<id> los-salesforce-project/scripts/configure-los-box-settings.sh <alias>');
