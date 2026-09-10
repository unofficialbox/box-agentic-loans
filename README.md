# Loan Origination Demo

Commercial loan origination demo showcasing Box + Salesforce integration with AI-powered workflows.

## What It Does

A borrower applies through the Acme Borrower Portal. Documents uploaded to Box are automatically classified by Box AI. A loan officer's AI assistant:

- Extracts loan terms from marked-up documents
- Validates terms against credit policy (stored in Box Hubs)
- Reviews borrower's loan history
- Generates commitment letters via Box Doc Gen
- Enforces governance (status checks, confirmation requirements)

**Key features:**
- Governed loan files in Box, structured records in Salesforce
- Box AI for document classification and term extraction
- Credit policy validation via Box Hubs
- Headless AI integration (works with Claude Desktop, ChatGPT, Slack, Agentforce)
- Multi-connector strategy: Box MCP for Box operations, LOS tools for Salesforce governance

## Quick Start

### Prerequisites

- Box enterprise with AI, Hubs, Doc Gen, Sign, and metadata enabled
- Salesforce org with Agentforce and UI Bundles (Hyperforce required)
- Box for Salesforce package installed
- Python 3.11+, Node.js, Box CLI, Salesforce CLI

### Setup

1. **Configure:**
   ```bash
   cp .env.sample .env
   cp config/runtime/demo-environment.example.json config/runtime/demo-environment.json
   python3 scripts/setup_los_dev.py
   ```

2. **Deploy:**
   ```bash
   python3 scripts/demo_operator.py bootstrap --scenario box-salesforce-los --yes
   ./scripts/seed-los-sample-data.sh <alias>
   ./scripts/seed-los-loan-files.sh <alias>
   ```

3. **Configure Box preview, Loan Copilot, and MCP connectors**  
   See [docs/SETUP.md](docs/SETUP.md) for detailed instructions.

### Cleanup

Remove demo loans and their Box folders between presentations:

```bash
# Preview what would be deleted
python3 scripts/cleanup_demo.py --status Application --dry-run

# Delete all Application status loans
python3 scripts/cleanup_demo.py --status Application --yes

# Delete loans created today
python3 scripts/cleanup_demo.py --today --yes

# Delete specific loan
python3 scripts/cleanup_demo.py --loan-id LN-2026-0042 --yes

# Interactive mode (prompts for each)
python3 scripts/cleanup_demo.py --status Application --interactive
```

### Demo

Run the demo beats with Claude Desktop (or any AI harness):
- **Prompts & walkthrough:** [DEMO-CLICKPATH.md](DEMO-CLICKPATH.md)
- **Presenter skill:** [skills/loan-origination/SKILL.md](skills/loan-origination/SKILL.md)
- **Presenter guide:** [docs/PRESENTING.md](docs/PRESENTING.md)

## Documentation

- **[docs/SETUP.md](docs/SETUP.md)** - Complete deployment guide
- **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** - System design and governance
- **[docs/HANDOFF.md](docs/HANDOFF.md)** - Developer handoff guide
- **[CLAUDE.md](CLAUDE.md)** - AI connector strategy (metadata-first, Box MCP vs LOS tools)
- **[docs/SECURITY.md](docs/SECURITY.md)** - Borrower authorization and token scoping
- **[docs/paved-path.md](docs/paved-path.md)** - MCP deployment guidance

## Repository Structure

- `config/` - Box metadata templates and runtime configuration
- `scripts/` - Deployment automation and helpers
- `los-salesforce-project/` - Salesforce metadata and UI components
- `sample-data/` - Credit policy library and demo documents
- `docs/` - Setup guides and architecture documentation
