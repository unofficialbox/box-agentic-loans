#!/usr/bin/env bash
set -euo pipefail

# Set the non-secret Box settings on the LOS Box Config org default (MT-039).
# The Box client id and secret are NOT set here -- they belong on the LOS_Box
# external credential in Setup (MT-038) and never pass through this repository.
#
#   BOX_USER_ID=<id> BOX_ALLOWED_FOLDER_IDS=<id,id> \
#     los-salesforce-project/scripts/configure-los-box-settings.sh <org-alias>
#
# Set BOX_USER_ID to grant as a Box user (the demo default: the token inherits
# that user's access, so no folder collaboration is needed), or BOX_ENTERPRISE_ID
# to grant a Service Account token (which must be collaborated onto the folder).
# If both are set the user wins, matching LosBoxTokenService.
#
# Values are substituted into a temporary copy of the .apex file, so no live
# identifier is ever written into the working tree.
#
# Find the user id with:       box users:get --fields=id,login
# Find the enterprise id with: box users:get --fields=enterprise
# Find folder ids with:        box folders:items 0 --fields=id,name,type

ORG_ALIAS="${1:-agentforce}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TEMPLATE="${SCRIPT_DIR}/configure-los-box-settings.apex"

if ! command -v sf >/dev/null 2>&1; then
  echo "sf CLI is not installed." >&2
  exit 1
fi

BOX_USER_ID="${BOX_USER_ID:-}"
BOX_ENTERPRISE_ID="${BOX_ENTERPRISE_ID:-}"
BOX_ALLOWED_FOLDER_IDS="${BOX_ALLOWED_FOLDER_IDS:-}"

if [[ -z "${BOX_USER_ID}" && -z "${BOX_ENTERPRISE_ID}" ]]; then
  echo "Set BOX_USER_ID (preferred) or BOX_ENTERPRISE_ID." >&2
  echo "  BOX_USER_ID:       box users:get --fields=id,login" >&2
  echo "  BOX_ENTERPRISE_ID: box users:get --fields=enterprise" >&2
  exit 1
fi

# Validate here as well as in Apex: it fails in a second instead of a round trip,
# and it guarantees the substituted text cannot contain sed metacharacters.
for VAR in BOX_USER_ID BOX_ENTERPRISE_ID; do
  VALUE="${!VAR}"
  if [[ -n "${VALUE}" ]] && ! [[ "${VALUE}" =~ ^[0-9]+$ ]]; then
    echo "${VAR} must be numeric." >&2
    exit 1
  fi
done
if [[ -n "${BOX_ALLOWED_FOLDER_IDS}" ]] && ! [[ "${BOX_ALLOWED_FOLDER_IDS}" =~ ^[0-9]+(,[0-9]+)*$ ]]; then
  echo "BOX_ALLOWED_FOLDER_IDS must be a comma-separated list of numeric folder ids." >&2
  exit 1
fi
if [[ -z "${BOX_ALLOWED_FOLDER_IDS}" ]]; then
  echo "Warning: BOX_ALLOWED_FOLDER_IDS is empty, which allows the endpoint to mint a token for ANY folder." >&2
fi
if [[ -n "${BOX_USER_ID}" && -n "${BOX_ENTERPRISE_ID}" ]]; then
  echo "Warning: both BOX_USER_ID and BOX_ENTERPRISE_ID are set; the user subject wins." >&2
fi

RESOLVED="$(mktemp -t los-box-settings)"
trap 'rm -f "${RESOLVED}"' EXIT
chmod 600 "${RESOLVED}"

sed -e "s|__BOX_USER_ID__|${BOX_USER_ID}|g" \
    -e "s|__BOX_ENTERPRISE_ID__|${BOX_ENTERPRISE_ID}|g" \
    -e "s|__BOX_ALLOWED_FOLDER_IDS__|${BOX_ALLOWED_FOLDER_IDS}|g" \
    "${TEMPLATE}" > "${RESOLVED}"

echo "Setting LOS Box Config org defaults against org: ${ORG_ALIAS}"
sf apex run --target-org "${ORG_ALIAS}" --file "${RESOLVED}"
