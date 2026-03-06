#!/bin/sh
set -eu

MAX_RETRIES="${MIGRATION_MAX_RETRIES:-30}"
SLEEP_SECONDS="${MIGRATION_RETRY_DELAY_SECONDS:-2}"
ATTEMPT=1

echo "[entrypoint] Running Prisma migrations..."
until ../node_modules/.bin/prisma migrate deploy --schema=./prisma/schema.prisma; do
	if [ "$ATTEMPT" -ge "$MAX_RETRIES" ]; then
		echo "[entrypoint] Migration failed after ${ATTEMPT} attempts."
		exit 1
	fi

	echo "[entrypoint] Migration attempt ${ATTEMPT}/${MAX_RETRIES} failed, retrying in ${SLEEP_SECONDS}s..."
	ATTEMPT=$((ATTEMPT + 1))
	sleep "$SLEEP_SECONDS"
done

echo "[entrypoint] Starting backend..."
exec node dist/server.js