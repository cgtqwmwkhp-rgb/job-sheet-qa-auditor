# Azure Container Apps Deployment Guide

This document describes how to deploy Job Sheet QA Auditor to Azure Container Apps.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        GitHub Actions                            │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────────┐   │
│  │ Build & Test │───▶│ Push to ACR  │───▶│ Deploy to ACA    │   │
│  └──────────────┘    └──────────────┘    └──────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                         Azure                                    │
│                                                                  │
│  ┌──────────────────┐                                           │
│  │ Container        │                                           │
│  │ Registry (ACR)   │                                           │
│  └────────┬─────────┘                                           │
│           │                                                      │
│           ▼                                                      │
│  ┌──────────────────┐         ┌──────────────────┐              │
│  │ Container App    │◀───────▶│ MySQL Flexible   │              │
│  │ (staging)        │         │ Server           │              │
│  └──────────────────┘         └──────────────────┘              │
│           │                            │                         │
│           │                            │                         │
│  ┌──────────────────┐         ┌──────────────────┐              │
│  │ Container App    │         │ Azure Blob       │              │
│  │ (production)     │◀───────▶│ Storage          │              │
│  └──────────────────┘         └──────────────────┘              │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Prerequisites

1. **Azure Subscription** with Contributor access
2. **Azure CLI** installed locally
3. **GitHub repository** with Actions enabled

## Azure Resources Required

| Resource | Purpose | SKU/Tier |
|----------|---------|----------|
| Resource Group | Container for all resources | - |
| Container Registry (ACR) | Docker image storage | Basic or Standard |
| Container Apps Environment | Hosting environment | Consumption |
| Container App (staging) | Staging deployment | Consumption |
| Container App (production) | Production deployment | Consumption |
| MySQL Flexible Server | Database | Burstable B1ms |
| Storage Account | Blob storage for files | Standard LRS |
| Key Vault | Secrets management | Standard |

## Environment Matrix

### Required Environment Variables

| Variable | Staging | Production | Description |
|----------|---------|------------|-------------|
| `NODE_ENV` | production | production | Node environment |
| `PORT` | 3000 | 3000 | Server port |
| `DATABASE_URL` | mysql://... | mysql://... | MySQL connection string |
| `STORAGE_PROVIDER` | azure | azure | Storage backend |
| `AZURE_STORAGE_CONNECTION_STRING` | (from Key Vault) | (from Key Vault) | Blob storage connection |
| `AZURE_STORAGE_CONTAINER_NAME` | jobsheets-staging | jobsheets-prod | Container name |
| `GIT_SHA` | (set by CI) | (set by CI) | Deployed commit SHA |
| `PLATFORM_VERSION` | (set by CI) | (set by CI) | Branch/tag name |
| `BUILD_TIME` | (set by CI) | (set by CI) | Build timestamp |

### Safety Defaults (Always Set)

| Variable | Value | Description |
|----------|-------|-------------|
| `ENABLE_PURGE_EXECUTION` | false | Disables destructive operations |
| `ENABLE_SCHEDULER` | false | Disables background scheduler |

### Optional Environment Variables

| Variable | Description |
|----------|-------------|
| `MISTRAL_API_KEY` | Mistral OCR API key |
| `GEMINI_API_KEY` | Gemini AI API key |
| `ENABLE_GEMINI_INSIGHTS` | Enable AI insights (true/false) |
| `OAUTH_SERVER_URL` | OAuth server for authentication |
| `VITE_OAUTH_PORTAL_URL` | OAuth portal URL |

## GitHub Configuration

### Repository Secrets

Configure these in **Settings → Secrets and variables → Actions → Secrets**:

| Secret | Required | Description | Example |
|--------|----------|-------------|---------|
| `AZURE_CREDENTIALS` | ✅ | Service Principal JSON | `{"clientId":..., "clientSecret":...}` |
| `ACR_LOGIN_SERVER` | ✅ | ACR login server | `myregistry.azurecr.io` |
| `ACR_USERNAME` | ✅ | ACR admin username | `myregistry` |
| `ACR_PASSWORD` | ✅ | ACR admin password | (from Azure Portal → ACR → Access keys) |
| `AZURE_RESOURCE_GROUP` | ✅ | Resource group name | `rg-jobsheet-qa` |
| `STAGING_CONTAINER_APP` | ✅ | Staging app name | `jobsheet-qa-staging` |
| `PRODUCTION_CONTAINER_APP` | ❌ | Production app name | `jobsheet-qa-prod` |
| `DATABASE_URL` | ✅ | MySQL connection string | `mysql://user:pass@host:3306/db?ssl=...` |
| `AZURE_STORAGE_CONNECTION_STRING` | ✅ | Blob storage connection | `DefaultEndpointsProtocol=https;...` |

### GitHub Environment Variables

Configure these in **Settings → Environments → [staging/production] → Environment variables**:

| Variable | Staging Value | Production Value | Description |
|----------|---------------|------------------|-------------|
| `STORAGE_PROVIDER` | `azure` | `azure` | Storage backend type |
| `AZURE_STORAGE_CONTAINER_NAME` | `jobsheets-staging` | `jobsheets` | Blob container name |
| `ENABLE_PURGE_EXECUTION` | `false` | `false` | Disable destructive ops |
| `ENABLE_SCHEDULER` | `false` | `true` | Background scheduler |

### Quick Setup Checklist

```bash
# 1. Create Service Principal for GitHub Actions
az ad sp create-for-rbac \
  --name "github-actions-jobsheet-qa" \
  --role Contributor \
  --scopes /subscriptions/<subscription-id>/resourceGroups/<resource-group> \
  --sdk-auth

# 2. Get ACR credentials
az acr credential show --name <acr-name>

# 3. Get Storage connection string
az storage account show-connection-string --name <storage-account> -o tsv

# 4. Get MySQL connection string
# Format: mysql://username:password@hostname:3306/database?ssl={"rejectUnauthorized":true}
```

