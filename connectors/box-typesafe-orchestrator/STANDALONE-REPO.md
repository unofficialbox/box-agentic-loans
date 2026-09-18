# Moving to Standalone Repository

This package is designed to be a **standalone, reusable npm package** for any Box integration that wants intelligent orchestration via TypeSafe.ai.

## Recommended Repository Setup

### Repository Name
```
box-typesafe-orchestrator
```

### Repository Structure
```
box-typesafe-orchestrator/
├─ src/
│   ├─ orchestrator.ts       (main class)
│   ├─ types.ts              (type definitions)
│   ├─ config.ts             (configuration)
│   └─ index.ts              (exports)
├─ tests/
│   ├─ orchestrator.test.ts
│   ├─ intent-routing.test.ts
│   ├─ classification.test.ts
│   └─ risk-scoring.test.ts
├─ examples/
│   ├─ basic-usage.ts
│   ├─ document-classification.ts
│   ├─ loan-risk-scoring.ts
│   └─ cross-system-validation.ts
├─ docs/
│   ├─ API.md
│   ├─ PATTERNS.md
│   └─ INTEGRATION-GUIDE.md
├─ package.json
├─ tsconfig.json
├─ README.md
├─ LICENSE
└─ .github/
    └─ workflows/
        ├─ test.yml
        └─ publish.yml
```

## Package Configuration

### package.json
```json
{
  "name": "box-typesafe-orchestrator",
  "version": "1.0.0",
  "description": "Intelligent orchestration layer for Box integrations using TypeSafe.ai",
  "keywords": ["box", "typesafe", "orchestration", "ai", "mcp"],
  "repository": {
    "type": "git",
    "url": "https://github.com/box/box-typesafe-orchestrator.git"
  },
  "homepage": "https://github.com/box/box-typesafe-orchestrator#readme",
  "bugs": {
    "url": "https://github.com/box/box-typesafe-orchestrator/issues"
  }
}
```

## Publishing Options

### Option 1: npm Public Registry
```bash
npm publish
```
Anyone can install:
```bash
npm install box-typesafe-orchestrator
```

### Option 2: GitHub Packages
```bash
npm publish --registry=https://npm.pkg.github.com
```
Install with scope:
```bash
npm install @box/box-typesafe-orchestrator
```

### Option 3: Private npm Registry
For internal Box use only.

## Migration Steps

### 1. Create New Repository
```bash
# Create on GitHub
gh repo create box/box-typesafe-orchestrator --public

# Clone locally
git clone https://github.com/box/box-typesafe-orchestrator.git
cd box-typesafe-orchestrator
```

### 2. Copy Package Contents
```bash
# From this repo
cp -r connectors/box-typesafe-orchestrator/* box-typesafe-orchestrator/

# Or use git subtree
git subtree split --prefix=connectors/box-typesafe-orchestrator -b typesafe-pkg
```

### 3. Set Up CI/CD
Add GitHub Actions for:
- Run tests on PR
- Publish to npm on release tag
- Generate API docs
- Run linting

### 4. Publish v1.0.0
```bash
npm version 1.0.0
npm publish
git tag v1.0.0
git push origin v1.0.0
```

### 5. Update Demo Repo
In `box-claudeforce-loans`:
```json
{
  "dependencies": {
    "box-typesafe-orchestrator": "^1.0.0"
  }
}
```

Remove `connectors/box-typesafe-orchestrator/` from demo repo.

## Benefits of Standalone Repo

✅ **Independent versioning** - Semantic versioning for API changes  
✅ **Reusability** - Any Box integration can use it  
✅ **Focused development** - TypeScript-only, clear scope  
✅ **Better testing** - Dedicated test infrastructure  
✅ **Community contributions** - External developers can contribute  
✅ **Documentation** - API docs, examples, integration guides  
✅ **CI/CD** - Automated testing and publishing  

## Using in Other Projects

### Example: Contract Lifecycle Management
```typescript
import { TypeSafeOrchestrator } from 'box-typesafe-orchestrator';

const orchestrator = new TypeSafeOrchestrator({
  apiKey: process.env.TYPESAFE_API_KEY
});

// Route contract review intent
const route = await orchestrator.routeIntent(
  "Review this vendor contract for compliance",
  { documentId, contractType }
);

// Validate document classification
const validation = await orchestrator.validateClassification(
  "Vendor Agreement",
  { contractType, stage: "Review" }
);
```

### Example: Loan Origination (Current Demo)
```typescript
import { TypeSafeOrchestrator } from 'box-typesafe-orchestrator';

const orchestrator = new TypeSafeOrchestrator({
  apiKey: process.env.TYPESAFE_API_KEY
});

// Score loan risk
const risk = await orchestrator.scoreLoanRisk(loanData, documents);

// Validate cross-system consistency
const consistency = await orchestrator.validateConsistency(
  salesforceRecord,
  boxDocument
);
```

## Compatibility

The orchestrator is **system-agnostic**. It works with:
- Box MCP (primary use case)
- Salesforce MCP (optional, for cross-system validation)
- Any other MCP connectors
- Custom integration logic

All it needs is:
1. TypeSafe API key
2. Data from MCPs passed in
3. Routing decisions returned

## Versioning Strategy

**Semantic Versioning (semver):**
- **MAJOR** (2.0.0): Breaking API changes
- **MINOR** (1.1.0): New features, backward compatible
- **PATCH** (1.0.1): Bug fixes

**Example Roadmap:**
- `1.0.0` - Initial release (intent routing, classification, risk scoring)
- `1.1.0` - Add anomaly detection, borrower communication analysis
- `1.2.0` - Add batch operations, caching layer
- `2.0.0` - TypeSafe SDK 2.0 support (breaking changes)

## License

Recommend **MIT License** for maximum adoption and contribution.

## Maintenance

Suggested team structure:
- **Maintainer**: Box integrations team
- **Contributors**: Open to external contributions
- **Support**: GitHub issues + discussions
- **Documentation**: README + docs/ folder + JSDoc comments

---

Ready to extract to standalone repo? See implementation steps above.
