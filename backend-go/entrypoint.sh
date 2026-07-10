#!/bin/sh
set -e

if [ "$(id -u)" = "0" ]; then
	chown -R appuser:appuser /app/data 2>/dev/null || true
	exec su-exec appuser "$@"
fi

exec "$@"
