# AI-07 eval note — Google Document AI / AWS Textract as 3rd voter

**Lane:** PR-AI-06 (FormModel) · covers AI-06 scaffold + AI-07 eval  
**Status:** Eval only — not integrated in this PR  
**Date:** 2026-07-14

## Recommendation

Keep **Azure DI custom neural** (AI-06, this PR) as the form-specific step-change path for PlantExpand JSRs. Treat **Google Document AI Custom Extractor / Form Parser** and **AWS Textract Queries + AnalyzeDocument** as optional **3rd voters** only after the Azure custom model shows lift on a labeled golden set.

## Why not integrate now

| Provider | Fit for PlantExpand Ok/Adv/Fail/N/A grids | Effort | Gap vs current stack |
| --- | --- | --- | --- |
| Azure DI custom neural (AI-06) | Best: train on our sheets; selection marks + labeled fields | L (labeling) / S (this scaffold) | Direct insert at `ocrAdapter` + `selectionMarks` voter |
| Google Document AI Custom Extractor | Strong on messy scans + handwriting entities | M–L | New GCP project, billing, IAM; parallel leaf |
| AWS Textract Queries | Query-per-field (“Job Number?”, “Safe to use?”) + `SELECT_MARK` | M | New AWS account path; query schema maintenance |

Dual-cloud OCR without a proven Azure custom baseline adds FinOps + failure modes without a clear pp gain story.

## Suggested insert points (if pursued later)

1. **Advisory voter only** → merge into `formatPreExtractedHints` / ensemble `preExtractedFields` in `documentProcessor.ts` (same shape as custom JSR `preExtractedFields`).
2. **Do not** replace Mistral primary OCR or Azure layout geometry until golden-set agreement beats layout+custom on checklist Fail recall.
3. Reuse the `voteChecklistRows` pattern in `selectionMarks/index.ts` for a third source (`preferredSource: "documentai" | "textract"`).

## Exit criteria to open an AI-07 integration PR

- [ ] Azure custom JSR model id live behind `FEATURE_AZURE_DI_CUSTOM_JSR` with ≥200 labeled sheets
- [ ] Checklist Fail recall / structured field F1 improves ≥2 pp vs layout-only on holdout
- [ ] Cost model for Document AI or Textract sampled ≤10% of volume
- [ ] Fail-soft contract tests with fixtures (no live cloud in CI)

## Env (future — not shipped)

```
# Google Document AI (eval)
# FEATURE_DOCUMENT_AI_VOTER=true
# DOCUMENT_AI_PROCESSOR_ID=...
# DOCUMENT_AI_PROJECT_ID=...

# AWS Textract Queries (eval)
# FEATURE_TEXTRACT_VOTER=true
# TEXTRACT_QUERY_SET=jobNumber,safeToUse,returnVisit
```

No `azure-deploy.yml` changes in this lane.
