#!/bin/bash
# Restart Staging Container App to Activate New Version
# This forces Azure Container Apps to use the latest deployed image

set -e

echo "🔄 Restarting Staging Container App"
echo "====================================="
echo ""

# Configuration
RESOURCE_GROUP="plantex-assist"
CONTAINER_APP="jobsheet-qa-staging"
STAGING_URL="https://jobsheet-qa-staging.happydesert-4448b4c0.uksouth.azurecontainerapps.io"
EXPECTED_SHA="0b4fe31a9033cdf46083971f6d0124005a87f71f"

# Check if logged in to Azure
echo "🔐 Checking Azure authentication..."
if ! az account show &> /dev/null; then
  echo "❌ Not logged in to Azure CLI"
  echo "   Please run: az login"
  exit 1
fi

ACCOUNT=$(az account show --query name -o tsv)
echo "✅ Logged in as: $ACCOUNT"
echo ""

# Show current revision status
echo "📊 Current Revision Status:"
az containerapp revision list \
  --name "$CONTAINER_APP" \
  --resource-group "$RESOURCE_GROUP" \
  --query "[].{Name:name, Active:active, Traffic:trafficWeight, Created:properties.createdTime}" \
  --output table

echo ""
echo "📋 Current Version in Staging:"
CURRENT_SHA=$(curl -s "${STAGING_URL}/readyz" | jq -r '.version.sha')
echo "   Current SHA: $CURRENT_SHA"
echo "   Expected SHA: ${EXPECTED_SHA:0:7}"

if [[ "$CURRENT_SHA" == "$EXPECTED_SHA" ]] || [[ "$CURRENT_SHA" == "${EXPECTED_SHA:0:7}" ]]; then
  echo "✅ Already running the correct version!"
  exit 0
fi

echo ""
echo "⚠️  Version mismatch detected - restart needed"
echo ""
read -p "Press Enter to restart the container app..."

# Restart the container app
echo ""
echo "🔄 Restarting container app..."
az containerapp revision restart \
  --name "$CONTAINER_APP" \
  --resource-group "$RESOURCE_GROUP"

echo ""
echo "⏳ Waiting for restart to complete (30 seconds)..."
sleep 30

# Check new version
echo ""
echo "🔍 Verifying new version..."
for i in {1..5}; do
  echo "   Check $i/5..."
  NEW_SHA=$(curl -s "${STAGING_URL}/readyz" | jq -r '.version.sha' 2>/dev/null || echo "error")
  
  if [[ "$NEW_SHA" == "$EXPECTED_SHA" ]] || [[ "$NEW_SHA" == "${EXPECTED_SHA:0:7}" ]]; then
    echo ""
    echo "✅ SUCCESS! New version is live"
    echo "   SHA: $NEW_SHA"
    echo ""
    
    # Show health status
    echo "📊 Health Check:"
    curl -s "${STAGING_URL}/readyz" | jq '{status, database: .checks.database, storage: .checks.storage, version: .version}'
    echo ""
    echo "🎉 Staging is now running the latest code!"
    exit 0
  fi
  
  if [ $i -lt 5 ]; then
    sleep 10
  fi
done

echo ""
echo "⚠️  Version still not updated after restart"
echo "   Current: $NEW_SHA"
echo "   Expected: ${EXPECTED_SHA:0:7}"
echo ""
echo "💡 Troubleshooting steps:"
echo "   1. Check container app logs:"
echo "      az containerapp logs show --name $CONTAINER_APP --resource-group $RESOURCE_GROUP --tail 50"
echo ""
echo "   2. Check revision status:"
echo "      az containerapp revision list --name $CONTAINER_APP --resource-group $RESOURCE_GROUP"
echo ""
echo "   3. Manually set traffic to latest revision:"
echo "      az containerapp ingress traffic set --name $CONTAINER_APP --resource-group $RESOURCE_GROUP --revision-weight latest=100"

exit 1
