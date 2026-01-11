# Template Batch 5 Onboarding Plan

## Overview

This document outlines the plan for onboarding the next 5 templates (Batch 5) to the Job Sheet QA Auditor system. Following the established patterns from Batches 1-4, this plan ensures deterministic template selection, comprehensive fixture suites, and proper activation governance.

## Batch 5 Template Candidates

| # | Template ID | Name | Document Type | Priority |
|---|-------------|------|---------------|----------|
| 1 | `water-treatment-v1` | Water Treatment System Service | Utility/Environmental | High |
| 2 | `solar-panel-v1` | Solar Panel Inspection Report | Renewable Energy | High |
| 3 | `access-control-v1` | Access Control System Test | Security | Medium |
| 4 | `emergency-lighting-v1` | Emergency Lighting Test Certificate | Safety/Compliance | High |
| 5 | `refrigeration-v1` | Refrigeration System Service | HVAC/Cold Chain | Medium |

## Input Pack Requirements

Each template must include:

### 1. Metadata
```json
{
  "templateId": "<unique-template-id>",
  "name": "<human-readable-name>",
  "version": "1.0.0",
  "createdBy": "<author-id>"
}
```

### 2. Specification JSON (specJson)
```json
{
  "name": "<spec-name>",
  "version": "1.0.0",
  "fields": [
    { "field": "jobReference", "label": "Job Reference", "type": "string", "required": true },
    { "field": "assetId", "label": "Asset ID", "type": "string", "required": true },
    { "field": "date", "label": "Date", "type": "date", "required": true },
    { "field": "expiryDate", "label": "Expiry Date", "type": "date", "required": true },
    { "field": "engineerSignOff", "label": "Engineer Sign Off", "type": "boolean", "required": true },
    { "field": "complianceTickboxes", "label": "Compliance Tickboxes", "type": "tickbox_array", "required": true }
  ],
  "rules": [
    { "ruleId": "R001", "field": "jobReference", "description": "Required", "severity": "critical", "type": "required", "enabled": true },
    // ... additional rules
  ]
}
```

**Required Fields (all 6 critical fields must be defined):**
- `jobReference`
- `assetId`
- `date`
- `expiryDate`
- `engineerSignOff`
- `complianceTickboxes`

### 3. Selection Configuration (selectionConfig)
```json
{
  "requiredTokensAll": ["<token1>", "<token2>"],
  "requiredTokensAny": ["<token3>", "<token4>"],
  "formCodeRegex": "<optional-regex-pattern>"
}
```

**Selection Uniqueness Requirements:**
- Each template must have a unique combination of `requiredTokensAll` and `requiredTokensAny`
- No two templates should match the same document with HIGH confidence
- Ambiguity threshold: runner-up delta must be > 10%

### 4. ROI Configuration (roiJson)
```json
{
  "regions": [
    { "name": "jobReference", "page": 1, "bounds": { "x": 0.05, "y": 0.1, "width": 0.4, "height": 0.05 } },
    { "name": "assetId", "page": 1, "bounds": { "x": 0.5, "y": 0.1, "width": 0.45, "height": 0.05 } },
    { "name": "date", "page": 1, "bounds": { "x": 0.7, "y": 0.02, "width": 0.25, "height": 0.04 } },
    { "name": "expiryDate", "page": 1, "bounds": { "x": 0.7, "y": 0.08, "width": 0.25, "height": 0.04 } },
    { "name": "tickboxBlock", "page": 1, "bounds": { "x": 0.05, "y": 0.25, "width": 0.9, "height": 0.4 } },
    { "name": "signatureBlock", "page": 1, "bounds": { "x": 0, "y": 0.85, "width": 1, "height": 0.15 } }
  ]
}
```

**Critical ROI Requirements:**
- All 6 critical field regions must be defined
- `tickboxBlock` and `signatureBlock` required for image QA
- Coordinates normalized 0-1

### 5. Fixture Pack
Each template must include minimum 3 fixture cases:

| Case Type | Count | Description |
|-----------|-------|-------------|
| PASS | ≥1 | Complete document with all fields valid |
| FAIL | ≥1 | Document missing required field(s) |
| EDGE | ≥1 | Low confidence or ambiguous content |

```json
{
  "fixtures": [
    {
      "caseId": "<TEMPLATE-PASS-001>",
      "description": "Complete document",
      "inputText": "<simulated OCR text>",
      "expectedOutcome": "pass",
      "required": true
    },
    {
      "caseId": "<TEMPLATE-FAIL-001>",
      "description": "Missing job reference",
      "inputText": "<simulated OCR text without job ref>",
      "expectedOutcome": "fail",
      "expectedReasonCodes": ["MISSING_FIELD"],
      "required": true
    }
  ]
}
```

