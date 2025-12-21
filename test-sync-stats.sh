#!/bin/bash

# Test script for Bug 2: Sync Stats Endpoint
# This script makes a GET request to the sync stats endpoint
# and expects to see [DEBUG] logs in the server console showing entry count

# Configuration
BASE_URL="${BASE_URL:-http://localhost:3000}"
AUTH_TOKEN="${AUTH_TOKEN:-your-token-here}"

# Build the request URL
URL="${BASE_URL}/api/v1/sync/stats"

echo "Making GET request to: ${URL}"
echo ""
echo "Expected DEBUG logs in server console:"
echo "  1. [DEBUG] sync.service.ts:558 getSyncStats called for account: <accountId>"
echo "  2. [DEBUG] sync.service.ts:564 Entries received: <count> total entries"
echo ""
echo "The key log to check is the entry count at line 564."
echo ""

# Make the request
curl -X GET "${URL}" \
  -H "Authorization: Bearer ${AUTH_TOKEN}" \
  -H "Content-Type: application/json" \
  -v

echo ""
echo ""
echo "Check your server console for the [DEBUG] logs above."
echo "Specifically look for: '[DEBUG] sync.service.ts:564 Entries received: X total entries'"

