# Environment Variables Setup Guide

This guide explains how to configure GitHub Environment variables for the Job Sheet QA Auditor deployment workflow.

## Overview

The deployment workflow uses **GitHub Environments** to isolate staging and production configurations. Each environment has its own set of variables that control which Azure resources are targeted.

### Why Environment Variables (not Secrets)?

| Type | Use Case | Visibility |
|------|----------|------------|
| `vars.*` | Resource names, URLs (non-sensitive) | Visible in logs |
| `secrets.*` | Credentials, connection strings | Masked in logs |

Using `vars.*` for resource group and container app names:
- ✅ Allows debugging (values shown in workflow logs)
- ✅ Prevents accidental cross-environment deployments
- ✅ Environment isolation enforced by GitHub

## Required Configuration

### Step 1: Navigate to Repository Settings

1. Go to your GitHub repository
2. Click **Settings** → **Environments**
3. You should see `staging` and `production` environments

If environments don't exist:
- Click **New environment**
- Name it exactly `staging` (lowercase)
- Repeat for `production`

### Step 2: Configure Staging Environment

1. Click on the **staging** environment
2. Under **Environment variables**, click **Add variable**
3. Add these variables:

| Variable Name | Value | Description |
|---------------|-------|-------------|
| `AZURE_RESOURCE_GROUP` | `rg-jobsheet-qa` | Azure Resource Group |
| `CONTAINER_APP_NAME` | `ca-job-sheet-qa-auditor-staging` | Container App name |
| `STAGING_URL` | `https://ca-job-sheet-qa-auditor-staging.graywater-15013590.uksouth.azurecontainerapps.io` | App URL |

**Screenshot location:** Repository → Settings → Environments → staging

### Step 3: Configure Production Environment

1. Click on the **production** environment
2. Under **Environment variables**, click **Add variable**
3. Add these variables:

| Variable Name | Value | Description |
|---------------|-------|-------------|
| `AZURE_RESOURCE_GROUP` | `plantex-assist` | Azure Resource Group |
| `CONTAINER_APP_NAME` | `plantex-assist` | Container App name |
| `PRODUCTION_URL` | `https://plantex-assist.graywater-15013590.uksouth.azurecontainerapps.io` | App URL |

### Step 4: Verify Repository Secrets

The following **repository-level secrets** (not environment-scoped) must be set:

| Secret Name | Description | Required |
|-------------|-------------|----------|
| `AZURE_CREDENTIALS` | Azure Service Principal JSON | ✅ Yes |
| `ACR_LOGIN_SERVER` | e.g., `myregistry.azurecr.io` | ✅ Yes |
| `ACR_USERNAME` | ACR admin username | ✅ Yes |
| `ACR_PASSWORD` | ACR admin password | ✅ Yes |
| `DATABASE_URL` | MySQL connection string | ⚠️ Optional |
| `AZURE_STORAGE_CONNECTION_STRING` | Blob storage connection | ⚠️ Optional |

These are at: Repository → Settings → Secrets and variables → Actions → **Repository secrets**

## Verification Steps

### 1. Run Governance Check Locally

```bash
pnpm governance:check
```

Expected output:
```
🔍 Environment Contract Governance Check
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📋 Checking environment contract...
📋 Checking workflow files...

✅ All governance checks passed!
```

### 2. Trigger a Staging Deployment

1. Go to **Actions** → **Azure Deploy**
2. Click **Run workflow**
3. Select `staging` environment
4. Click **Run workflow**

Watch for the "Validate environment variables" step - it should show:
```
=== Environment Variable Validation ===
Target Resource Group: rg-jobsheet-qa
Target Container App:  ca-job-sheet-qa-auditor-staging
Target URL:            https://ca-job-sheet-qa-auditor-staging...
✅ Environment variables validated
```

### 3. Verify Endpoint Health

After deployment, verify endpoints:

```bash
# Staging
STAGING_URL="https://ca-job-sheet-qa-auditor-staging.graywater-15013590.uksouth.azurecontainerapps.io"

curl -s "$STAGING_URL/healthz" | jq .
curl -s "$STAGING_URL/readyz" | jq .
curl -s "$STAGING_URL/metrics" | head -5
```

Expected `/healthz` response:
```json
{
  "status": "healthy",
  "timestamp": "2026-01-11T12:00:00.000Z"
}
```

Expected `/metrics` response (Prometheus format):
```
# HELP process_cpu_user_seconds_total Total user CPU time spent in seconds.
# TYPE process_cpu_user_seconds_total counter
...
```

## Deprecated Configuration (Do Not Use)

The following **repository secrets** are DEPRECATED and should NOT be used:

| ❌ Deprecated Secret | ✅ Replacement |
|---------------------|----------------|
| `AZURE_RESOURCE_GROUP` | `vars.AZURE_RESOURCE_GROUP` (per environment) |
| `STAGING_CONTAINER_APP` | `vars.CONTAINER_APP_NAME` (staging env) |
| `PRODUCTION_CONTAINER_APP` | `vars.CONTAINER_APP_NAME` (production env) |

These secrets may still exist but are **not referenced** by the workflows. You can safely delete them.

## Troubleshooting

### Error: "vars.AZURE_RESOURCE_GROUP is not set"

**Cause:** Environment variable not configured in GitHub Environment.

**Fix:**
1. Go to Repository → Settings → Environments → [staging/production]
2. Add the missing variable under "Environment variables"

### Error: "The containerapp '...' does not exist"

**Cause:** Either:
- `CONTAINER_APP_NAME` is wrong
- `AZURE_RESOURCE_GROUP` is wrong (app exists but in different RG)

**Fix:**
1. Verify in Azure Portal that the Container App exists
2. Check the Resource Group matches what's in the variable

### Error: "STAGING_URL must start with https://"

**Cause:** URL variable set without `https://` prefix.

**Fix:** Update the URL variable to include the full URL with `https://`.

## Architecture Reference

```
┌─────────────────────────────────────────────────────────────────┐
│                     GitHub Repository                           │
├─────────────────────────────────────────────────────────────────┤
│  Repository Secrets (shared):                                   │
│    • AZURE_CREDENTIALS                                          │
│    • ACR_LOGIN_SERVER, ACR_USERNAME, ACR_PASSWORD              │
│    • DATABASE_URL, AZURE_STORAGE_CONNECTION_STRING (optional)  │
├─────────────────────────────────────────────────────────────────┤
│  Environment: staging                                           │
│    vars.AZURE_RESOURCE_GROUP = "rg-jobsheet-qa"                │
│    vars.CONTAINER_APP_NAME = "ca-job-sheet-qa-auditor-staging" │
│    vars.STAGING_URL = "https://..."                            │
├─────────────────────────────────────────────────────────────────┤
│  Environment: production                                        │
│    vars.AZURE_RESOURCE_GROUP = "plantex-assist"                │
│    vars.CONTAINER_APP_NAME = "plantex-assist"                  │
│    vars.PRODUCTION_URL = "https://..."                         │
└─────────────────────────────────────────────────────────────────┘
           │                           │
           ▼                           ▼
┌──────────────────────┐    ┌──────────────────────┐
│  Azure Resource:     │    │  Azure Resource:     │
│  rg-jobsheet-qa      │    │  plantex-assist      │
│                      │    │                      │
│  Container App:      │    │  Container App:      │
│  ca-job-sheet-qa-    │    │  plantex-assist      │
│  auditor-staging     │    │                      │
└──────────────────────┘    └──────────────────────┘
```

## Contract Reference

See `docs/operations/environment-contract.json` for the machine-readable environment contract that governance checks validate against.