## Activation Gate Steps

### Pre-Activation Checklist

| Step | Gate | Description | Auto/Manual |
|------|------|-------------|-------------|
| 1 | Schema Valid | Import pack passes JSON schema validation | Auto |
| 2 | Unique ID | Template ID not already in use | Auto |
| 3 | Selection Config | All required tokens present | Auto |
| 4 | Critical Fields | All 6 critical fields defined in spec | Auto |
| 5 | ROI Complete | All 6 critical ROI regions defined | Auto |
| 6 | Fixture Pack | Minimum 3 fixtures with PASS/FAIL cases | Auto |
| 7 | Fixture Matrix | All required fixtures pass | Auto |
| 8 | Collision Check | No HIGH confidence collision with existing templates | Auto |
| 9 | Ambiguity Review | Runner-up delta > 10% for test documents | Auto |
| 10 | Activation Report | Report generated and reviewed | Manual |

### Activation Workflow

```
1. Import pack validation
   └─> FAIL: Return validation errors
   └─> PASS: Continue

2. Create template (draft state)
   └─> Store metadata, specJson, selectionConfig

3. Upload version with ROI
   └─> Validate ROI schema

4. Create fixture pack
   └─> Associate fixtures with version

5. Run fixture matrix
   └─> All required cases must pass
   └─> FAIL: Block activation, return report
   └─> PASS: Continue

6. Collision detection
   └─> Run selection against all existing templates
   └─> Flag any HIGH confidence matches
   └─> COLLISION: Block activation
   └─> CLEAR: Continue

7. Generate activation report
   └─> Include fixture results, ROI summary, collision check

8. Activate version
   └─> Policy check passes
   └─> Version marked active
```

## Ambiguity Thresholds

| Metric | Threshold | Action if Exceeded |
|--------|-----------|-------------------|
| Runner-up delta | < 10% | Flag for review, consider fingerprint adjustment |
| Confidence | < 70% | Route to REVIEW_QUEUE |
| Collision rate | > 0% | Block activation |
| Override rate | > 5% | Flag template for fingerprint review |

## Import Pack JSON Format

```json
{
  "packVersion": "1.0",
  "createdAt": "2026-01-11T00:00:00Z",
  "createdBy": "template-admin",
  "templates": [
    {
      "metadata": {
        "templateId": "water-treatment-v1",
        "name": "Water Treatment System Service",
        "version": "1.0.0"
      },
      "specJson": { /* ... */ },
      "selectionConfig": { /* ... */ },
      "roiJson": { /* ... */ },
      "fixtures": [ /* ... */ ]
    },
    // ... additional templates
  ]
}
```

## Batch 5 Specific Selection Fingerprints

| Template | requiredTokensAll | requiredTokensAny | formCodeRegex |
|----------|-------------------|-------------------|---------------|
| water-treatment-v1 | `["water", "treatment"]` | `["service", "maintenance"]` | `WT-\d+` |
| solar-panel-v1 | `["solar", "panel"]` | `["inspection", "survey"]` | `SP-\d+` |
| access-control-v1 | `["access", "control"]` | `["test", "commissioning"]` | `AC-\d+` |
| emergency-lighting-v1 | `["emergency", "lighting"]` | `["test", "certificate"]` | `EL-\d+` |
| refrigeration-v1 | `["refrigeration"]` | `["service", "maintenance", "repair"]` | `RF-\d+` |

## Collision Risk Assessment

### Against Existing Templates

| Batch 5 Template | Potential Collision | Mitigation |
|------------------|---------------------|------------|
| water-treatment-v1 | None identified | N/A |
| solar-panel-v1 | None identified | N/A |
| access-control-v1 | security-alarm-v1 | Add "access" to requiredTokensAll |
| emergency-lighting-v1 | fire-alarm-v1 | Add "emergency" to requiredTokensAll |
| refrigeration-v1 | hvac-service-v1 | Add "refrigeration" to requiredTokensAll |

## Success Criteria

1. All 5 templates imported successfully
2. All fixture matrices pass (100%)
3. No collisions with existing templates
4. Activation reports generated for all templates
5. Ambiguity rate < 5%
6. CI tests remain green

## Timeline

