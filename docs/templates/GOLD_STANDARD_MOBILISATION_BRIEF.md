# Gold Standard Mobilisation Brief

**Audience:** Engineering Lead  
**Purpose:** Author and activate form-family gold templates so Job Sheet QA judgment matches real PlantExpand documents (Job Summary / Compliance checklist / VOR).  
**Status:** Finding-hygiene improvements ship without these templates; **world-class quality for these forms requires this work.**

---

## 1. Why this is needed

Staging jobs such as `JOB-20260710-N41DNF` and `JOB-20260710-1RAQZT` show the pipeline is alive (OCR, Gemini, findings UI) but judgment is still wrong-shaped:

| Symptom                                    | Root cause                                                            |
| ------------------------------------------ | --------------------------------------------------------------------- |
| Score ~10–40 with many false issues        | Catch-all `standard-maintenance-v1` / default Gold Spec               |
| `serialNumber` ← mileage text              | Legacy field IDs + wrong aliases                                      |
| Signature CONFLICT `Present \| BN21ACO_TL` | Ensemble bleed + wrong template fields                                |
| MEDIUM/LOW template confidence             | No dedicated selection fingerprint for Job Summary / VOR / Compliance |

**Finding hygiene** (ensemble→Gemini hints, conflict normalize, MISSING_FIELD caps) reduces noise. It does **not** replace a correct gold template for the form family.

---

## 2. Canonical model (activation SSOT)

New activatable templates **must** use activation-canonical field IDs — **not** legacy default-template names.

| Required (blocking) | Recommended                            |
| ------------------- | -------------------------------------- |
| `jobReference`      | `expiryDate`                           |
| `assetId`           | `complianceTickboxes`                  |
| `date`              | `customerSignature`                    |
| `engineerSignOff`   | Domain fields (VOR, safe_to_use, etc.) |

**Do not** use legacy IDs from `server/services/templateRegistry/defaultTemplate.ts` for new packs:

- Legacy: `jobNumber`, `serialNumber`, `dateOfService`, `technicianName`, `customerSignature` (as sole sign-off)
- Canonical: `jobReference`, `assetId`, `date`, `engineerSignOff`

**Source of truth:** `server/services/templateRegistry/activationGates.ts`  
**ROI critical regions:** `jobReference`, `assetId`, `date`, `expiryDate`, `tickboxBlock`, `signatureBlock` (`server/services/roiProcessor/roiExtractionService.ts`)

---

## 3. Three target templates

### 3.1 Job Summary Report (`job-summary-v1`)

**Document cues:** “Job Summary Report”, PlantExpand header, Asset No / Make/Model / Mileage, VOR banner optional.

| Layer         | Guidance                                                                                                                                                      |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Fields**    | Blocking 4 + optional work notes, customer/site name, mileage/hours as separate non-serial field                                                              |
| **Selection** | `requiredTokensAll: ["job", "summary"]` or `["job summary"]`; `requiredTokensAny: ["report", "asset", "technician"]`; unique `formCodeRegex` if ops has codes |
| **ROI**       | All 6 critical regions; map asset block → `assetId`; signature → `signatureBlock`                                                                             |
| **Collision** | Must not HIGH-match `maintenance-standard-v1` or default catch-all                                                                                            |

### 3.2 Compliance / Checklist (`compliance-checklist-v1`)

**Closest reference:** `safety-inspection-v1` in `data/pilot-templates/pilot-import-pack.json`

| Layer         | Guidance                                                                                                                                   |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| **Fields**    | Blocking 4 + `expiryDate` + `complianceTickboxes` (boolean / tickbox)                                                                      |
| **Selection** | e.g. `requiredTokensAll: ["compliance"]` or checklist-specific tokens; `requiredTokensAny: ["checklist", "service report", "certificate"]` |
| **ROI**       | Full 6 regions; `tickboxBlock` over checklist grid (Image QA fusion later)                                                                 |
| **Fixtures**  | PASS×2, FAIL (missing critical), REVIEW (incomplete tickboxes / signature)                                                                 |

### 3.3 VOR / Repair Report (`vor-repair-v1`)

**Domain reference:** `server/services/goldStandardSpec.ts`, hints in `fallbackTemplate.ts` (`/VOR|vehicle off road|breakdown|repair report/i`)

| Layer         | Guidance                                                                                                             |
| ------------- | -------------------------------------------------------------------------------------------------------------------- |
| **Fields**    | Blocking 4 + `vorStatus` (boolean) + `safeToUse` (boolean) + optional works completed / return visit                 |
| **Rules**     | Cross-field: if VOR true → safeToUse must be false (custom rule + fixture)                                           |
| **Selection** | `requiredTokensAll: ["vor"]` or `["vehicle", "off", "road"]`; `requiredTokensAny: ["repair", "breakdown", "report"]` |
| **ROI**       | Standard 6 + tickbox regions for VOR / safe-to-use                                                                   |

**Note:** Wasted Journey sheets are **not** this family — see §3.4.

### 3.4 Wasted Journey Sheet (`wasted-journey-v1`)

**Domain reference:** PlantExpand “Wasted Journey Sheet” (abort / no-show / unable to complete visit). **Not** a repair judgment and **not** Job Summary.

