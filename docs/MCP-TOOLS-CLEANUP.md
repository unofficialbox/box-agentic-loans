# MCP Tools Cleanup - 2026-09-08

## Objective

Remove redundant tools from the LOS MCP Server that are now handled more efficiently by Box MCP direct API access.

## Changes Made

### Tools Removed from MCP Server

**1. findDocumentsByRisk** (LosPortfolioSearch)
- **Old:** LOS connector → Salesforce → Box API → metadata query
- **New:** Box MCP → `query_metadata(template="losDocument", query="policyRisk='Critical'")`
- **Why:** Direct API access, faster, no Salesforce round trip

**2. askLoanDocument** (LosBoxAskDocument)
- **Old:** LOS connector → Salesforce → Box AI API
- **New:** Box MCP → `box_ai_ask` with file ID
- **Why:** Direct API access, MCP-first strategy

**3. generateCommitmentLetter** (LosGenerateCommitmentLetter)
- **Old:** LOS connector → Salesforce → Box Doc Gen API
- **New:** Box MCP → `create_document_from_template` with fields
- **Why:** Direct API access, avoids scope issues

### Final MCP Tool List (6 tools)

✅ **Kept:**
1. `listLoans` - Salesforce SOQL queries for portfolio
2. `getLoanPackage` - Resolves loan + folder + documents
3. `extractLoanTerms` - Cross-validates: Box AI + Salesforce record + policy Hub
4. `applyLoanTerms` - Writes to Salesforce (governed)
5. `classifyDocument` - Complete workflow: extract + validate + apply metadata
6. `prepareSignatureRequest` - Box Sign with status enforcement

### Apex Implementation Status

**MCP Server:**
- ✅ Updated `LOSLoanTools.mcpServerDefinition-meta.xml`
- ✅ Removed 3 tool definitions
- ✅ Updated description
- ✅ Deployed to agentforce org

**Apex Classes:**
- ✅ LosPortfolioSearch + Test - Removed from org
- ✅ LosGenerateCommitmentLetter + Test - Removed from org  
- ⚠️  LosBoxAskDocument + Test - **Kept** (still used by Agentforce Copilot)

**Why Keep LosBoxAskDocument:**
The Salesforce Agentforce Copilot (`LOS_Loan_Copilot.agent`) still references this class in its action definition. The Copilot runs inside Salesforce and cannot access Box MCP - it only has access to Apex actions defined in the agent file.

**Two Use Cases:**
1. **Claude Desktop** → Uses Box MCP directly (6 tools exposed)
2. **Salesforce Copilot** → Uses Apex actions (still has ask_box_ai)

## Performance Impact

**Before:**
```
Beat 2 (Risk Search):
LOS findDocumentsByRisk → 3-4s (Claude Desktop → Salesforce → Box)
```

**After:**
```
Beat 2 (Risk Search):
Box MCP query_metadata → 500ms (Claude Desktop → Box direct)
```

**Improvement:** ~6-8x faster for metadata queries

## Documentation Updates

✅ **CLAUDE.md:**
- Removed `findDocumentsByRisk` from examples
- Removed `askLoanDocument` references
- Simplified "DON'T" list
- Updated performance tips

✅ **DEPLOYMENT-COMPLETE.md:**
- Updated tool count: 9 → 6
- Added "Removed Tools" section with Box MCP alternatives

✅ **FIXES-2026-09-08.md:**
- Simplified Issue #5 (Doc Gen) - no longer mentions LOS alternative
- Updated Issue #3 (MCP-first) - cleaner without duplicate options

## Migration Guide

### For Claude Desktop Users

**Old Approach:**
```
Claude: Which documents are flagged critical risk?
→ LOS findDocumentsByRisk(inputRiskLevel="Critical")
```

**New Approach:**
```
Claude: Which documents are flagged critical risk?
→ Box query_metadata(template="losDocument", query="policyRisk='Critical'")
```

### For Salesforce Copilot Users

**No Change Required:**
The Copilot continues to use `ask_box_ai` action (LosBoxAskDocument). This is a Salesforce-only path and doesn't use MCP.

## Testing

**MCP Server:**
```bash
# Verify 6 tools exposed
grep "<toolName>" force-app/main/default/mcpServerDefinitions/LOSLoanTools.mcpServerDefinition-meta.xml

# Expected:
# applyLoanTerms
# classifyDocument
# extractLoanTerms
# getLoanPackage
# listLoans
# prepareSignatureRequest
```

**Claude Desktop:**
Reconnect MCP connectors and verify removed tools are no longer available.

**Salesforce Copilot:**
Test ask_box_ai action still works in Copilot (unchanged).

## Summary

- **Removed:** 3 redundant tools from MCP Server
- **Kept:** 6 essential tools that require Salesforce data or governance
- **Performance:** 6-8x improvement for metadata queries
- **Strategy:** MCP-first - use Box MCP directly whenever possible
- **Compatibility:** Salesforce Copilot unchanged, continues to work

**Result:** Cleaner, faster, single-path tool selection for maximum efficiency.