| Phase | Duration | Activities |
|-------|----------|------------|
| Pack Authoring | 2 days | Create import pack JSON for all 5 templates |
| Validation | 1 day | Run dry-run import, fix validation errors |
| Fixture Development | 2 days | Create comprehensive fixture cases |
| Import & Test | 1 day | Import to staging, run fixture matrix |
| Review | 1 day | Review activation reports, ambiguity analysis |
| Activation | 1 day | Activate all templates, update CI |

## Rollback Plan

If any template causes issues post-activation:

1. Deactivate the problematic template version
2. Check if any audits reference the template
3. If audits exist, mark them for re-processing
4. Fix template configuration
5. Re-run activation workflow

## Appendix: Sample Import Pack (Template 1)

```json
{
  "metadata": {
    "templateId": "water-treatment-v1",
    "name": "Water Treatment System Service",
    "version": "1.0.0"
  },
  "specJson": {
    "name": "Water Treatment Service Spec",
    "version": "1.0.0",
    "fields": [
      { "field": "jobReference", "label": "Job Reference", "type": "string", "required": true },
      { "field": "assetId", "label": "Asset ID", "type": "string", "required": true },
      { "field": "date", "label": "Date", "type": "date", "required": true },
      { "field": "expiryDate", "label": "Expiry Date", "type": "date", "required": true },
      { "field": "engineerSignOff", "label": "Engineer Sign Off", "type": "boolean", "required": true },
      { "field": "complianceTickboxes", "label": "Compliance Tickboxes", "type": "tickbox_array", "required": true }
    ],
    "rules": [
      { "ruleId": "R001", "field": "jobReference", "description": "Required", "severity": "critical", "type": "required", "enabled": true },
      { "ruleId": "R002", "field": "assetId", "description": "Required", "severity": "critical", "type": "required", "enabled": true },
      { "ruleId": "R003", "field": "date", "description": "Required", "severity": "critical", "type": "required", "enabled": true },
      { "ruleId": "R004", "field": "expiryDate", "description": "Required", "severity": "critical", "type": "required", "enabled": true },
      { "ruleId": "R005", "field": "engineerSignOff", "description": "Required", "severity": "critical", "type": "required", "enabled": true },
      { "ruleId": "R006", "field": "complianceTickboxes", "description": "Required", "severity": "critical", "type": "required", "enabled": true }
    ]
  },
  "selectionConfig": {
    "requiredTokensAll": ["water", "treatment"],
    "requiredTokensAny": ["service", "maintenance"]
  },
  "roiJson": {
    "regions": [
      { "name": "jobReference", "page": 1, "bounds": { "x": 0.05, "y": 0.1, "width": 0.4, "height": 0.05 } },
      { "name": "assetId", "page": 1, "bounds": { "x": 0.5, "y": 0.1, "width": 0.45, "height": 0.05 } },
      { "name": "date", "page": 1, "bounds": { "x": 0.7, "y": 0.02, "width": 0.25, "height": 0.04 } },
      { "name": "expiryDate", "page": 1, "bounds": { "x": 0.7, "y": 0.08, "width": 0.25, "height": 0.04 } },
      { "name": "tickboxBlock", "page": 1, "bounds": { "x": 0.05, "y": 0.25, "width": 0.9, "height": 0.4 } },
      { "name": "signatureBlock", "page": 1, "bounds": { "x": 0, "y": 0.85, "width": 1, "height": 0.15 } }
    ]
  },
  "fixtures": [
    {
      "caseId": "WT-PASS-001",
      "description": "Complete water treatment service report",
      "inputText": "Water Treatment System Service Report\\nJob Reference: WT-2026-001\\nAsset ID: WT-ASSET-001\\nDate: 2026-01-15\\nExpiry Date: 2027-01-15\\nEngineer Sign Off: Complete\\nCompliance: All checks passed",
      "expectedOutcome": "pass",
      "required": true
    },
    {
      "caseId": "WT-FAIL-001",
      "description": "Missing job reference",
      "inputText": "Water Treatment System Service Report\\nAsset ID: WT-ASSET-001\\nDate: 2026-01-15\\nExpiry Date: 2027-01-15",
      "expectedOutcome": "fail",
      "expectedReasonCodes": ["MISSING_FIELD"],
      "required": true
    },
    {
      "caseId": "WT-EDGE-001",
      "description": "Low confidence date",
      "inputText": "Water Treatment System Service Report\\nJob Reference: WT-2026-001\\nAsset ID: WT-ASSET-001\\nDate: Jan 15 26\\nExpiry Date: unclear",
      "expectedOutcome": "needs_review",
      "expectedReasonCodes": ["LOW_CONFIDENCE"],
      "required": false
    }
  ]
}
```
