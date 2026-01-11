# Interpreter Router Safety Checklist

**Version:** 1.0.0  
**Date:** 2026-01-11  
**SHA:** c909e29497bebe5c3e5a99636bf52a0f9f4f65b9

---

## 1. Advisory-Only Proof

### Critical Invariant
> **Interpreter results are ADVISORY ONLY. They do NOT change canonical document outcomes.**

### Code Evidence

```typescript
// server/services/interpreter/router.ts

/**
 * Store advisory artifact
 * CRITICAL: This stores the advisory result but does NOT modify canonical
 */
storeAdvisory(
  request: InterpreterRequest,
  response: InterpreterResponse,
  canonicalValue: unknown
): AdvisoryArtifact {
  const artifact: AdvisoryArtifact = {
    // ...
    comparison: {
      canonicalValue,           // Original value - NEVER modified
      advisoryValue: response.advisory.value,  // Advisory suggestion
      agreesWithCanonical: this.valuesEqual(canonicalValue, response.advisory.value),
      confidenceDelta: response.advisory.confidence - (request.context.confidence || 0.5),
    },
    // ...
  };
  return artifact;
}
```

### Test Evidence

| Test | File | Status |
|------|------|--------|
| INVARIANT: Advisory results do NOT change canonical | `interpreterRouter.contract.test.ts:201` | ✅ PASS |
| INVARIANT: All responses include model metadata | `interpreterRouter.contract.test.ts:217` | ✅ PASS |

### Contract Test Code

```typescript
it('INVARIANT: Advisory results do NOT change canonical', async () => {
  const router = new InterpreterRouter();
  const canonicalValue = 'ORIGINAL_CANONICAL_VALUE';
  
  const request = { /* ... */ };
  const response = await router.route(request);
  const artifact = router.storeAdvisory(request, response, canonicalValue);
  
  // Advisory may suggest different value
  // But canonical MUST remain unchanged
  expect(artifact.comparison.canonicalValue).toBe(canonicalValue);
  // The advisory value is stored separately
  expect(artifact.comparison.advisoryValue).toBeDefined();
  // We track whether they agree, but we don't modify canonical
  expect(artifact.comparison.agreesWithCanonical).toBeDefined();
});
```

---

## 2. Cost Controls

### Token Caps

| Control | Value | Location |
|---------|-------|----------|
| Max Tokens Per Request (Gemini) | 4,096 | `DEFAULT_ROUTER_RULES.providers.gemini.maxTokens` |
| Max Tokens Per Request (Claude) | 4,096 | `DEFAULT_ROUTER_RULES.providers.claude.maxTokens` |
| Max Requests Per Minute | 60 | `DEFAULT_ROUTER_RULES.rateLimits.maxRequestsPerMinute` |
| Max Tokens Per Day | 1,000,000 | `DEFAULT_ROUTER_RULES.rateLimits.maxTokensPerDay` |

### Cost Estimation

| Provider | Input (per 1M tokens) | Output (per 1M tokens) |
|----------|----------------------|------------------------|
| Gemini 1.5 Pro | $0.075 | $0.30 |
| Claude 3.5 Sonnet | $3.00 | $15.00 |

### Cost Tracking Code

```typescript
// server/services/interpreter/router.ts
private estimateCost(
  provider: InterpreterProvider,
  inputTokens: number,
  outputTokens: number
): number {
  const pricing: Record<InterpreterProvider, { input: number; output: number }> = {
    gemini: { input: 0.075, output: 0.30 },
    claude: { input: 3.00, output: 15.00 },
  };
  
  const rates = pricing[provider];
  return (inputTokens * rates.input + outputTokens * rates.output) / 1_000_000;
}
```

---

## 3. Escalation Thresholds

### Default Escalation Rules

| Trigger | Threshold | Action |
|---------|-----------|--------|
| Low Confidence | < 70% | Escalate to Claude |
| Complex Document | Patterns: `multi_page`, `handwritten`, `damaged` | Escalate to Claude |
| Urgent Priority | `priority: 'urgent'` | Escalate to Claude |
| Error Retry | On provider error | Escalate to Claude |

