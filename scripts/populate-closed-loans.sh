#!/bin/bash
# Populate closed loan folders with demo documents
set -e
: "${LOS_2023_FOLDER_ID:?Set the confirmed 2023 loan folder ID}"
: "${LOS_2025_FOLDER_ID:?Set the confirmed 2025 loan folder ID}"
: "${LOS_BOX_ENTERPRISE_ID:?Set the confirmed Box enterprise ID}"

cd "$(dirname "$0")/.."

echo "Populating closed loan folders with documents..."
echo ""

# LN-2023-0311: Harbor Expansion Loan (Closed)
# Folder: "${LOS_2023_FOLDER_ID}"
echo "=== LN-2023-0311 (Harbor Expansion 2023) ==="
UPLOAD_RESULT=$(box files:upload output/pdf/dockwright-loan-agreement-2023-executed.pdf \
  --parent-id "${LOS_2023_FOLDER_ID}" \
  --name "Loan Agreement - Executed.pdf" \
  --json)
FILE_ID=$(echo "$UPLOAD_RESULT" | jq -r '.id // empty')

if [ -z "$FILE_ID" ]; then
  # File might already exist, try to find it
  FILE_ID=$(box folders:items "${LOS_2023_FOLDER_ID}" --json | jq -r '.entries[] | select(.name=="Loan Agreement - Executed.pdf") | .id')
fi

if [ -n "$FILE_ID" ]; then
  echo "✓ Uploaded executed loan agreement (ID: $FILE_ID)"

  # Apply metadata
  echo "Applying metadata..."
  box files:metadata:create "$FILE_ID" \
    --template-key losDocument \
    --scope "enterprise_${LOS_BOX_ENTERPRISE_ID}" \
    --data documentType="Loan Agreement" \
    --data versionStatus="Executed" \
    --data policyRisk="Low" \
    --data aiSummaryStatus="Complete" \
    --data approvalStatus="Approved" \
    --data signatureStatus="Signed" \
    --yes 2>&1 || echo "  (metadata may already exist)"
  echo "✓ Applied metadata"
else
  echo "✗ Failed to get file ID"
fi

echo ""

# LN-2025-0148: Equipment Finance Loan (Closed)
# Folder: "${LOS_2025_FOLDER_ID}"
echo "=== LN-2025-0148 (Equipment Finance 2025) ==="
UPLOAD_RESULT=$(box files:upload output/pdf/dockwright-loan-agreement-2025-executed.pdf \
  --parent-id "${LOS_2025_FOLDER_ID}" \
  --name "Loan Agreement - Executed.pdf" \
  --json)
FILE_ID=$(echo "$UPLOAD_RESULT" | jq -r '.id // empty')

if [ -z "$FILE_ID" ]; then
  # File might already exist, try to find it
  FILE_ID=$(box folders:items "${LOS_2025_FOLDER_ID}" --json | jq -r '.entries[] | select(.name=="Loan Agreement - Executed.pdf") | .id')
fi

if [ -n "$FILE_ID" ]; then
  echo "✓ Uploaded executed loan agreement (ID: $FILE_ID)"

  # Apply metadata
  echo "Applying metadata..."
  box files:metadata:create "$FILE_ID" \
    --template-key losDocument \
    --scope "enterprise_${LOS_BOX_ENTERPRISE_ID}" \
    --data documentType="Loan Agreement" \
    --data versionStatus="Executed" \
    --data policyRisk="Low" \
    --data aiSummaryStatus="Complete" \
    --data approvalStatus="Approved" \
    --data signatureStatus="Signed" \
    --yes 2>&1 || echo "  (metadata may already exist)"
  echo "✓ Applied metadata"
else
  echo "✗ Failed to get file ID"
fi

echo ""
echo "✅ Closed loan folders populated!"
echo ""
echo "Next: Reconnect LOS Loan Tools MCP connector in Claude Desktop"
