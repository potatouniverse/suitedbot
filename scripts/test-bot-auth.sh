#!/bin/bash
# Test Bot Authentication Flow
# Usage: ./scripts/test-bot-auth.sh

set -e

BASE_URL="http://localhost:3000"
# BASE_URL="https://suitedbot.com"

echo "🤖 Testing Bot Authentication Flow"
echo "=================================="
echo ""

# Step 1: Register and get API key (requires human auth token)
echo "Step 1: Generate API Key"
echo "------------------------"
echo "You need to authenticate as a human first and get a Supabase auth token."
echo "Then run:"
echo ""
echo "curl -X POST $BASE_URL/api/v1/auth/bot/register \\"
echo "  -H 'Authorization: Bearer YOUR_SUPABASE_TOKEN' \\"
echo "  -H 'Content-Type: application/json' \\"
echo "  -d '{\"name\": \"Test Bot\", \"scopes\": [\"read\", \"write\"]}'"
echo ""
read -p "Enter the generated API key (sk_live_...): " API_KEY
echo ""

# Step 2: Test API key validation - Scan tasks
echo "Step 2: Scan available tasks"
echo "----------------------------"
SCAN_RESPONSE=$(curl -s -X GET "$BASE_URL/api/v1/bot/scan?limit=5" \
  -H "Authorization: Bearer $API_KEY")

echo "$SCAN_RESPONSE" | jq '.'
echo ""

TASK_COUNT=$(echo "$SCAN_RESPONSE" | jq '.count')
echo "Found $TASK_COUNT tasks"
echo ""

if [ "$TASK_COUNT" -gt 0 ]; then
  # Step 3: Get first task ID
  TASK_ID=$(echo "$SCAN_RESPONSE" | jq -r '.tasks[0].id')
  TASK_TITLE=$(echo "$SCAN_RESPONSE" | jq -r '.tasks[0].title')
  
  echo "Step 3a: Auto-accept task"
  echo "-------------------------"
  echo "Task ID: $TASK_ID"
  echo "Task Title: $TASK_TITLE"
  echo ""
  
  AUTO_ACCEPT_RESPONSE=$(curl -s -X POST "$BASE_URL/api/v1/bot/auto-accept" \
    -H "Authorization: Bearer $API_KEY" \
    -H "Content-Type: application/json" \
    -d "{\"taskId\": \"$TASK_ID\", \"offerText\": \"I can complete this task!\"}")
  
  echo "$AUTO_ACCEPT_RESPONSE" | jq '.'
  echo ""
  
  echo "Step 3b: Suggest task to master"
  echo "-------------------------------"
  
  SUGGEST_RESPONSE=$(curl -s -X POST "$BASE_URL/api/v1/bot/suggest" \
    -H "Authorization: Bearer $API_KEY" \
    -H "Content-Type: application/json" \
    -d "{\"taskId\": \"$TASK_ID\", \"reasoning\": \"This looks like a good fit for my capabilities.\"}")
  
  echo "$SUGGEST_RESPONSE" | jq '.'
  echo ""
fi

echo "✅ Bot authentication flow test complete!"
echo ""
echo "Next steps:"
echo "1. Go to $BASE_URL/market to see your offers"
echo "2. Test master approval with:"
echo "   curl -X POST $BASE_URL/api/v1/bot/master-approve \\"
echo "     -H 'Authorization: Bearer MASTER_TOKEN' \\"
echo "     -H 'Content-Type: application/json' \\"
echo "     -d '{\"suggestionId\": \"SUGGESTION_ID\", \"action\": \"approve\"}'"
