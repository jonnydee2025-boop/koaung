#!/usr/bin/env bash
# Merge KEY=value lines from secrets file into .env (update existing keys).
set -euo pipefail
ENV_FILE="${1:?env file}"
SECRETS_FILE="${2:?secrets file}"

while IFS= read -r line || [[ -n "$line" ]]; do
  line="${line%%#*}"
  line="$(echo "$line" | xargs)"
  [[ -z "$line" || "$line" != *"="* ]] && continue
  key="${line%%=*}"
  value="${line#*=}"
  if grep -q "^${key}=" "$ENV_FILE" 2>/dev/null; then
    sed -i "s|^${key}=.*|${key}=${value}|" "$ENV_FILE"
  else
    echo "${key}=${value}" >> "$ENV_FILE"
  fi
done < "$SECRETS_FILE"
