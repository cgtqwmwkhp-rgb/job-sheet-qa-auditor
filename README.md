# Job Sheet QA Auditor

Enterprise-grade document auditing system for job sheet validation with OCR extraction and AI-powered insights.

## Features

- **Document Processing**: Upload and process PDF job sheets
- **OCR Extraction**: Extract text using Mistral OCR 2503 (primary)
- **AI Insights**: Advisory interpretation using Gemini 2.5 Pro (optional)
- **Validation**: Rule-based validation against configurable specs
- **Audit Trail**: Immutable audit logs with correlation tracking
- **Enterprise Resilience**: Circuit breakers, retries, dead letter queue

## Environment Variables

### Required

| Variable       | Description             | Default |
| -------------- | ----------------------- | ------- |
| `DATABASE_URL` | MySQL connection string | -       |

### OCR Configuration (Mistral)

| Variable                | Description                                  | Default           |
| ----------------------- | -------------------------------------------- | ----------------- |
| `MISTRAL_API_KEY`       | Mistral API key for OCR                      | -                 |
| `MISTRAL_OCR_MODEL`     | OCR model identifier (pinned)                | `mistral-ocr-4-0` |
| `OCR_PROVIDER`          | OCR provider (`mistral`, `mock`, or `azure`) | `mistral`         |
| `OCR_FALLBACK_PROVIDER` | Failover OCR provider                        | `azure`           |
| `OCR_MAX_RETRIES`       | Max retry attempts                           | `3`               |
| `OCR_BASE_DELAY_MS`     | Base retry delay                             | `2000`            |
| `OCR_MAX_DELAY_MS`      | Max retry delay                              | `30000`           |

### Judgment (Canonical Analysis)

| Variable         | Description                              | Default          |
| ---------------- | ---------------------------------------- | ---------------- |
| `JUDGMENT_MODEL` | Gemini model for Stage-2 judgment        | `gemini-2.5-pro` |
| `GEMINI_API_KEY` | Gemini API key (shared with interpreter) | -                |

### Gemini Interpreter (Advisory Only)

| Variable                  | Description                                | Default          |
| ------------------------- | ------------------------------------------ | ---------------- |
| `ENABLE_GEMINI_INSIGHTS`  | Enable Gemini interpretation               | `false`          |
| `GEMINI_API_KEY`          | Gemini API key                             | -                |
| `GEMINI_MODEL`            | Gemini model identifier (interpreter role) | `gemini-2.5-pro` |
| `ENABLE_RAW_OCR_INSIGHTS` | Include raw OCR in Gemini input            | `false`          |

### Model Registry (PR-9)

Pinned models are exposed via `system.modelCurrency` / `ai.modelRegistry` (no secrets).
Roles: `ocr`, `judgment`, `interpreter`, optional `fallback_ocr`. Currency metadata is env-sourced (`source: "env"`).

### Shadow / Champion-Challenger (PR-21 / PR-AI-11)

| Variable                         | Description                                              | Default            |
| -------------------------------- | -------------------------------------------------------- | ------------------ |
| `FEATURE_SHADOW_CHALLENGER`      | Enable shadow/canary evaluation on live traffic          | unset (off)        |
| `SHADOW_MODE`                    | `shadow` (compare only), `canary`, or `off`              | `shadow`           |
| `SHADOW_CANARY_PERCENT`          | 0–100; fraction of traffic served by challenger (canary) | `0`                |
| `SHADOW_CHALLENGER_STRATEGY`     | Challenger strategy (`rule_based` overnight)             | `rule_based`       |
| `FEATURE_SHADOW_REAL_MODEL`      | Use Gemini Flash (or `SHADOW_REAL_MODEL_ID`) challenger  | unset (off)        |
| `SHADOW_REAL_MODEL_ID`           | Alternate model id for real-model strategy               | `gemini-2.0-flash` |
| `SHADOW_MEASUREMENT_MIN_SAMPLES` | Min comparisons before `passRate.measurementReady`       | `30`               |

**Measurement path (before canary):** set `FEATURE_SHADOW_CHALLENGER=true`, `SHADOW_MODE=shadow`, `SHADOW_CANARY_PERCENT=0`. Comparisons persist on `reportJson.shadowComparison` and never change canonical results. Aggregate pass-rate pp deltas via `analytics.getShadowChallengerSummary` → `passRate.passRatePpDelta` (challenger PASS% − champion PASS%). Do not enable canary until `passRate.measurementReady` is true.

### Azure DI custom JSR form model (PR-AI-06)

PlantExpand form-specific path — **default OFF**. Requires a trained custom neural model id.

