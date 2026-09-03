#!/usr/bin/env bash

set -euo pipefail

TARGET_ORG="${1:-}"
INTEGRATION_USERNAME="${LOS_INTEGRATION_USERNAME:-}"
INTEGRATION_EMAIL="${LOS_INTEGRATION_EMAIL:-}"
INTEGRATION_PROFILE="${LOS_INTEGRATION_PROFILE:-Minimum Access - API Only Integrations}"
PERMISSION_SET="LOS_Box_Automate_Integration"

if [[ -z "$TARGET_ORG" || -z "$INTEGRATION_USERNAME" || -z "$INTEGRATION_EMAIL" ]]; then
    cat >&2 <<'EOF'
Usage:
  LOS_INTEGRATION_USERNAME='unique-user@example.com' \
  LOS_INTEGRATION_EMAIL='admin@example.com' \
  ./scripts/configure-los-oauth.sh <salesforce-org-alias>

This creates/reuses the API-only integration user and assigns the LOS permission set.
It does not create External Client App metadata because org scope,
consumer key, callback URL, and Run As user are environment-specific.
EOF
    exit 2
fi

for command in sf jq; do
    command -v "$command" >/dev/null 2>&1 || {
        echo "Required command not found: $command" >&2
        exit 1
    }
done

ORG_JSON="$(sf org display --target-org "$TARGET_ORG" --json)"
ORG_ID="$(jq -r '.result.id // empty' <<<"$ORG_JSON")"
ORG_USERNAME="$(jq -r '.result.username // empty' <<<"$ORG_JSON")"

if [[ -z "$ORG_ID" ]]; then
    echo "Unable to resolve the target Salesforce org." >&2
    exit 1
fi

echo "Target org: $ORG_USERNAME ($ORG_ID)"

PROFILE_ID="$(
    sf data query \
        --target-org "$TARGET_ORG" \
        --query "SELECT Id FROM Profile WHERE Name='${INTEGRATION_PROFILE}' LIMIT 1" \
        --json \
    | jq -r '.result.records[0].Id // empty'
)"

if [[ -z "$PROFILE_ID" ]]; then
    echo "Required integration profile not found: $INTEGRATION_PROFILE" >&2
    exit 1
fi

USER_ID="$(
    sf data query \
        --target-org "$TARGET_ORG" \
        --query "SELECT Id FROM User WHERE Username='${INTEGRATION_USERNAME}' LIMIT 1" \
        --json \
    | jq -r '.result.records[0].Id // empty'
)"

if [[ -z "$USER_ID" ]]; then
    USER_BODY="$(jq -nc \
        --arg username "$INTEGRATION_USERNAME" \
        --arg email "$INTEGRATION_EMAIL" \
        --arg profileId "$PROFILE_ID" \
        '{
            Username: $username,
            FirstName: "Integration",
            LastName: "Box Automate LOS",
            Alias: "boxlos",
            Email: $email,
            TimeZoneSidKey: "America/New_York",
            LocaleSidKey: "en_US",
            EmailEncodingKey: "UTF-8",
            LanguageLocaleKey: "en_US",
            ProfileId: $profileId,
            IsActive: true
        }')"

    USER_ID="$(
        sf api request rest '/services/data/v67.0/sobjects/User' \
            --target-org "$TARGET_ORG" \
            --method POST \
            --header 'Content-Type: application/json' \
            --body "$USER_BODY" \
        | jq -r '.id // empty'
    )"
fi

if [[ -z "$USER_ID" ]]; then
    echo "Salesforce did not return an integration user ID." >&2
    exit 1
fi

ASSIGNMENT_COUNT="$(
    sf data query \
        --target-org "$TARGET_ORG" \
        --query "SELECT COUNT() FROM PermissionSetAssignment WHERE AssigneeId='${USER_ID}' AND PermissionSet.Name='${PERMISSION_SET}'" \
        --json \
    | jq -r '.result.totalSize'
)"

if [[ "$ASSIGNMENT_COUNT" == "0" ]]; then
    sf org assign permset \
        --target-org "$TARGET_ORG" \
        --name "$PERMISSION_SET" \
        --on-behalf-of "$INTEGRATION_USERNAME"
fi

echo "Integration user ready: $INTEGRATION_USERNAME ($USER_ID)"
echo "Next: create the External Client App in this org, select this user as Run As,"
echo "then store its consumer secret only in the Box-managed OAuth connection."
