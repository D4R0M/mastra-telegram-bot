#!/usr/bin/env bash
# Simple helper to verify fast ACK from Telegram webhook
curl -s -o /dev/null -w "%{http_code} %{time_total}\n" \
  -H "Content-Type: application/json" \
  -d '{"update_id":123,"message":{"chat":{"id":111},"from":{"id":6776842238},"text":"ping"}}' \
  http://localhost:3000/webhooks/telegram/action
