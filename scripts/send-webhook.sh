#!/usr/bin/env bash
# Simulates an external platform (Shopify) sending a webhook.
# Usage: ./scripts/send-webhook.sh [order_total] [event_id]
#
# Examples:
#   ./scripts/send-webhook.sh 750            # big order -> matches the demo rule
#   ./scripts/send-webhook.sh 750 evt-123     # send the SAME event id twice to prove dedup:
#   ./scripts/send-webhook.sh 750 evt-123

set -euo pipefail

HOST="${HOST:-http://localhost:3000}"
TENANT="${TENANT:-acme}"
SOURCE="${SOURCE:-shopify}"
SECRET="${SECRET:-acme-dev-secret}"

TOTAL="${1:-750}"
EVENT_ID="${2:-evt-$(date +%s)-$RANDOM}"
EVENT_TYPE="order.created"

BODY=$(cat <<EOF
{"order_id":"ord_$RANDOM","total_price":${TOTAL},"currency":"USD","tags":["vip"]}
EOF
)

SIGNATURE=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$SECRET" | sed 's/^.* //')

echo "POST $HOST/webhooks/$TENANT/$SOURCE"
echo "x-event-id: $EVENT_ID"
echo "body: $BODY"
echo

curl -s -i -X POST "$HOST/webhooks/$TENANT/$SOURCE" \
  -H "Content-Type: application/json" \
  -H "x-event-id: $EVENT_ID" \
  -H "x-event-type: $EVENT_TYPE" \
  -H "x-webhook-signature: $SIGNATURE" \
  -d "$BODY"

echo
