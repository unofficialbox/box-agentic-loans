#!/usr/bin/env bash
set -euo pipefail

# Set the Box client id and secret on the LOS_Box external credential (MT-038).
#
#   BOX_CLIENT_ID=<id> BOX_CLIENT_SECRET=<secret> \
#     los-salesforce-project/scripts/configure-los-box-credential.sh <org-alias>
#
# Replaces hand-entering the values in Setup. They are substituted into a temporary
# copy of the .apex file, so no secret is ever written into the working tree, and
# Salesforce stores them encrypted and never returns them.
#
# Prefer passing the secret through the environment rather than typing it inline, so
# it does not land in shell history:
#   read -rs BOX_CLIENT_SECRET && export BOX_CLIENT_SECRET
#
# Both values come from the Box Developer Console app (MT-037).

ORG_ALIAS="${1:-agentforce}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TEMPLATE="${SCRIPT_DIR}/configure-los-box-credential.apex"

if ! command -v sf >/dev/null 2>&1; then
  echo "sf CLI is not installed." >&2
  exit 1
fi

: "${BOX_CLIENT_ID:?set BOX_CLIENT_ID (Box Developer Console -> your app -> Client ID)}"
: "${BOX_CLIENT_SECRET:?set BOX_CLIENT_SECRET (Box Developer Console -> your app -> Client Secret)}"

# Reject characters that would break the sed substitution or smuggle Apex into the
# template. Box client ids and secrets are alphanumeric.
for VAR in BOX_CLIENT_ID BOX_CLIENT_SECRET; do
  VALUE="${!VAR}"
  if ! [[ "${VALUE}" =~ ^[A-Za-z0-9._-]+$ ]]; then
    echo "${VAR} contains unexpected characters; expected letters, digits, dot, underscore or hyphen." >&2
    exit 1
  fi
done

RESOLVED="$(mktemp -t los-box-credential)"
trap 'rm -f "${RESOLVED}"' EXIT
chmod 600 "${RESOLVED}"

sed -e "s|__BOX_CLIENT_ID__|${BOX_CLIENT_ID}|g" \
    -e "s|__BOX_CLIENT_SECRET__|${BOX_CLIENT_SECRET}|g" \
    "${TEMPLATE}" > "${RESOLVED}"

echo "Setting the LOS_Box credential against org: ${ORG_ALIAS}"
sf apex run --target-org "${ORG_ALIAS}" --file "${RESOLVED}"
