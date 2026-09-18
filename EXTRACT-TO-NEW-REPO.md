# Extracting box-typesafe-orchestrator to New Repository

Step-by-step guide to fork the orchestrator into its own repo while preserving git history.

## Overview

We'll use `git subtree split` to extract `connectors/box-typesafe-orchestrator/` with its commit history into a new standalone repository.

---

## Step 1: Create New Repository

### On GitHub

```bash
gh repo create box/box-typesafe-orchestrator --public --description "Intelligent orchestration layer for Box integrations using TypeSafe.ai"
```

Or create manually at: https://github.com/new
- Owner: `box` (or your org)
- Name: `box-typesafe-orchestrator`
- Description: "Intelligent orchestration layer for Box integrations using TypeSafe.ai"
- Public
- **Don't** initialize with README (we'll push our own)

---

## Step 2: Extract Package with Git History

From the `box-claudeforce-loans` repository:

```bash
# Make sure you're on the feature branch
git checkout feature/typesafe-integration

# Create a new branch with just the orchestrator history
git subtree split --prefix=connectors/box-typesafe-orchestrator -b typesafe-orchestrator-only

# This creates a new branch with:
# - Only files from connectors/box-typesafe-orchestrator/
# - Commit history for those files
# - Clean root directory (no connectors/ prefix)
```

**Result**: New branch `typesafe-orchestrator-only` with clean package structure at root.

---

## Step 3: Push to New Repository

```bash
# Add the new repo as a remote
git remote add typesafe-orchestrator https://github.com/box/box-typesafe-orchestrator.git

# Push the extracted branch to the new repo's main
git push typesafe-orchestrator typesafe-orchestrator-only:main
```

---

## Step 4: Clone and Verify New Repo

```bash
# Clone the new repo
cd ~/Developer
git clone https://github.com/box/box-typesafe-orchestrator.git
cd box-typesafe-orchestrator

# Verify structure (should be clean root)
ls -la
# Should see:
# src/
# package.json
# tsconfig.json
# README.md
# etc. (no connectors/ prefix)

# Verify history
git log --oneline
# Should see relevant commits
```

---

## Step 5: Set Up New Repository

### Add Repository Metadata

```bash
cd ~/Developer/box-typesafe-orchestrator

# Update package.json with repository info
```

Edit `package.json`:
```json
{
  "name": "box-typesafe-orchestrator",
  "version": "1.0.0",
  "description": "Intelligent orchestration layer for Box integrations using TypeSafe.ai",
  "repository": {
    "type": "git",
    "url": "https://github.com/box/box-typesafe-orchestrator.git"
  },
  "homepage": "https://github.com/box/box-typesafe-orchestrator#readme",
  "bugs": {
    "url": "https://github.com/box/box-typesafe-orchestrator/issues"
  },
  "keywords": [
    "box",
    "typesafe",
    "orchestration",
    "ai",
    "mcp",
    "salesforce"
  ],
  "author": "Box",
  "license": "MIT"
}
```

### Add License

```bash
cat > LICENSE <<'EOF'
MIT License

Copyright (c) 2026 Box, Inc.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
EOF
```

### Add CONTRIBUTING.md

```bash
cat > CONTRIBUTING.md <<'EOF'
# Contributing to box-typesafe-orchestrator

Thank you for your interest in contributing!

## Getting Started

1. Fork the repository
2. Clone your fork: `git clone https://github.com/YOUR_USERNAME/box-typesafe-orchestrator.git`
3. Install dependencies: `npm install`
4. Build: `npm run build`
5. Run tests: `npm test`

## Development

- `npm run build` - Compile TypeScript
- `npm run dev` - Watch mode
- `npm test` - Run tests
- `npm run benchmark` - Run performance benchmarks
- `npm run lint` - Check code style
- `npm run format` - Format code

## Pull Request Process

1. Create a feature branch: `git checkout -b feature/my-feature`
2. Make your changes
3. Add tests if applicable
4. Run `npm run lint` and `npm test`
5. Commit with clear messages
6. Push to your fork
7. Open a Pull Request

## Code Style

- TypeScript strict mode
- Use async/await (not callbacks)
- Descriptive variable names
- JSDoc comments for public APIs
- Follow existing patterns

## Testing

- Add unit tests for new features
- Update BENCHMARKS.md if performance changes
- Ensure all tests pass before submitting PR

## Questions?

Open an issue or discussion on GitHub.
EOF
```

### Commit Changes

```bash
git add package.json LICENSE CONTRIBUTING.md
git commit -m "Add repository metadata, license, and contributing guide"
git push origin main
```

---

## Step 6: Set Up GitHub Repository Settings

### GitHub Actions (CI/CD)

Create `.github/workflows/test.yml`:
```yaml
name: Test

on:
  push:
    branches: [ main ]
  pull_request:
    branches: [ main ]

jobs:
  test:
    runs-on: ubuntu-latest
    
    strategy:
      matrix:
        node-version: [18.x, 20.x]
    
    steps:
    - uses: actions/checkout@v4
    - name: Use Node.js ${{ matrix.node-version }}
      uses: actions/setup-node@v4
      with:
        node-version: ${{ matrix.node-version }}
    - run: npm ci
    - run: npm run build
    - run: npm run lint
    - run: npm test
```

Create `.github/workflows/publish.yml`:
```yaml
name: Publish to npm

on:
  release:
    types: [created]

jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-node@v4
      with:
        node-version: '20.x'
        registry-url: 'https://registry.npmjs.org'
    - run: npm ci
    - run: npm run build
    - run: npm publish
      env:
        NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

### Repository Settings

