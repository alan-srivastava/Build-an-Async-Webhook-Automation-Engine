#!/usr/bin/env bash
# Sends the exact same event id twice in a row to prove idempotency:
# the second call should return {"status":"duplicate", ...} and no second
# JobRun/action execution should occur.
set -euo pipefail

EVENT_ID="evt-dup-demo-$(date +%s)"

echo "== First delivery =="
./scripts/send-webhook.sh 600 "$EVENT_ID"

echo
echo "== Redelivery (simulates platform retry) =="
./scripts/send-webhook.sh 600 "$EVENT_ID"
