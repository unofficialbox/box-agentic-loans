#!/usr/bin/env bash
set -euo pipefail

# Upload each LOS_Loan__c record's loan document into its Box folder.
# Run AFTER seed-los-sample-data.sh, and after deploying the Los_Sample_Loan_* and
# Los_Sample_Term_Sheet_* static resources.

ORG_ALIAS="${1:-agentforce}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

if ! command -v sf >/dev/null 2>&1; then
  echo "sf CLI is not installed." >&2
  exit 1
fi

echo "Uploading LOS loan files into Box record folders against org: ${ORG_ALIAS}"
sf apex run --target-org "${ORG_ALIAS}" --file "${SCRIPT_DIR}/seed-los-loan-files.apex"
