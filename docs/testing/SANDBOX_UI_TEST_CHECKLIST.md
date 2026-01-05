# Sandbox UI Test Checklist

**Objective:** Verify core user workflows in a running sandbox environment.

**Prerequisites:**
- Application is running (use `scripts/sandbox-start.sh`).
- You have the application URL (e.g., `http://127.0.0.1:3000`).
- You have the sandbox test data pack (`docs/testing/sandbox-fixtures/`).

---

## Test Cases

### 1. Dashboard & Initial State

- [ ] **Step 1:** Open the application URL in your browser.
- [ ] **Step 2:** Verify the main dashboard loads without errors.
- [ ] **Step 3:** Confirm the "Recent Audits" list is initially empty or shows previous test data.
- [ ] **Step 4:** Check that the "Upload Job Sheet" button is visible and clickable.

### 2. Load & Process (Passing Case)

- [ ] **Step 1:** In your terminal, load the passing fixture:
  ```bash
  pnpm exec tsx scripts/load-fixture.ts docs/testing/sandbox-fixtures/fixture_pass.json
  ```
- [ ] **Step 2:** Refresh the application dashboard in your browser.
- [ ] **Step 3:** Verify the new audit record appears in the "Recent Audits" list.
- [ ] **Step 4:** Click on the new audit record to open the results page.
- [ ] **Step 5:** Confirm the document title `Sandbox Test - Passing Case` is displayed correctly.

### 3. Audit Detail Verification (Passing Case)

- [ ] **Step 1:** On the audit results page, check the summary panel.
- [ ] **Step 2:** Verify the "Issues" tab shows `0` issues.
- [ ] **Step 3:** Click the "Passed" tab and confirm it shows a list of passed checks.
- [ ] **Step 4:** Click the "All" tab and verify it shows a complete list of all checks.
- [ ] **Step 5:** Check the "Extracted Fields" section and confirm key-value pairs are displayed.

### 4. Load & Process (Failing Case)

- [ ] **Step 1:** In your terminal, load the failing fixture:
  ```bash
  pnpm exec tsx scripts/load-fixture.ts docs/testing/sandbox-fixtures/fixture_fail_missing_field.json
  ```
- [ ] **Step 2:** Refresh the application dashboard.
- [ ] **Step 3:** Click on the new audit record `Sandbox Test - Missing Field Case`.
- [ ] **Step 4:** Verify the "Issues" tab now shows a count of `1`.
- [ ] **Step 5:** Click the "Issues" tab and confirm the rule `R005 - customerSignature` is listed with the reason `MISSING_FIELD`.

### 5. Exports & Redaction

- [ ] **Step 1:** On the audit results page for the **passing case**, find the "Export" button.
- [ ] **Step 2:** Click "Export" and select "Download JSON Report".
- [ ] **Step 3:** Open the downloaded JSON file.
- [ ] **Step 4:** Verify the JSON is well-formed and contains the `validatedFields` and `findings` arrays.
- [ ] **Step 5:** Confirm that no personally identifiable information (PII) is present in the export.

### 6. Review Timeline (Append-Only)

- [ ] **Step 1:** On the audit results page, find the "Review Timeline" or "Activity Log" section.
- [ ] **Step 2:** Verify the initial "Created" event is present with source `FIXTURE_LOADER`.
- [ ] **Step 3:** Add a comment or change the status (if the UI supports this).
- [ ] **Step 4:** Confirm a new event is appended to the timeline.
- [ ] **Step 5:** Verify that previous events cannot be edited or deleted.

### 7. Version Endpoint Verification

- [ ] **Step 1:** Open a new browser tab.
- [ ] **Step 2:** Navigate to `{APP_URL}/api/trpc/system.version` (e.g., `http://127.0.0.1:3000/api/trpc/system.version`).
- [ ] **Step 3:** Verify the page displays a JSON response.
- [ ] **Step 4:** Confirm the `gitSha` in the JSON response matches the `Deployed SHA` from the `sandbox-start.sh` script output.

---

**Completion:** Once all checkboxes are marked, the sandbox UX verification is complete.


---

## RBAC & PII Safety Confirmation

This section confirms that default sandbox behavior aligns with security best practices.

- **Exports are Redacted:** The default JSON export contains the `validatedFields` and `findings`, but does not include the raw OCR text or the original document. This prevents accidental leakage of sensitive information.

- **No Raw OCR in UI:** The UI displays the extracted field values but does not provide a view of the raw, unprocessed OCR text. This reduces the surface area for PII exposure.

- **Fixture Ingestion is Sandbox-Only:** The `scripts/load-fixture.ts` script is guarded by a `NODE_ENV !== 'production'` check. It is impossible to run this script in a production environment, preventing test data from contaminating the production database.
