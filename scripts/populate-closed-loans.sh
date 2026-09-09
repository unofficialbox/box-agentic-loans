#!/bin/bash
# Populate closed loan folders with demo documents
set -e

cd "$(dirname "$0")/.."

echo "Populating closed loan folders with documents..."
echo ""

# LN-2023-0311: Harbor Expansion Loan (Closed)
# Folder: 416383268715
echo "=== LN-2023-0311 (Harbor Expansion 2023) ==="
UPLOAD_RESULT=$(box files:upload output/pdf/harborview-loan-agreement-2023-executed.pdf \
  --parent-id 416383268715 \
  --name "Loan Agreement - Executed.pdf" \
  --json)
FILE_ID=$(echo "$UPLOAD_RESULT" | jq -r '.id // empty')

if [ -z "$FILE_ID" ]; then
  # File might already exist, try to find it
  FILE_ID=$(box folders:items 416383268715 --json | jq -r '.entries[] | select(.name=="Loan Agreement - Executed.pdf") | .id')
fi

if [ -n "$FILE_ID" ]; then
  echo "✓ Uploaded executed loan agreement (ID: $FILE_ID)"

  # Apply metadata
  echo "Applying metadata..."
  box files:metadata:create "$FILE_ID" \
    --template-key losDocument \
    --scope enterprise_1023254676 \
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
# Folder: 416381677501
echo "=== LN-2025-0148 (Equipment Finance 2025) ==="
UPLOAD_RESULT=$(box files:upload output/pdf/harborview-loan-agreement-2025-executed.pdf \
  --parent-id 416381677501 \
  --name "Loan Agreement - Executed.pdf" \
  --json)
FILE_ID=$(echo "$UPLOAD_RESULT" | jq -r '.id // empty')

if [ -z "$FILE_ID" ]; then
  # File might already exist, try to find it
  FILE_ID=$(box folders:items 416381677501 --json | jq -r '.entries[] | select(.name=="Loan Agreement - Executed.pdf") | .id')
fi

if [ -n "$FILE_ID" ]; then
  echo "✓ Uploaded executed loan agreement (ID: $FILE_ID)"

  # Apply metadata
  echo "Applying metadata..."
  box files:metadata:create "$FILE_ID" \
    --template-key losDocument \
    --scope enterprise_1023254676 \
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
