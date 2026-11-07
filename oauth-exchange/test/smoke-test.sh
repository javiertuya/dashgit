#!/usr/bin/env bash
# Smoke test of the oauth-exchange image (SMOKE_IMAGE), run by the publication workflow before the push.
# Checks that the service starts and answers without any configuration:
# the healthcheck, and an exchange request for a client that is not configured.
set -u

docker run -d --name smoke -p 3000:3000 "$SMOKE_IMAGE"
trap 'echo "--- container logs:"; docker logs smoke' EXIT
for i in $(seq 1 30); do
  curl -fsS http://localhost:3000/healthcheck >/dev/null 2>&1 && break
  [ "$i" -eq 30 ] && { echo "::error::The service did not start in 30 seconds"; exit 1; }
  sleep 1
done
health=$(curl -sS http://localhost:3000/healthcheck)
echo "healthcheck: $health"
[ "$health" = "OK" ] || { echo "::error::Unexpected healthcheck response"; exit 1; }
status=$(curl -sS -o exchange.json -w '%{http_code}' -X POST http://localhost:3000/exchange \
  -H "Content-Type: application/json" -d '{"grant_type":"authorization_code","client_id":"smoke-test"}')
echo "exchange: $status $(cat exchange.json)"
[ "$status" = "403" ] && grep -q '"error":"forbidden"' exchange.json \
  || { echo "::error::Unexpected exchange response"; exit 1; }
