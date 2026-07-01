#!/bin/sh
# Container entrypoint for the production image.
#
# 1. Applies any pending Prisma migrations against $DATABASE_URL.
#    `prisma migrate deploy` is idempotent — re-running on a healthy DB is a
#    no-op, so this is safe under multi-replica rollouts.
# 2. `exec`s into Node so the app becomes PID 1 and receives SIGTERM /
#    SIGINT directly, letting Nest's enableShutdownHooks() drain cleanly.
#
# Usage in a Dockerfile:
#   COPY docker/entrypoint.sh /usr/local/bin/entrypoint.sh
#   RUN chmod +x /usr/local/bin/entrypoint.sh
#   ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]

set -eu

echo "[entrypoint] applying prisma migrations"
pnpm exec prisma migrate deploy

echo "[entrypoint] starting app"
exec node dist/src/main
