# Troubleshooting Guide

## OCR Service (Mistral)

### Configuration Errors

#### `MISTRAL_API_KEY not configured`

**Cause**: The `MISTRAL_API_KEY` environment variable is not set.

**Solution**:
```bash
# Set in .env file
MISTRAL_API_KEY=your-api-key-here

# Or export directly
export MISTRAL_API_KEY=your-api-key-here
```

#### `API validation failed: 401`

**Cause**: Invalid or expired API key.

**Solution**:
1. Verify your API key at https://console.mistral.ai
2. Regenerate the key if expired
3. Ensure no extra whitespace in the key

### Runtime Errors

#### `CIRCUIT_BREAKER_OPEN`

**Cause**: Too many consecutive failures triggered the circuit breaker.

**Solution**:
1. Wait for the circuit breaker to reset (default: 60 seconds)
2. Check Mistral API status
3. Verify network connectivity
4. If persistent, check API quotas

**Manual Reset** (admin only):
```typescript
import { resetOCRCircuitBreaker } from './server/services/ocrAdapter';
resetOCRCircuitBreaker();
```

#### `HTTP_429` (Rate Limited)

**Cause**: API rate limit exceeded.

**Solution**:
1. Reduce request frequency
2. Implement request batching
3. Contact Mistral for higher limits

#### `HTTP_500` (Server Error)

**Cause**: Mistral API internal error.

**Solution**:
1. Retry automatically handled (up to 3 attempts)
2. Check Mistral status page
3. If persistent, contact Mistral support

### Document Processing Errors

#### Empty pages returned

**Cause**: Document may be image-only without embedded text.

**Solution**:
1. Verify document contains extractable content
2. Check document is not corrupted
3. Try with a different document

#### Partial extraction

**Cause**: Page limit reached or timeout.

**Solution**:
```typescript
// Increase page limit
const result = await adapter.extractFromUrl(url, {
  pageLimit: 50, // default is unlimited
});
```

## Gemini Interpreter (Advisory)

### Configuration Errors

#### Empty insights returned (expected)

**Cause**: Gemini insights are disabled by default.

**Solution**:
```bash
# Enable Gemini insights
ENABLE_GEMINI_INSIGHTS=true
GEMINI_API_KEY=your-api-key-here
```

#### `GEMINI_API_KEY not configured`

**Cause**: API key not set when insights are enabled.

**Solution**:
```bash
GEMINI_API_KEY=your-api-key-here
```

### Advisory Output Issues

#### Insights affecting canonical output

**THIS IS A BUG**. Gemini output should NEVER affect:
- `findings[]`
- `validatedFields[]`
- Any pass/fail determination

**Solution**:
1. File a bug report
2. Check that `isAdvisoryOnly: true` is set in insights artifact
3. Verify canonical report generation doesn't depend on interpreter

#### Invalid JSON response

**Cause**: Gemini returned malformed JSON.

**Solution**:
1. Check `GEMINI_MODEL` is set to a supported model
2. Retry the request
3. If persistent, check Gemini API status

## Logging Safety

### OCR text appearing in logs

**THIS IS A SECURITY ISSUE**. OCR text may contain PII.

**Solution**:
1. Use `createSafeLogger()` for all external service logging
2. Never log fields: `markdown`, `rawText`, `ocrText`, `extractedText`
3. Run logging safety check:
```typescript
import { checkLoggingSafety } from './server/utils/safeLogger';
const unsafeFields = checkLoggingSafety(data);
if (unsafeFields.length > 0) {
  console.error('Unsafe fields detected:', unsafeFields);
}
```

### PII in error messages

**Cause**: Error messages may contain document content.

**Solution**:
1. Use `safeLogger.error()` instead of `console.error()`
2. Truncate error messages before logging
3. Redact PII using `redactObject()` from `piiRedaction.ts`

## CI/CD Issues

### Tests failing without API keys

**Cause**: Tests require external API keys.

**Solution**:
```bash
# Run tests without external services
unset MISTRAL_API_KEY GEMINI_API_KEY RUN_LIVE_TESTS
pnpm test
```

### Visual regression tests failing

**Cause**: Visual tests are quarantined to nightly runs.

**Solution**:
1. Visual tests should not run in default CI
2. Check `.github/workflows/ci.yml` for correct configuration
3. See `docs/ci/VISUAL_REGRESSION_QUARANTINE.md`

## Database Issues

### Connection refused

**Cause**: Database not running or wrong connection string.

**Solution**:
1. Verify MySQL is running
2. Check `DATABASE_URL` format: `mysql://user:pass@host:port/db`
3. Verify network connectivity to database host

### Migration errors

**Cause**: Schema mismatch or migration conflict.

**Solution**:
```bash
# Check migration status
pnpm db:status

# Run pending migrations
pnpm db:migrate

# Reset database (DESTRUCTIVE)
pnpm db:reset
```

## Dead Letter Queue

### Jobs not being processed

**Cause**: DLQ processor not running or jobs marked non-recoverable.

**Solution**:
1. Check DLQ status:
```typescript
import { getDeadLetterQueueStatus } from './server/utils/deadLetterQueue';
console.log(getDeadLetterQueueStatus());
```
2. Retry recoverable jobs:
```typescript
import { retryDeadLetterJob } from './server/utils/deadLetterQueue';
retryDeadLetterJob(jobId);
```

### DLQ growing unbounded

**Cause**: Jobs failing repeatedly without resolution.

**Solution**:
1. Review failed jobs for common patterns
2. Fix underlying issues (API keys, network, etc.)
3. Clear resolved jobs:
```typescript
import { clearDeadLetterQueue } from './server/utils/deadLetterQueue';
clearDeadLetterQueue(); // Clears all jobs
```

## Performance Issues

### Slow OCR processing

**Cause**: Large documents or network latency.

**Solution**:
1. Use page limits for large documents
2. Process documents in batches
3. Consider document preprocessing (compression, splitting)

### Memory issues

**Cause**: Large base64 documents in memory.

**Solution**:
1. Use URL-based extraction when possible
2. Stream large documents
3. Increase Node.js memory limit: `NODE_OPTIONS=--max-old-space-size=4096`
