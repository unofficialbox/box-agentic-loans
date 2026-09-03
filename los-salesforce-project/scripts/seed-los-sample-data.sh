#!/usr/bin/env bash
set -euo pipefail

ORG_ALIAS="${1:-agentforce}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

if ! command -v sf >/dev/null 2>&1; then
  echo "sf CLI is not installed." >&2
  exit 1
fi

echo "Running LOS Salesforce sample-data seed against org: ${ORG_ALIAS}"
sf apex run --target-org "${ORG_ALIAS}" --file "${SCRIPT_DIR}/seed-los-salesforce-sample-data.apex"