| Variable                         | Description                                                                 | Default     |
| -------------------------------- | --------------------------------------------------------------------------- | ----------- |
| `FEATURE_AZURE_DI_CUSTOM_JSR`    | Enable custom neural JSR pass as selectionMarks / structured-field voter    | unset (off) |
| `AZURE_DI_CUSTOM_JSR_MODEL_ID`   | Trained Azure DI custom model id (e.g. `plantexpand-jsr-custom-v1`)         | unset       |
| `AZURE_DI_CUSTOM_JSR_MAX_POLL_MS`| Max poll budget for the custom analyze operation                            | `45000`     |

Uses shared `AZURE_DI_ENDPOINT` / `AZURE_DI_KEY`. When gated on, `runSelectionMarkDetection` votes checklist rows against `prebuilt-layout` geometry and merges GoldSpec `preExtractedFields`. See `docs/planning/AI-07-document-ai-textract-eval.md` for Document AI / Textract 3rd-voter eval (not integrated).

### Testing

| Variable               | Description                               | Default  |
| ---------------------- | ----------------------------------------- | -------- |
| `INTERPRETER_PROVIDER` | Interpreter provider (`gemini` or `mock`) | `gemini` |
| `RUN_LIVE_TESTS`       | Enable live integration tests             | `false`  |

## Architecture

### Canonical vs Advisory Outputs

The system produces two types of outputs:

1. **Canonical Outputs** (deterministic, audit-critical):
   - `findings[]` - Validation issues found
   - `validatedFields[]` - All rules with pass/fail status
   - `extracted_fields.json` - Extracted document data

2. **Advisory Outputs** (supplementary, never affects pass/fail):
   - `insights.json` - Gemini-generated suggestions
   - Always marked with `isAdvisoryOnly: true`

**CRITICAL**: Gemini insights must NEVER affect canonical findings or validatedFields.

### OCR Adapter Pattern

```
server/services/ocrAdapter/
├── types.ts          # OCR interfaces and types
├── mistralAdapter.ts # Mistral OCR 2503 implementation
├── mockAdapter.ts    # Mock adapter for testing
└── index.ts          # Factory and exports
```

### Interpreter Adapter Pattern

```
server/services/interpreterAdapter/
├── types.ts          # Interpreter interfaces and types
├── geminiAdapter.ts  # Gemini 2.5 Pro implementation
├── mockAdapter.ts    # Mock adapter for testing
└── index.ts          # Factory and exports
```

## Development

### Prerequisites

- Node.js 22+
- pnpm 9+
- MySQL 8+

### Setup

```bash
# Install dependencies
pnpm install

# Set up environment
cp .env.example .env
# Edit .env with your configuration

# Run database migrations
pnpm db:migrate

# Start development server
pnpm dev
```

### Testing

```bash
# Run all tests (no secrets required)
unset MISTRAL_API_KEY GEMINI_API_KEY RUN_LIVE_TESTS && pnpm test

# Run with live integrations (requires API keys)
RUN_LIVE_TESTS=true pnpm test

# Type check
pnpm check
```

### CI/CD

The CI pipeline is designed to pass without external API secrets:

- **Default CI**: Unit tests, type check, lint, E2E (mocked)
- **Live Integration**: Optional workflow requiring API keys
- **Visual Regression**: Quarantined to nightly runs

## Troubleshooting

### OCR Issues

**Problem**: `MISTRAL_API_KEY not configured`
**Solution**: Set the `MISTRAL_API_KEY` environment variable

**Problem**: `CIRCUIT_BREAKER_OPEN`
**Solution**: OCR service is rate-limited. Wait and retry, or check API status.

### Gemini Issues

**Problem**: Empty insights returned
**Solution**: Verify `ENABLE_GEMINI_INSIGHTS=true` and `GEMINI_API_KEY` is set

**Problem**: Insights affecting canonical output
**Solution**: This is a bug. Gemini output should never affect findings/validatedFields.

### Logging Safety

**Problem**: OCR text appearing in logs
**Solution**: Use `createSafeLogger()` from `server/utils/safeLogger.ts` for all external service logging.

## Security

- PII is automatically redacted in logs using `safeLogger`
- OCR text is never logged (forbidden fields: `markdown`, `rawText`, `ocrText`)
- API keys are never committed (use `.env.example` as template)
- See [SECURITY.md](SECURITY.md) for vulnerability reporting

## License

Proprietary - All rights reserved

## Related Repositories

- [AI-Scheduler](https://github.com/cgtqwmwkhp-rgb/AI-Scheduler): A backend service responsible for complex scheduling and optimization algorithms.