| Layer         | Guidance                                                                                                                               |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| **Fields**    | Canonical 4 present (`jobReference` soft); required `assetId`, `date`, `engineerSignOff`, `wastedJourneyReason`; contacts must be Yes  |
| **Rules**     | WJ-C*: reason; scheduling + booking contact **must be Yes**; asset+date+sign-off. No job number / serial / VOR/parts                   |
| **Selection** | `requiredTokensAll: ["wasted", "journey"]`; optional `no-show`, `scheduling`, `plantexpand`                                            |
| **ROI**       | Standard 6; `tickboxBlock` over reason/contact questions; `signatureBlock` over technician sign-off                                    |
| **Fixtures**  | PASS (both contacts Yes), FAIL (missing reason/unsigned), REVIEW (contacts No still selects family)                                    |

**Policy:** Engineer must contact control (Scheduling Team) **and** booking site contact, both answered **Yes**. Job number and serial number are **not** required. Asset No must extract the real id (never the “Asset Details” header).

---

## 4. Ops data checklist (Engineering lead → Ops)

Collect **before** authoring packs:

1. **3–5 redacted PDFs per form family** — PASS, FAIL, edge/ambiguous (no live PII)
2. **Form identifiers** — title strings, form codes, header/footer tokens
3. **Field inventory** — on-form labels → map to canonical IDs above
4. **Validation rules** — required vs optional, date/job-ref formats, VOR/safety cross-rules
5. **ROI coordinates** — normalized 0–1 boxes on page 1 for critical regions
6. **Collision inputs** — list of active template fingerprints to avoid
7. **Synthetic fixture text** — per `docs/templates/TEMPLATE_FIXTURE_PACK_STANDARD.md`

---

## 5. Repo execution steps

1. **Scaffold** — copy pattern from `data/templates-batch-5/batch5-import-pack.json` or `data/pilot-templates/pilot-import-pack.json` into e.g. `data/templates-mobilisation/<family>-import-pack.json`
2. **Author** — `metadata`, `specJson`, `selectionConfigJson`, `roiJson` (import format: `pageIndex` + `{x,y,w,h}`), `fixtures[]`
3. **Dry-run import**
   ```bash
   pnpm tsx scripts/templates/import-pack.ts --file=<pack.json> --dry-run
   ```
4. **Import (draft)**
   ```bash
   pnpm tsx scripts/templates/import-pack.ts --file=<pack.json>
   ```
5. **Fixture matrix**
   ```bash
   pnpm tsx scripts/templates/run-fixture-matrix.ts --versionId=<id>
   ```
6. **Contract test** — mirror `server/tests/contracts/batch5Templates.contract.test.ts`
7. **Activation report** — `generateActivationReport()` / policy gates must pass (critical fields, selection tokens, ROI, fixtures, no fingerprint collision)
8. **Activate** — `activateVersion(versionId)` or tRPC `template.activateVersion` (**no** `skipPreconditions` in staging/prod)
9. **Staging verify**
   - Process sample Job Summary / Compliance / VOR docs
   - Selection trace: HIGH (≥80) or MEDIUM with gap ≥10 (`docs/TEMPLATE_SELECTION_POLICY.md`)
   - Critical fields extract correctly; no serial←mileage; no Present\|asset signature conflicts
10. **Rollback** — deactivate version; reprocess affected jobs (see Batch 5 plan)

---

## 6. Acceptance criteria (definition of done)

For each of the three templates:

- [ ] Import pack validates dry-run
- [ ] Activation gates green (fields, selection, ROI, fixtures, collision)
- [ ] Fixture matrix PASS/FAIL/REVIEW cases pass
- [ ] Staging: real sample selects this template with HIGH or clear MEDIUM (gap ≥10)
- [ ] Staging: findings align with form (no catch-all maintenance pattern noise)
- [ ] Contract test in CI
- [ ] Documented in Spec Management / runbook

---

## 7. References

| Doc / code                  | Path                                                                   |
| --------------------------- | ---------------------------------------------------------------------- |
| Batch 5 onboarding playbook | `docs/templates/BATCH_5_ONBOARDING_PLAN.md`                            |
| Fixture pack standard       | `docs/templates/TEMPLATE_FIXTURE_PACK_STANDARD.md`                     |
| Collision governance        | `docs/templates/COLLISION_GOVERNANCE.md`                               |
| Selection policy            | `docs/TEMPLATE_SELECTION_POLICY.md`                                    |
| SSOT enforcement            | `docs/SSOT_ENFORCEMENT.md`                                             |
| Deploy verify               | `docs/DEPLOY_VERIFY_CHECKLIST.md`                                      |
| Pilot compliance model      | `data/pilot-templates/pilot-import-pack.json` (`safety-inspection-v1`) |
| Batch 5 pack example        | `data/templates-batch-5/batch5-import-pack.json`                       |
| Activation gates            | `server/services/templateRegistry/activationGates.ts`                  |
| Activation policy           | `server/services/templateRegistry/activationPolicy.ts`                 |
| Import pack types           | `server/services/templateRegistry/importPack.ts`                       |
| Domain VOR fields           | `server/services/goldStandardSpec.ts`                                  |
| Fallback hints              | `server/services/templateRegistry/fallbackTemplate.ts`                 |

---

## 8. Sequencing vs finding hygiene

| Workstream                                                                | Owner                  | Outcome                                             |
| ------------------------------------------------------------------------- | ---------------------- | --------------------------------------------------- |
| Finding hygiene (ensemble→Gemini, conflict normalize, MISSING_FIELD caps) | Platform / this PR     | Cleaner findings **without** new templates          |
| Gold mobilisation (this brief)                                            | Engineering Lead + Ops | Correct judgment for Job Summary / Compliance / VOR |

**Recommendation:** Keep hygiene on staging; run this mobilisation as the next quality milestone. Do not promote “world-class” claims for these form families until at least Job Summary + Compliance templates are active and verified on staging.
