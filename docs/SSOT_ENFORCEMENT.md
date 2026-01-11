# SSOT (Single Source of Truth) Enforcement

## Overview

The Job Sheet QA Auditor uses a **Single Source of Truth (SSOT)** architecture for template/spec definitions. This ensures all processing uses the same, governed template definitions.

## SSOT Modes

| Mode | Description | When Used |
|------|-------------|-----------|
| `strict` | Templates are required; pipeline fails if no match | Production, Staging |
| `permissive` | Auto-initializes default template if none exist | Development, Testing |

## Fail-Closed Enforcement (Hardening)

**CRITICAL**: In production and staging environments, SSOT mode is **always strict**.

```typescript
// The TEMPLATE_SSOT_MODE env var is IGNORED in production/staging
// This is a security measure to prevent template bypass

if (env === 'production' || env === 'staging') {
  // ALWAYS strict - no override possible
  return 'strict';
}
```

### Why Fail-Closed?

1. **Security**: Prevents accidental permissive mode in production
2. **Governance**: Ensures all processing uses vetted templates
3. **Auditability**: Every document is processed with a known template
4. **Determinism**: No fallback to hardcoded specs

## Environment Detection

| Environment Variable | Priority | Effect |
|---------------------|----------|--------|
| `APP_ENV` | 1st | Determines environment (production/staging/development) |
| `NODE_ENV` | 2nd | Fallback if APP_ENV not set |
| `TEMPLATE_SSOT_MODE` | Ignored in prod/staging | Only effective in development |

## Behavior by Environment

### Production (`APP_ENV=production`)
- Mode: **strict** (enforced)
- No template → pipeline fails with `SSOT_VIOLATION`
- No fallback to default template
- `TEMPLATE_SSOT_MODE` ignored

### Staging (`APP_ENV=staging`)
- Mode: **strict** (enforced)
- Same behavior as production
- Used for pre-production validation

### Development (`APP_ENV=development` or unset)
- Mode: **permissive** (default) or overridable
- Auto-initializes default template if none exist
- `TEMPLATE_SSOT_MODE=strict` forces strict mode

## Error Handling

When SSOT validation fails in strict mode:

```
SSOT_VIOLATION: No active templates in strict mode.
Either activate a template or set TEMPLATE_SSOT_MODE=permissive.
```

**Note**: The "set TEMPLATE_SSOT_MODE" suggestion only applies to development. In production/staging, you must activate a template.

## Verification

### Check Current Mode

```bash
# In staging
curl https://staging.example.com/api/trpc/system.version | jq

# Response includes environment info
{
  "environment": "staging",
  ...
}
```

### Verify SSOT Enforcement

```typescript
import { getSsotMode, isFailClosedEnvironment } from './templateRegistry/defaultTemplate';

console.log(`Mode: ${getSsotMode()}`);
console.log(`Fail-closed: ${isFailClosedEnvironment()}`);
```

## Related Files

- `server/services/templateRegistry/defaultTemplate.ts` - SSOT mode logic
- `server/services/templateRegistry/registryService.ts` - SSOT validation
- `server/services/documentProcessor.ts` - SSOT enforcement in pipeline