### Configuration

```typescript
// server/services/interpreter/types.ts
export const DEFAULT_ROUTER_RULES: RouterRules = {
  defaultProvider: 'gemini',
  escalation: {
    enabled: true,
    provider: 'claude',
    triggers: {
      lowConfidenceThreshold: 0.70,
      errorRetry: true,
      complexDocumentPatterns: ['multi_page', 'handwritten', 'damaged'],
    },
  },
  // ...
};
```

---

## 4. Logging & Audit Trail

### Artifact Storage

All interpreter interactions are stored as `AdvisoryArtifact` with:

| Field | Description |
|-------|-------------|
| `artifactId` | Unique identifier |
| `documentId` | Document being processed |
| `request` | Full request context |
| `response` | Full response including provider, model, tokens |
| `comparison` | Canonical vs advisory comparison |
| `audit.createdAt` | ISO timestamp |
| `audit.createdBy` | User/system identifier |
| `audit.environment` | local/staging/production |

### Metrics Tracking

```typescript
// RouterMetrics interface
interface RouterMetrics {
  requests: {
    total: number;
    byProvider: Record<InterpreterProvider, number>;
    byRoutingMode: Record<RoutingMode, number>;
  };
  escalations: {
    total: number;
    byReason: Record<EscalationReason, number>;
    escalationRate: number;
  };
  cost: {
    totalInputTokens: number;
    totalOutputTokens: number;
    estimatedTotalCostUsd: number;
  };
  agreement: {
    agreementRate: number;
  };
}
```

---

## 5. A/B Testing Safety

### Traffic Split Controls

```typescript
abTest: {
  enabled: false,  // Disabled by default
  trafficSplit: {
    gemini: 0.8,   // 80% to Gemini
    claude: 0.2,   // 20% to Claude
  },
  cohortAssignment: 'hash_documentId',  // Consistent assignment
}
```

### Safety Features

- ✅ A/B testing disabled by default
- ✅ Consistent cohort assignment (same doc → same provider)
- ✅ Can be enabled/disabled at runtime
- ✅ Traffic split is configurable

---

## 6. Environment Safety Flags

### Required Environment Variables

| Variable | Value | Purpose |
|----------|-------|---------|
| `ENABLE_PURGE_EXECUTION` | `false` | Prevent destructive operations |
| `ENABLE_SCHEDULER` | `false` | Prevent automated jobs |
| `APP_ENV` | `staging` / `production` | Environment identifier |

### Verification

```bash
# Check environment variables in production
curl -s $PRODUCTION_URL/api/trpc/system.version | jq '.'
# Should show: environment: "production", scheduler: false, purge: false
```

---

## 7. Checklist Sign-off

| Item | Status | Evidence |
|------|--------|----------|
| Advisory results never modify canonical | ✅ | Contract test + code review |
| Token caps configured | ✅ | `DEFAULT_ROUTER_RULES.rateLimits` |
| Cost estimation implemented | ✅ | `estimateCost()` method |
| Escalation thresholds defined | ✅ | `DEFAULT_ROUTER_RULES.escalation` |
| All interactions logged | ✅ | `storeAdvisory()` method |
| A/B testing disabled by default | ✅ | `abTest.enabled: false` |
| Environment safety flags | ✅ | `ENABLE_PURGE_EXECUTION=false`, `ENABLE_SCHEDULER=false` |

---

## 8. Operational Recommendations

1. **Monitor escalation rate** - High escalation rates (>20%) indicate Gemini confidence issues
2. **Review cost daily** - Set alerts for daily cost exceeding $X threshold
3. **Check agreement rate** - Low agreement (<80%) may indicate model drift
4. **Audit artifacts weekly** - Review sample of advisory artifacts
5. **Update baseline monthly** - Refresh drift baseline after model updates

---

**Reviewed by:** [Operator Name]  
**Date:** [Date]  
**Signature:** ________________
