# Performance Testing Guide - Box MCP vs LOS Connector

## Objective

Measure actual performance difference between Box MCP direct and LOS Salesforce wrapper approaches.

## Test Scenarios

### Test 1: Metadata Search (Beat 2)

**Box MCP Direct:**
```
Prompt: "Which loan documents are flagged critical policy risk?"

Expected Flow:
1. Box MCP → query_metadata(template="losDocument", query="policyRisk='Critical'")
2. Direct to Box API
3. Return results

Expected Time: 500-800ms
```

**LOS Connector (Old):**
```
Prompt: "Which loan documents are flagged critical policy risk?"

Expected Flow:
1. LOS MCP → findDocumentsByRisk
2. Salesforce Apex → LosPortfolioSearch.find()
3. Salesforce → Box API (via named credential)
4. Box API returns results
5. Salesforce formats response
6. Return to MCP client

Expected Time: 2-4s
```

**Performance Test:**
- Run each approach 5 times
- Record min/max/average response time
- Exclude first run (cold start)

---

### Test 2: Box AI Document QA

**Box MCP Direct:**
```
Prompt: "What loan amount is in the term sheet?"

Expected Flow:
1. getLoanPackage → get file ID
2. Box MCP → box_ai_ask(file_id, prompt)
3. Direct to Box AI API
4. Return answer

Expected Time: 1-2s (Box AI processing)
```

**LOS Connector (Old):**
```
Prompt: "What loan amount is in the term sheet?"

Expected Flow:
1. getLoanPackage → get file ID
2. LOS MCP → askLoanDocument
3. Salesforce Apex → LosBoxAskDocument.ask()
4. Salesforce → Box AI API
5. Box AI returns answer
6. Salesforce formats response
7. Return to MCP client

Expected Time: 3-5s
```

---

### Test 3: Doc Gen (Beat 5)

**Box MCP Direct:**
```
Prompt: "Generate the commitment letter for this loan"

Expected Flow:
1. getLoanPackage → folder ID
2. Query Salesforce → template ID
3. extractLoanTerms → analysis data
4. listLoans → precedent data
5. Box MCP → create_document_from_template(fields)
6. Direct to Box Doc Gen API (async)
7. Return batch ID

Expected Time: 3-5s
```

**LOS Connector (Old):**
```
Prompt: "Generate the commitment letter for this loan"

Expected Flow:
1. Query Salesforce → template ID
2. extractLoanTerms → analysis data
3. listLoans → precedent data
4. LOS MCP → generateCommitmentLetter
5. Salesforce Apex → LosGenerateCommitmentLetter.generate()
6. Salesforce → Box Doc Gen API
7. Box Doc Gen returns batch ID
8. Salesforce formats response
9. Return to MCP client

Expected Time: 4-7s
```

---

## Why Performance Differs

### Network Round Trips

**Box MCP Direct:**
```
Claude Desktop
    ↓ (local)
Box MCP Server
    ↓ (HTTPS)
Box API
    ↓
Response
```
**Total:** 1 external round trip

**LOS Connector:**
```
Claude Desktop
    ↓ (local)
LOS MCP Server
    ↓ (HTTPS + OAuth)
Salesforce API
    ↓ (HTTPS + JWT)
Box API
    ↓
Response → Salesforce
    ↓
Response → LOS MCP
    ↓
Response → Claude Desktop
```
**Total:** 2-3 external round trips + authentication overhead

### Authentication Overhead

**Box MCP:**
- Single OAuth token (cached)
- Direct API calls

**LOS Connector:**
- Salesforce OAuth (MCP client)
- Box JWT token (Salesforce → Box)
- Token generation on each call

### Processing Overhead

**Box MCP:**
- Minimal - JSON passthrough

**LOS Connector:**
- Apex execution time
- Object serialization/deserialization
- Governor limit checks
- Debug logging overhead

---

## Testing Instructions

