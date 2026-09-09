# Multiple Demo Instance Support

This guide explains how to create and manage multiple demo workspace instances for parallel presentations or testing.

## Architecture

**Single Org, Multiple Workspaces:**
- One Salesforce org with multiple Box workspace folders
- Each workspace is a complete `LOS-2026-Harborview` demo environment
- Each loan record points to its specific workspace folder
- All workspaces are registered in `LOS_Box_Config__c.Allowed_Folder_Ids__c`

**Current Instances:**
- Workspace 1: `416352496139` → Loan `LN-2026-0042`
- Workspace 2: `416380062104` → (add loan as needed)

## Create a New Demo Instance

### 1. Create Box Workspace

Use the bootstrap script to create a new workspace:

```bash
# Option A: Run full bootstrap (creates new workspace + metadata)
python3 scripts/demo_operator.py box-foundation --dry-run
python3 scripts/demo_operator.py box-foundation --yes

# Option B: Manually copy existing workspace in Box UI
# Copy "LOS-2026-Harborview" folder, rename to "LOS-2026-Harborview-Demo2"
# Note the new folder ID
```

### 2. Create Loan Record (Optional)

If you need a new loan for this instance:

```bash
# Seed a new loan record
# Edit los-salesforce-project/scripts/apex/seed-sample-loan.apex
# Update Loan_ID__c and other fields
sf apex run --file los-salesforce-project/scripts/apex/seed-sample-loan.apex --target-org <alias>
```

### 3. Link Workspace to Loan

Use the helper script:

```bash
./scripts/add-demo-instance.sh <alias> <box-folder-id> <loan-id>

# Example:
./scripts/add-demo-instance.sh agentforce 416380062104 LN-2026-0088
```

This script:
1. Adds the folder to `LOS_Box_Config__c.Allowed_Folder_Ids__c`
2. Sets `LOS_Loan__c.Box_Workspace_Folder_ID__c`
3. Creates/updates `box__FRUP__c` record

### 4. Verify Access

```bash
# Test Box Toolkit can read the folder
cat > /tmp/test-folder.apex <<EOF
box.Folder contents = new box.Toolkit().getFolderContents('<folder-id>');
System.debug('Found ' + contents.entries.size() + ' items');
EOF
sf apex run --file /tmp/test-folder.apex --target-org <alias>
```

### 5. Reconnect MCP Clients

**Claude Desktop:**
1. Disconnect "LOS Loan Tools" connector
2. Reconnect (picks up new allowed folders)

**Box Connector:**
- No reconnect needed (uses Box OAuth directly)

## Portfolio Search Across Instances

**Note:**
`LOS_Box_Config__c.Loans_Root_Folder_Id__c` points to one folder, but Box MCP `query_metadata` searches enterprise-wide by default (can scope to folder if needed).

**Options:**
1. **Single Root:** Set `Loans_Root_Folder_Id__c` to one workspace (current approach)
   - Portfolio search covers only that workspace
   - Other workspaces accessible via direct loan queries

2. **Parent Root:** Create a parent folder containing all workspaces
   - Set `Loans_Root_Folder_Id__c` to parent folder ID
   - Portfolio search covers all workspaces
   - Requires restructuring folders

3. **Per-Instance:** Accept that portfolio search is per-workspace
   - Each presenter uses their workspace folder as the root
   - Update `Loans_Root_Folder_Id__c` before demo (or have presenters use different orgs)

**Recommended for multi-presenter scenarios:**
Use separate Salesforce orgs (one per presenter) if portfolio-wide search is needed. Otherwise, use single org with workspace-scoped searches.

## Current Configuration

```sql
-- View current config
SELECT Box_User_Id__c, Enterprise_Id__c, Allowed_Folder_Ids__c, Loans_Root_Folder_Id__c 
FROM LOS_Box_Config__c LIMIT 1;

-- View all workspace mappings
SELECT Loan_ID__c, Borrower__c, Box_Workspace_Folder_ID__c 
FROM LOS_Loan__c 
WHERE Box_Workspace_Folder_ID__c != null;
```

## Reset/Cleanup

To remove a demo instance:

```bash
# 1. Remove folder from allowed list (manually edit LOS_Box_Config__c)
# 2. Unlink loan
sf data update record --sobject LOS_Loan__c --record-id <id> --values "Box_Workspace_Folder_ID__c=''"
# 3. Delete box__FRUP__c record
sf data delete record --sobject box__FRUP__c --record-id <id>
# 4. Archive or delete Box folder
```

## Troubleshooting

**"Box did not return the contents":**
- Box service account needs collaborator access to the folder
- Check `box.Toolkit().getFolderContents()` can read it

**"Folder not allowed":**
- Add folder ID to `LOS_Box_Config__c.Allowed_Folder_Ids__c`
- Reconnect MCP connector

**Portfolio search finds nothing:**
- Check `Loans_Root_Folder_Id__c` points to correct folder
- Verify metadata is seeded on documents
- Confirm Enterprise_Id__c is set
