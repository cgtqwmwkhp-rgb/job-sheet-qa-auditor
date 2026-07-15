# Health and readiness endpoints

`/healthz` is the liveness endpoint. It returns HTTP 200 while the Node process
can serve requests and deliberately does not inspect database, storage, or AI
providers. Configure container liveness probes to use this endpoint.

`/readyz` is the traffic-readiness endpoint. It returns:

- HTTP 200 with `status: "ok"` when database, storage, and required AI features
  are ready.
- HTTP 503 with `status: "degraded"` when an enabled AI capability is degraded.
- HTTP 503 with `status: "unhealthy"` when database or storage is unavailable.
  A 503 means the instance should not receive normal traffic; it does not mean
  the process is dead.

The response contains `checks.ai`, which is intentionally safe to expose:

```json
{
  "status": "degraded",
  "checks": {
    "ai": {
      "status": "degraded",
      "ocr": {
        "provider": "mistral",
        "status": "degraded",
        "configured": true,
        "circuitBreaker": "OPEN",
        "reason": "mistral OCR circuit breaker is open",
        "failoverConfigured": true
      }
    }
  }
}
```

`checks.ai.ocr` always represents the active `OCR_PROVIDER`. Mistral is
degraded when `MISTRAL_API_KEY` is absent or its in-process circuit breaker is
open. Azure Document Intelligence is degraded when its endpoint or key is
absent. `mock` is ready by design for local and test environments.

Gemini and VLM are required only when their feature flags are enabled:

- `ENABLE_GEMINI_INSIGHTS=true` requires `GEMINI_API_KEY`.
- `FEATURE_VLM_VERIFICATION=true` requires `ANTHROPIC_API_KEY`.

The endpoint does not issue live requests to external providers. Its provider
signal combines credential configuration with the circuit-breaker state already
observed by this process, avoiding probe-induced provider traffic, cost, and
rate limiting. A `ready` result therefore means configured with no currently
open in-process circuit, not a synthetic upstream transaction.

Use `/healthz` for liveness and `/readyz` for readiness. Do not treat a
readiness 503 as a liveness failure.
