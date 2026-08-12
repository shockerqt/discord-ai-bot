#!/usr/bin/env bash
set -eu

REPOSITORY_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORKFLOW="$REPOSITORY_ROOT/.github/workflows/deploy.yml"
UNIT="$REPOSITORY_ROOT/deploy/lumi-bot.service"
APPLICATION="$REPOSITORY_ROOT/app.js"

assert_contains() {
  file="$1"
  expected="$2"
  if ! grep -Fq "$expected" "$file"; then
    echo "missing deployment contract in $file: $expected" >&2
    exit 1
  fi
}

assert_contains "$UNIT" "User=ubuntu"
assert_contains "$UNIT" "WorkingDirectory=/opt/lumi-bot"
assert_contains "$UNIT" "EnvironmentFile=/opt/lumi-bot/.env"
assert_contains "$UNIT" "ExecStart=/opt/lumi-bot/runtime/node /opt/lumi-bot/app.js"
assert_contains "$UNIT" "Restart=on-failure"
assert_contains "$WORKFLOW" "TARGET_DIR: /opt/lumi-bot"
assert_contains "$WORKFLOW" "SERVICE_NAME: lumi-bot.service"
assert_contains "$WORKFLOW" "APP_HOST: 127.0.0.1"
assert_contains "$WORKFLOW" "APP_PORT: \"8081\""
assert_contains "$WORKFLOW" "systemctl restart \"\$SERVICE_NAME\""
assert_contains "$WORKFLOW" "http://\$APP_HOST:\$APP_PORT/healthz"
assert_contains "$APPLICATION" "const HOST = process.env.HOST || '127.0.0.1';"
assert_contains "$APPLICATION" "app.get('/healthz'"
assert_contains "$APPLICATION" "app.listen(PORT, HOST"

if grep -Eqi 'pm2' "$WORKFLOW"; then
  echo "legacy PM2 deployment reference remains in $WORKFLOW" >&2
  exit 1
fi

if [ -e "$REPOSITORY_ROOT/ecosystem.config.cjs" ]; then
  echo "legacy PM2 process definition must be removed" >&2
  exit 1
fi

if grep -Eq 'echo .*\$\{\{ secrets\.' "$WORKFLOW"; then
  echo "GitHub secrets must not be interpolated directly into shell commands" >&2
  exit 1
fi

echo "deployment contract checks passed"
