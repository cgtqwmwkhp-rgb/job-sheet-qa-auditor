# Azure Environment Variable Matrix

This document provides a consolidated view of all environment variables required for Azure deployment.

## Quick Reference

| Category | Variable | Required | Staging | Production |
|----------|----------|----------|---------|------------|
| **Core** | `NODE_ENV` | ✅ | `production` | `production` |
| | `PORT` | ✅ | `3000` | `3000` |
| **Database** | `DATABASE_URL` | ✅ | `mysql://...@staging-server` | `mysql://...@prod-server` |
| **Storage** | `STORAGE_PROVIDER` | ✅ | `azure` | `azure` |
| | `AZURE_STORAGE_CONNECTION_STRING` | ✅ | From Key Vault | From Key Vault |
| | `AZURE_STORAGE_CONTAINER_NAME` | ✅ | `jobsheets-staging` | `jobsheets-prod` |
| **Safety** | `ENABLE_PURGE_EXECUTION` | ✅ | `false` | `false` |
| | `ENABLE_SCHEDULER` | ✅ | `false` | `false` |
| **Build** | `GIT_SHA` | ✅ | Set by CI | Set by CI |
| | `PLATFORM_VERSION` | ⚪ | Set by CI | Set by CI |
| | `BUILD_TIME` | ⚪ | Set by CI | Set by CI |
| **AI** | `MISTRAL_API_KEY` | ✅ | From secrets | From secrets |
| | `GEMINI_API_KEY` | ⚪ | From secrets | From secrets |
| | `ENABLE_GEMINI_INSIGHTS` | ⚪ | `true` | `true` |
| **Auth** | `OAUTH_SERVER_URL` | ⚪ | OAuth provider URL | OAuth provider URL |
| | `OWNER_OPEN_ID` | ⚪ | Admin user OpenID | Admin user OpenID |
| | `JWT_SECRET` | ✅ | 32+ char secret | 32+ char secret |

Legend: ✅ = Required, ⚪ = Optional

## GitHub Secrets (Repository Level)

These secrets are used by GitHub Actions workflows:

```
AZURE_CREDENTIALS           # Service principal JSON
ACR_LOGIN_SERVER            # e.g., myacr.azurecr.io
ACR_USERNAME                # ACR admin username
ACR_PASSWORD                # ACR admin password
```

## GitHub Secrets (Per Environment)

### Staging Environment

```
DATABASE_URL                # mysql://user:pass@host:3306/dbname?ssl-mode=required
AZURE_STORAGE_CONNECTION_STRING  # DefaultEndpointsProtocol=https;...
MISTRAL_API_KEY             # OCR service key
GEMINI_API_KEY              # AI insights key (optional)
JWT_SECRET                  # Session encryption secret
```

### Production Environment

Same as staging with production-specific values.

## GitHub Environment Variables (Per Environment)

### Staging Environment

```yaml
STORAGE_PROVIDER: azure
AZURE_STORAGE_CONTAINER_NAME: jobsheets-staging
ENABLE_PURGE_EXECUTION: false
ENABLE_SCHEDULER: false
ENABLE_GEMINI_INSIGHTS: true
```

### Production Environment

```yaml
STORAGE_PROVIDER: azure
AZURE_STORAGE_CONTAINER_NAME: jobsheets-prod
ENABLE_PURGE_EXECUTION: false
ENABLE_SCHEDULER: false
ENABLE_GEMINI_INSIGHTS: true
```

## Container App Environment Variables

These are set directly on the Container App via `az containerapp update`:

```bash
az containerapp update \
  --name <app-name> \
  --resource-group <rg-name> \
  --set-env-vars \
    NODE_ENV=production \
    PORT=3000 \
    STORAGE_PROVIDER=azure \
    AZURE_STORAGE_CONTAINER_NAME=<container-name> \
    ENABLE_PURGE_EXECUTION=false \
    ENABLE_SCHEDULER=false \
    GIT_SHA=<sha>
```

## Secrets via Container App Secrets

Sensitive values should be stored as Container App secrets:

```bash
az containerapp secret set \
  --name <app-name> \
  --resource-group <rg-name> \
  --secrets \
    database-url="<DATABASE_URL>" \
    storage-connection-string="<AZURE_STORAGE_CONNECTION_STRING>" \
    mistral-api-key="<MISTRAL_API_KEY>" \
    jwt-secret="<JWT_SECRET>"
```

Then reference in environment:

```bash
az containerapp update \
  --name <app-name> \
  --resource-group <rg-name> \
  --set-env-vars \
    DATABASE_URL=secretref:database-url \
    AZURE_STORAGE_CONNECTION_STRING=secretref:storage-connection-string \
    MISTRAL_API_KEY=secretref:mistral-api-key \
    JWT_SECRET=secretref:jwt-secret
```

## Safety Controls

### Staging-Only Variables

These should NEVER be enabled on production:

| Variable | Staging Value | Production Value |
|----------|---------------|------------------|
| `DEV_BYPASS_AUTH` | `false` | `false` |
| `ENABLE_DEBUG_LOGGING` | `true` (optional) | `false` |
| `LOG_LEVEL` | `debug` (optional) | `info` |

### Production Safety Gates

1. `ENABLE_PURGE_EXECUTION=false` - Prevents accidental data deletion
2. `ENABLE_SCHEDULER=false` - Disables background jobs until verified
3. All secrets from Key Vault or Container App secrets only

## Validation Commands

Verify environment is correctly configured:

```bash
# Check container app environment
az containerapp show \
  --name <app-name> \
  --resource-group <rg-name> \
  --query "properties.template.containers[0].env[].{name:name,value:value}" \
  -o table

# Check secrets (names only)
az containerapp secret list \
  --name <app-name> \
  --resource-group <rg-name> \
  -o table
```
