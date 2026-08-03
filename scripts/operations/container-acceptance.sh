#!/bin/sh
set -eu

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is required for container acceptance." >&2
  exit 1
fi

repository_root="$(CDPATH= cd "$(dirname "$0")/../.." && pwd)"
compose_file="$repository_root/compose.acceptance.yaml"
project_name="atlas-acceptance-$$"

compose() {
  docker compose \
    --project-name "$project_name" \
    --file "$compose_file" \
    "$@"
}

cleanup() {
  compose down --volumes --remove-orphans >/dev/null 2>&1 || true
}

assert_graceful_exit() {
  service="$1"
  container_id="$2"
  exit_code="$(docker inspect --format '{{.State.ExitCode}}' "$container_id")"

  if [ "$exit_code" != "0" ] && [ "$exit_code" != "143" ]; then
    echo "$service did not shut down gracefully (exit code $exit_code)." >&2
    docker logs "$container_id" >&2
    exit 1
  fi
}

trap cleanup EXIT HUP INT TERM

compose build web api worker migrate
compose up --detach --wait db redis
compose run --rm migrate
compose up --detach --wait api worker web

compose exec -T api node -e "
  fetch('http://127.0.0.1:4000/v1/ready')
    .then(async (response) => {
      const body = await response.json();
      if (!response.ok || body.status !== 'ready') process.exit(1);
    })
    .catch(() => process.exit(1));
"

compose exec -T api node -e "
  fetch('http://127.0.0.1:4000/v1/diagnostics', {
    headers: {
      authorization:
        'Bearer operations-token-with-at-least-32-characters',
    },
  })
    .then(async (response) => {
      const body = await response.json();
      if (
        !response.ok ||
        body.release !== 'acceptance' ||
        body.queues.github.status !== 'available' ||
        body.queues.notion.status !== 'available'
      ) process.exit(1);
    })
    .catch(() => process.exit(1));
"

compose exec -T web node -e "
  fetch('http://api:4000/v1/health')
    .then((response) => {
      if (!response.ok) process.exit(1);
    })
    .catch(() => process.exit(1));
"

compose exec -T db createdb -U atlas atlas_restore_acceptance
compose exec -T \
  -e DATABASE_URL=postgresql://atlas:atlas@db:5432/atlas \
  -e BACKUP_DIR=/backups \
  -e ATLAS_RELEASE=acceptance \
  db \
  /operations/database-backup.sh

backup_file="$(
  compose exec -T db sh -c \
    'find /backups -type f -name "*.dump" | sort | tail -n 1' |
    tr -d '\r'
)"

if [ -z "$backup_file" ]; then
  echo "Recovery acceptance did not create a backup." >&2
  exit 1
fi

compose exec -T \
  -e DATABASE_URL=postgresql://atlas:atlas@db:5432/atlas \
  -e RESTORE_DATABASE_URL=postgresql://atlas:atlas@db:5432/atlas_restore_acceptance \
  -e BACKUP_FILE="$backup_file" \
  -e RESTORE_CONFIRMATION=restore-isolated-database \
  db \
  /operations/database-restore.sh

restored_table_count="$(
  compose exec -T db \
    psql -U atlas -d atlas_restore_acceptance -tAc \
    "select count(*) from pg_tables where schemaname = 'public'" |
    tr -d '[:space:]'
)"

if [ "${restored_table_count:-0}" -lt 1 ]; then
  echo "Recovery acceptance restored no application tables." >&2
  exit 1
fi

compose exec -T db dropdb -U atlas atlas_restore_acceptance

web_container="$(compose ps --quiet web)"
api_container="$(compose ps --quiet api)"
worker_container="$(compose ps --quiet worker)"

compose stop --timeout 15 web api worker

assert_graceful_exit web "$web_container"
assert_graceful_exit api "$api_container"
assert_graceful_exit worker "$worker_container"

printf '%s\n' \
  "Container acceptance passed:" \
  "- production images built" \
  "- migrations applied" \
  "- health and diagnostics verified" \
  "- backup and restore recovered $restored_table_count tables" \
  "- web, API, and worker stopped on SIGTERM without forced termination"
