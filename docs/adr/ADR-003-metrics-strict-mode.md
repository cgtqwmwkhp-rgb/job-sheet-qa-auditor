# ADR-003: Metrics Strict-Mode Policy

## Status

**ACCEPTED** — 2026-01-05

## Context

The release verification workflow includes a monitoring snapshot step that captures metrics from the `/metrics` endpoint (Prometheus format). However, not all environments expose this endpoint:

1. **Production/Staging**: Typically have full observability infrastructure with `/metrics` endpoint
2. **Sandbox/Development**: May not have metrics infrastructure deployed

The current strict mode fails if `/metrics` is unavailable, which blocks sandbox release verification even when the application is healthy.

### Problem Statement

- Sandbox environments cannot pass strict-mode release verification because they lack a `/metrics` endpoint
- This creates friction for developers testing the release process
- However, we cannot simply remove the metrics requirement for production/staging

## Decision

Introduce a `HEALTH_ONLY` flag that allows release verification to pass based solely on the health endpoint, with the following constraints:

### Policy Rules

| Environment | HEALTH_ONLY=true | HEALTH_ONLY=false |
|-------------|------------------|-------------------|
| Production | ❌ BLOCKED | ✅ Required |
| Staging | ❌ BLOCKED | ✅ Required |
| Sandbox | ✅ Allowed | ✅ Allowed |
| Development | ✅ Allowed | ✅ Allowed |

### Implementation

1. **monitor-snapshot.sh**:
   - Accepts `health_only` as third argument
   - Reads `HEALTH_ONLY` and `ENVIRONMENT` environment variables
   - Enforces ADR-003 policy: blocks `HEALTH_ONLY=true` for production/staging
   - Passes in strict mode if `HEALTH_ONLY=true` and health endpoint returns 200

2. **release-verification.yml**:
   - Adds `health_only` workflow input (boolean, default: false)
   - Passes `ENVIRONMENT` env var to script
   - Adds explicit enforcement steps for staging/production that fail if `health_only=true`

### Evidence Type Classification

| Scenario | Evidence Type | Status |
|----------|---------------|--------|
| /metrics returns 200 | METRICS | PASS |
| /metrics unavailable, health 200, health_only=true | HEALTH_ONLY | PASS |
| /metrics unavailable, health 200, health_only=false, soft mode | HEALTH_ONLY | WARN |
| /metrics unavailable, health 200, health_only=false, strict mode | HEALTH_ONLY | FAIL |
| /metrics unavailable, health fails | NONE | FAIL |

## Consequences

### Positive

- Sandbox/development environments can complete release verification
- Production/staging maintain strict metrics requirements
- Clear policy with explicit enforcement at both script and workflow levels
- Audit trail shows which mode was used

### Negative

- Additional complexity in monitoring script
- Operators must remember to NOT use `health_only=true` for production (enforced by script)

### Risks

| Risk | Mitigation |
|------|------------|
| Operator accidentally uses health_only for production | Script enforces policy based on ENVIRONMENT variable |
| Environment variable not set correctly | Workflow explicitly sets ENVIRONMENT for each job |
| Bypass via direct script invocation | Script validates ENVIRONMENT and blocks production/staging |

## Alternatives Considered

1. **Separate workflows for sandbox vs production**: Rejected due to maintenance burden
2. **Always soft mode for sandbox**: Rejected because we want to test strict mode behavior
3. **Mock metrics endpoint in sandbox**: Rejected as it adds infrastructure complexity

## Compliance

This ADR complies with:
- Project non-negotiable: "CI MUST PASS WITHOUT EXTERNAL API SECRETS" — sandbox can now pass
- Project non-negotiable: "NO PARTIAL DONE" — includes tests and documentation

## Related Documents

- `scripts/release/monitor-snapshot.sh` — Implementation
- `.github/workflows/release-verification.yml` — Workflow integration
- `server/tests/contracts/release-verification.contract.test.ts` — Contract tests