On GitHub.com:
1. Go to repository Settings
2. **Topics**: Add `box`, `typesafe`, `orchestration`, `ai`, `mcp`
3. **Social preview**: Upload package logo (if available)
4. **Features**: Enable Issues, Discussions
5. **Branch protection**: Require PR reviews for main
6. **Secrets**: Add `NPM_TOKEN` for publishing

---

## Step 7: Publish to npm

### One-Time Setup

```bash
# Login to npm (if not already)
npm login

# Verify you're logged in
npm whoami
```

### Publish Package

```bash
# Verify package contents
npm pack --dry-run

# Publish to npm (public)
npm publish --access public

# Or publish to GitHub Packages
npm publish --registry=https://npm.pkg.github.com
```

**Published!** Package available at:
- npm: `npm install box-typesafe-orchestrator`
- URL: https://www.npmjs.com/package/box-typesafe-orchestrator

---

## Step 8: Update Demo Repository

Back in `box-claudeforce-loans`:

### Update Package Reference

```bash
cd ~/Developer/partner-integrations/salesforce/dreamforce-demos/box-claudeforce-loans

# Remove the local copy
git rm -r connectors/box-typesafe-orchestrator

# Add as npm dependency
npm install box-typesafe-orchestrator --save

# Or if using package.json
echo '{
  "dependencies": {
    "box-typesafe-orchestrator": "^1.0.0"
  }
}' > package.json
```

### Update Documentation Links

Update all references from:
```
connectors/box-typesafe-orchestrator/
```

To:
```
https://github.com/box/box-typesafe-orchestrator
npm install box-typesafe-orchestrator
```

Files to update:
- `README.md`
- `TYPESAFE-INTEGRATION-PLAN.md`
- `docs/TYPESAFE-DEMO-SETUP.md`
- `docs/ARCHITECTURE.md`

### Commit Changes

```bash
git add -A
git commit -m "Extract box-typesafe-orchestrator to standalone repo

Package now published at:
- GitHub: https://github.com/box/box-typesafe-orchestrator
- npm: box-typesafe-orchestrator

Demo repo now uses it as npm dependency."

git push origin feature/typesafe-integration
```

---

## Step 9: Merge Feature Branch to Main

```bash
# Merge to main
git checkout main
git merge feature/typesafe-integration
git push origin main

# Optional: Delete feature branch
git branch -d feature/typesafe-integration
git push origin --delete feature/typesafe-integration
```

---

## Step 10: Announce and Document

### Update box-typesafe-orchestrator README

Add badges and links:
```markdown
# Box TypeSafe Orchestrator

[![npm version](https://img.shields.io/npm/v/box-typesafe-orchestrator.svg)](https://www.npmjs.com/package/box-typesafe-orchestrator)
[![Build Status](https://github.com/box/box-typesafe-orchestrator/workflows/Test/badge.svg)](https://github.com/box/box-typesafe-orchestrator/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Intelligent orchestration layer for Box integrations using TypeSafe.ai

## Demo

See it in action: [Box-Salesforce Loan Origination Demo](https://github.com/box/box-claudeforce-loans)
```

### Create Release

On GitHub:
1. Go to Releases
2. Click "Create a new release"
3. Tag: `v1.0.0`
4. Title: "v1.0.0 - Initial Release"
5. Description:
   ```
   Initial release of box-typesafe-orchestrator
   
   Features:
   - Intent routing (10x faster)
   - Classification validation with confidence
   - Risk scoring (12x faster)
   - Policy validation (23x faster)
   - Cross-system validation
   - Portfolio intelligence
   
   Performance: 6-10x faster, 76% fewer tokens
   See: BENCHMARKS.md
   ```
6. Publish release (triggers npm publish if workflow configured)

---

## Verification Checklist

- [ ] New repo created on GitHub
- [ ] Package extracted with git history
- [ ] Repository metadata updated (package.json, LICENSE, etc.)
- [ ] GitHub Actions configured
- [ ] Published to npm
- [ ] Demo repo updated to use npm package
- [ ] Documentation links updated
- [ ] Feature branch merged to main
- [ ] Release v1.0.0 created
- [ ] Package installable: `npm install box-typesafe-orchestrator`

---

## Result

### New Standalone Repository

```
box-typesafe-orchestrator/
├─ src/
│   ├─ orchestrator.ts
│   ├─ types.ts
│   ├─ config.ts
│   ├─ benchmark.ts
│   └─ index.ts
├─ package.json
├─ tsconfig.json
├─ README.md
├─ BENCHMARKS.md
├─ STANDALONE-REPO.md
├─ LICENSE
├─ CONTRIBUTING.md
├─ .github/
│   └─ workflows/
│       ├─ test.yml
│       └─ publish.yml
└─ benchmark.ts
```

**Published at**:
- GitHub: https://github.com/box/box-typesafe-orchestrator
- npm: https://www.npmjs.com/package/box-typesafe-orchestrator

### Updated Demo Repository

```
box-claudeforce-loans/
├─ package.json (depends on: box-typesafe-orchestrator@^1.0.0)
├─ node_modules/
│   └─ box-typesafe-orchestrator/ (npm installed)
├─ docs/ (updated links)
└─ (no more connectors/box-typesafe-orchestrator/)
```

**Uses package from npm** instead of local copy.

---

## Rollback (If Needed)

If something goes wrong:

```bash
# In demo repo
git checkout main
git reset --hard origin/main

# Delete new repo branch
git branch -D typesafe-orchestrator-only

# Remove remote
git remote remove typesafe-orchestrator

# Delete GitHub repo (if needed)
gh repo delete box/box-typesafe-orchestrator
```

---

Ready to proceed? Run the commands in order and the package will be cleanly extracted to its own repository!
