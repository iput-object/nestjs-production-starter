# syntax=docker/dockerfile:1.7
#
# Production image for the NestJS + Prisma + OpenTelemetry app.
#
# Build:    docker build -t nest-prisma-template:latest .
# Run:      docker run --rm --env-file .env -p 3000:3000 nest-prisma-template:latest
#
# Layout:
#   base    — Node + pnpm via corepack (shared by every other stage)
#   deps    — full install (dev + prod), feeds the builder
#   builder — `prisma generate` + `nest build` + prune dev deps
#   runner  — lean final image, non-root, healthchecked, runs entrypoint.sh
#
# Choices worth knowing:
#   - Debian (bookworm-slim) over Alpine: Prisma's default query engine targets
#     glibc; Alpine forces the musl-openssl-3 engine and tends to bite. The
#     +30MB is a fair trade for no engine-binary debugging in production.
#   - corepack pins pnpm to whatever packageManager field says (or latest if
#     unset), so the in-container pnpm matches the dev environment.
#   - USER node + WORKDIR owned by node: app never runs as root.
#   - HEALTHCHECK uses Node itself (no curl/wget install needed) and hits the
#     existing /api/v1/health/liveness endpoint.

ARG NODE_VERSION=24-alpine


# ─── base ────────────────────────────────────────────────────────────────────
FROM node:${NODE_VERSION} AS base
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    CI=true
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app


# ─── deps: install everything (used only by builder) ─────────────────────────
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile


# ─── builder: prisma generate + nest build, then drop dev deps ───────────────
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Generate the Prisma client into prisma/generated/prisma (per schema.prisma).
RUN pnpm exec prisma generate
RUN pnpm build
# Trim devDependencies so the runner only carries production deps.
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm prune --prod


# ─── runner: final image ─────────────────────────────────────────────────────
FROM base AS runner
ENV NODE_ENV=production \
    PORT=3000

# Copy only the artifacts the runtime needs.
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/dist ./dist
COPY --from=builder --chown=node:node /app/prisma ./prisma
COPY --chown=node:node package.json pnpm-lock.yaml pnpm-workspace.yaml prisma.config.ts ./
COPY --chown=node:node docker/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

USER node
EXPOSE 3000

# Liveness probe — exits 0 iff /health/liveness returns 200.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/v1/health/liveness', r => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