### Setup

1. **Start timing tool:**
   ```bash
   # In one terminal, monitor network
   # Or use Claude Desktop's built-in timing (if available)
   ```

2. **Prepare test prompts:**
   ```
   Test 1: Which loan documents are flagged critical policy risk?
   Test 2: What loan amount is in the term sheet for LN-2026-0042?
   Test 3: Generate the commitment letter for LN-2026-0042
   ```

3. **Reset between tests:**
   - Clear Claude Desktop conversation
   - Wait 5 seconds between runs
   - Alternate between approaches

### Running Tests

**Box MCP Approach (Current):**

1. Open Claude Desktop with both connectors loaded
2. Run test prompt
3. Note response time (check Claude Desktop UI or network inspector)
4. Record which tools were called
5. Repeat 5 times

**LOS Connector Approach (Baseline - for comparison only):**

Can't test directly since tools removed, but document expected behavior based on:
- Architecture (2-3x round trips)
- Prior observations (3-4s for metadata query)
- Salesforce debug logs (network time visible)

### Recording Results

Create table:

| Test | Approach | Run 1 | Run 2 | Run 3 | Run 4 | Run 5 | Avg | Tools Called |
|------|----------|-------|-------|-------|-------|-------|-----|--------------|
| Metadata Search | Box MCP | | | | | | | query_metadata |
| Metadata Search | LOS (est) | | | | | | ~3s | findDocumentsByRisk |
| Box AI QA | Box MCP | | | | | | | box_ai_ask |
| Box AI QA | LOS (est) | | | | | | ~4s | askLoanDocument |
| Doc Gen | Box MCP | | | | | | | create_document_from_template |
| Doc Gen | LOS (est) | | | | | | ~5s | generateCommitmentLetter |

---

## Expected Results

**Hypothesis:**
- Metadata search: 5-8x faster with Box MCP
- Box AI QA: 2-3x faster with Box MCP
- Doc Gen: 1.5-2x faster with Box MCP

**Why the variation?**
- Metadata search: Simple query, large relative overhead from Salesforce
- Box AI QA: AI processing time dominates, less relative improvement
- Doc Gen: Complex operation, Salesforce overhead significant but not dominant

---

## Validation

### Test 1: Metadata Search

**Box MCP Direct:**
```bash
# Check Box API logs (if available) - should see direct query
# Expected: enterprise_content/search or metadata_queries endpoint
# Time: < 1s
```

**Architecture Validation:**
- Single API call to Box
- No Salesforce intermediary
- Results returned as-is

### Test 2: Box AI QA

**Box MCP Direct:**
```bash
# Check Box API logs - should see ai/ask endpoint
# Time: 1-3s (depends on document size)
```

### Test 3: Doc Gen

**Box MCP Direct:**
```bash
# Check Box API logs - should see docgen_batches endpoint
# Time: 3-5s (async operation)
```

---

## Real-World Test

**Complete Beat Sequence:**

```
Start timer
→ Which loan documents are flagged critical policy risk?
→ Extract the loan terms from that term sheet
→ What closed loans does Dockwright Logistics have?
→ Generate the commitment letter
End timer

Record total time
```

**Expected with Box MCP:** 15-20s  
**Expected with LOS wrapper:** 25-35s  

**Improvement:** ~40% faster end-to-end

---

## Troubleshooting

**If Box MCP is slower than expected:**
- Check network latency to Box API
- Verify Box MCP OAuth token is cached
- Check if rate limiting is occurring

**If LOS connector comparison unavailable:**
- Use Salesforce debug logs from prior testing
- Check network traces from earlier demo runs
- Estimate based on architecture (2-3 round trips vs 1)

---

## Conclusion

After testing, document:
1. Actual measured times
2. Performance improvement percentage
3. Which operations benefit most
4. Any surprises or unexpected results

**Update this file with actual measurements after testing in Claude Desktop.**
