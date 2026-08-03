#!/bin/sh
set -eu

if [ -z "${RESTORE_DATABASE_URL:-}" ]; then
  echo "RESTORE_DATABASE_URL is required." >&2
  exit 1
fi

if [ -z "${BACKUP_FILE:-}" ]; then
  echo "BACKUP_FILE is required." >&2
  exit 1
fi

if [ "${RESTORE_CONFIRMATION:-}" != "restore-isolated-database" ]; then
  echo "Set RESTORE_CONFIRMATION=restore-isolated-database to confirm the target is isolated." >&2
  exit 1
fi

if [ -n "${DATABASE_URL:-}" ] && [ "$RESTORE_DATABASE_URL" = "$DATABASE_URL" ]; then
  echo "Refusing to restore over DATABASE_URL. Use a separate isolated database." >&2
  exit 1
fi

checksum_file="${BACKUP_CHECKSUM_FILE:-$BACKUP_FILE.sha256}"

if [ ! -f "$BACKUP_FILE" ]; then
  echo "Backup file does not exist: $BACKUP_FILE" >&2
  exit 1
fi

if [ ! -f "$checksum_file" ]; then
  echo "Checksum file does not exist: $checksum_file" >&2
  exit 1
fi

if ! command -v pg_restore >/dev/null 2>&1; then
  echo "pg_restore is required and was not found on PATH." >&2
  exit 1
fi

expected_checksum="$(awk 'NR == 1 { print $1 }' "$checksum_file")"

if command -v sha256sum >/dev/null 2>&1; then
  actual_checksum="$(sha256sum "$BACKUP_FILE" | awk 'NR == 1 { print $1 }')"
elif command -v shasum >/dev/null 2>&1; then
  actual_checksum="$(shasum -a 256 "$BACKUP_FILE" | awk 'NR == 1 { print $1 }')"
else
  echo "sha256sum or shasum is required to verify the backup." >&2
  exit 1
fi

if [ -z "$expected_checksum" ] || [ "$actual_checksum" != "$expected_checksum" ]; then
  echo "Backup checksum verification failed." >&2
  exit 1
fi

echo "$BACKUP_FILE: OK"

pg_restore \
  --exit-on-error \
  --clean \
  --if-exists \
  --no-owner \
  --no-privileges \
  --dbname "$RESTORE_DATABASE_URL" \
  "$BACKUP_FILE"

printf 'Restore completed from %s.\n' "$BACKUP_FILE"
