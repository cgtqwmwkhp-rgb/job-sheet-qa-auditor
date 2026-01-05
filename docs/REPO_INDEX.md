# job-sheet-qa-auditor Repository Index

This document provides a quick reference for identifying and working with the job-sheet-qa-auditor repository.

## Repository Identity

| Property | Value |
|----------|-------|
| **Name** | job-sheet-qa-auditor |
| **Language** | TypeScript |
| **Build Tool** | pnpm |
| **Framework** | React + Node.js + tRPC |
| **Package** | `@job-sheet-qa-auditor/*` |

## Build Commands

| Command | Description |
|---------|-------------|
| `pnpm install` | Install dependencies |
| `pnpm check` | Run typecheck and lint |
| `pnpm test` | Run all tests |
| `pnpm test -- <pattern>` | Run specific tests |
| `pnpm dev` | Start development server |

## CI Workflows

| Workflow | File | Triggers | Purpose |
|----------|------|----------|---------|
| CI | `.github/workflows/ci.yml` | PR to main | Build, test, lint |
| Parity | `.github/workflows/parity.yml` | Manual, nightly | Parity validation |
| Promotion | `.github/workflows/promotion.yml` | Manual | Deployment promotion |

## Directory Structure

```
job-sheet-qa-auditor/
├── client/                  # React frontend
├── server/                  # Node.js backend
│   ├── services/           # Business logic
│   └── tests/              # Server tests
├── shared/                  # Shared types
├── drizzle/                # Database migrations
├── e2e/                    # End-to-end tests
├── parity/                 # Parity testing
│   ├── baselines/         # Baseline snapshots
│   ├── fixtures/          # Test fixtures
│   └── reports/           # Parity reports
├── docs/                   # Documentation
│   ├── evidence/          # Evidence packs
│   ├── governance/        # Governance docs
│   └── runbooks/          # Operational runbooks
└── .github/workflows/      # CI workflows
```

## Related Repositories

| Repository | Language | Purpose | Link |
|------------|----------|---------|------|
| AI-Scheduler | Java | Scheduling backend service | [Link](https://github.com/cgtqwmwkhp-rgb/AI-Scheduler) |

## How to Identify This Repo in CI Logs

Look for these indicators in CI logs:

1. **Repo Banner:**
   ```
   ==================================================
     REPO:       job-sheet-qa-auditor (TypeScript/Node.js)
     WORKFLOW:   ci.yml
   ==================================================
   ```

2. **Build Commands:**
   - `pnpm install`
   - `pnpm check`
   - `pnpm test`

3. **Test Frameworks:**
   - `vitest`
   - `playwright`

4. **Test File Extensions:**
   - `*.test.ts`
   - `*.spec.ts`

## Troubleshooting

### Test Failures

If a test fails with `*.test.ts` or `*.spec.ts`:
1. This is the **job-sheet-qa-auditor** repository (TypeScript/Node.js)
2. Check `server/tests/` or `e2e/` for the test file
3. Run locally: `pnpm test -- <pattern>`

### CI Failures

If CI fails with lint errors:
1. Run `pnpm check` locally
2. Fix any lint or type errors
3. Push to the PR branch

### Parity Failures

If parity tests fail:
1. Check `parity/reports/latest.json` for details
2. Compare against baseline in `parity/baselines/`
3. Update baseline if changes are intentional
