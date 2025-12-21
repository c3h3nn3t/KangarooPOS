#!/bin/bash

# Test script for Bug 1: Inventory Transactions Endpoint
# This script makes a GET request to the inventory transactions endpoint
# and expects to see [DEBUG] logs in the server console

# Configuration
INVENTORY_ID="${1:-00000000-0000-0000-0000-000000000001}"
BASE_URL="${BASE_URL:-http://localhost:3000}"
AUTH_TOKEN="${AUTH_TOKEN:-your-token-here}"

# Build the request URL
URL="${BASE_URL}/api/v1/inventory/${INVENTORY_ID}/transactions"
URL="${URL}?transaction_type=sale&start_date=2024-01-01&end_date=2024-12-31"

echo "Making GET request to: ${URL}"
echo "Expected DEBUG logs in server console:"
echo "  - [DEBUG] inventory.ts:341 Parsed query: ..."
echo "  - [DEBUG] inventory.ts:349 Filter options: ..."
echo "  - [DEBUG] inventory.service.ts:577 Where clauses: ..."
echo "  - [DEBUG] inventory.service.ts:590 Select options: ..."
echo "  - [DEBUG] inventory.service.ts:597 DB result: ..."
echo ""

# Make the request
curl -X GET "${URL}" \
  -H "Authorization: Bearer ${AUTH_TOKEN}" \
  -H "Content-Type: application/json" \
  -v

echo ""
echo ""
echo "Check your server console for the [DEBUG] logs above."