### Secrets Verification Script

Run this to verify all required secrets are available:

```bash
# In GitHub Actions or locally with gh CLI
gh secret list --json name | jq -r '.[] | .name' | while read secret; do
  echo "✅ $secret"
done
```

## Deployment Workflow

### Automatic Deployment (Push to main)

1. Push to `main` branch triggers the workflow
2. Build, test, and push image to ACR
3. Deploy to **staging** automatically
4. Run release verification on staging
5. Production requires manual trigger

### Manual Deployment

```bash
# Deploy to staging
gh workflow run azure-deploy.yml -f environment=staging

# Deploy to production (after staging is verified)
gh workflow run azure-deploy.yml -f environment=production
```

### Rollback

To rollback to a previous version:

```bash
# Find the SHA of the working version
git log --oneline

# Deploy that specific SHA
az containerapp update \
  --name <container-app-name> \
  --resource-group <resource-group> \
  --image <acr>.azurecr.io/job-sheet-qa-auditor:<sha>
```

## Health Endpoints

The application exposes these endpoints for Azure Container Apps health probes:

| Endpoint | Type | Purpose |
|----------|------|---------|
| `/healthz` | Liveness | Is the process alive? |
| `/readyz` | Readiness | Is the service ready for traffic? |
| `/metrics` | Prometheus | Application metrics |

### Configure in Container App

```bash
az containerapp update \
  --name <app-name> \
  --resource-group <rg> \
  --set-env-vars ... \
  --probe-liveness path=/healthz port=3000 \
  --probe-readiness path=/readyz port=3000
```

## Release Verification

After deployment, the workflow automatically runs release verification:

### Staging (Soft Mode)
- Smoke checks pass/warn
- Monitoring snapshot captured
- Continues to next step on warnings

### Production (Strict Mode)
- Smoke checks must pass
- `/metrics` endpoint required (ADR-003)
- Fails deployment on any issue

## Troubleshooting

### Container Won't Start

1. Check system logs for startup errors:
   ```bash
   az containerapp logs show --name <app> --resource-group <rg> --type system --tail 50
   ```

2. Check console logs for application errors:
   ```bash
   az containerapp logs show --name <app> --resource-group <rg> --type console --tail 50
   ```

3. Verify environment variables:
   ```bash
   az containerapp show --name <app> --resource-group <rg> --query "properties.template.containers[0].env"
   ```

4. Check `/readyz` endpoint for specific failures

### Image Pull Failed (ImagePullUnauthorized)

This is the most common deployment issue. The Container App cannot pull the image from ACR.

**Solution 1: Configure ACR credentials on Container App**
```bash
az containerapp registry set \
  --name <container-app> \
  --resource-group <resource-group> \
  --server <acr>.azurecr.io \
  --username <acr-username> \
  --password "<acr-password>"
```

**Solution 2: Use Managed Identity (Recommended for production)**
```bash
# Enable system-assigned identity
az containerapp identity assign --name <app> --resource-group <rg> --system-assigned

# Get the identity principal ID
PRINCIPAL_ID=$(az containerapp show --name <app> --resource-group <rg> --query identity.principalId -o tsv)

# Grant AcrPull role
az role assignment create \
  --role AcrPull \
  --assignee-object-id $PRINCIPAL_ID \
  --assignee-principal-type ServicePrincipal \
  --scope $(az acr show --name <acr> --query id -o tsv)

# Configure registry to use managed identity
az containerapp registry set \
  --name <app> \
  --resource-group <rg> \
  --server <acr>.azurecr.io \
  --identity system
```

### Image Tag Not Found

The workflow builds images with short SHA tags (7 characters). Ensure you're deploying with the correct tag:

```bash
# List available tags
az acr repository show-tags --name <acr> --repository job-sheet-qa-auditor

# Deploy with correct tag
az containerapp update --name <app> --resource-group <rg> --image <acr>.azurecr.io/job-sheet-qa-auditor:latest
```

### Database Connection Failed

1. Verify `DATABASE_URL` is correctly formatted:
   ```
   mysql://user:password@host:3306/database?ssl={"rejectUnauthorized":true}
   ```
2. Check MySQL server firewall allows Azure services
3. Verify SSL settings in connection string

### Storage Health Check Failed

1. Verify `STORAGE_PROVIDER=azure` is set
2. Verify `AZURE_STORAGE_CONNECTION_STRING` is set as a secret
3. Verify `@azure/storage-blob` is in package.json dependencies
4. Verify container exists in storage account:
   ```bash
   az storage container list --connection-string "<connection-string>" --query "[].name"
   ```

### Startup Probe Failed

The default probe expects the app to respond on port 3000 within 30 seconds.

1. Check if the app is listening on the correct port
2. Increase startup probe timeout if needed:
   ```bash
   az containerapp update --name <app> --resource-group <rg> \
     --startup-probe-timeout 60 \
     --startup-probe-initial-delay 10
   ```

## Security Considerations

1. **Never commit secrets** to the repository
2. Use **Key Vault references** for sensitive values
3. Enable **Managed Identity** for Azure resource access
4. Configure **private endpoints** for database and storage
5. Set `ENABLE_PURGE_EXECUTION=false` in production

## Cost Optimization

- Use **Consumption** tier for Container Apps
- Use **Burstable** tier for MySQL
- Enable **auto-scaling** based on HTTP traffic
- Consider **reserved capacity** for predictable workloads

