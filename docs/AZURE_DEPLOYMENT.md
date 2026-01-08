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

## GitHub Secrets Required

Configure these in your repository's Settings → Secrets → Actions:

### Azure Authentication

| Secret | Description | How to Get |
|--------|-------------|------------|
| `AZURE_CREDENTIALS` | Service Principal JSON | `az ad sp create-for-rbac --sdk-auth` |

### Container Registry

| Secret | Description | How to Get |
|--------|-------------|------------|
| `ACR_LOGIN_SERVER` | e.g., `myregistry.azurecr.io` | Azure Portal → ACR → Login server |
| `ACR_USERNAME` | Admin username | Azure Portal → ACR → Access keys |
| `ACR_PASSWORD` | Admin password | Azure Portal → ACR → Access keys |

### Container Apps

| Secret | Description |
|--------|-------------|
| `AZURE_RESOURCE_GROUP` | Resource group name |
| `STAGING_CONTAINER_APP` | Staging Container App name |
| `PRODUCTION_CONTAINER_APP` | Production Container App name |

### Database

| Secret | Description |
|--------|-------------|
| `DATABASE_URL_STAGING` | MySQL connection string for staging |
| `DATABASE_URL_PRODUCTION` | MySQL connection string for production |

### Storage (Optional)

| Secret | Description |
|--------|-------------|
| `AZURE_STORAGE_CONNECTION_STRING` | Blob storage connection string |

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

1. Check logs:
   ```bash
   az containerapp logs show --name <app> --resource-group <rg>
   ```

2. Verify environment variables:
   ```bash
   az containerapp show --name <app> --resource-group <rg> --query "properties.template.containers[0].env"
   ```

3. Check `/readyz` endpoint for specific failures

### Database Connection Failed

1. Verify `DATABASE_URL` is correctly formatted
2. Check MySQL server firewall allows Container Apps
3. Verify SSL settings in connection string

### Storage Health Check Failed

1. Verify `STORAGE_PROVIDER=azure` is set
2. Check `AZURE_STORAGE_CONNECTION_STRING` is valid
3. Verify container exists in storage account

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

