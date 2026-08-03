#!/bin/sh
set -eu

if [ -z "${DATABASE_URL:-}" ]; then
  echo "DATABASE_URL is required." >&2
  exit 1
fi

if ! command -v pg_dump >/dev/null 2>&1; then
  echo "pg_dump is required and was not found on PATH." >&2
  exit 1
fi

backup_directory="${BACKUP_DIR:-./backups}"
release_label="${ATLAS_RELEASE:-manual}"
safe_release_label="$(printf '%s' "$release_label" | tr -cd 'A-Za-z0-9._-')"

if [ -z "$safe_release_label" ]; then
  safe_release_label="manual"
fi

timestamp="$(date -u '+%Y%m%dT%H%M%SZ')"
backup_file="$backup_directory/atlas-$timestamp-$safe_release_label.dump"
temporary_file="$backup_file.partial"
checksum_file="$backup_file.sha256"

umask 077
mkdir -p "$backup_directory"
trap 'rm -f "$temporary_file"' EXIT HUP INT TERM

pg_dump \
  --format=custom \
  --no-owner \
  --no-privileges \
  --file "$temporary_file" \
  "$DATABASE_URL"

mv "$temporary_file" "$backup_file"

if command -v sha256sum >/dev/null 2>&1; then
  sha256sum "$backup_file" > "$checksum_file"
elif command -v shasum >/dev/null 2>&1; then
  shasum -a 256 "$backup_file" > "$checksum_file"
else
  echo "sha256sum or shasum is required to checksum the backup." >&2
  exit 1
fi

trap - EXIT HUP INT TERM
printf 'Backup created: %s\nChecksum created: %s\n' \
  "$backup_file" \
  "$checksum_file"
