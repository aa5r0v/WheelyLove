# syntax=docker/dockerfile:1.7
#
# WheelyLove - production image (Next.js 16, output: "standalone").
# Targets:
#   runner  - the web app (default, the last stage)
#   migrate - one-shot drizzle-kit migrate job
#
# Build is driven by deploy/deploy.sh (memory-limited buildx builder).
# NEXT_PUBLIC_* values are baked into the JS bundle at BUILD time -> build args.
# No secrets are stored in the image. CLERK_SECRET_KEY is offered to the build
# step only as a BuildKit secret (never written to a layer).

ARG NODE_IMAGE=node:22-alpine

# ---------- base ----------
FROM ${NODE_IMAGE} AS base
RUN apk add --no-cache libc6-compat
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

# ---------- deps (full install, dev deps included: needed for build + drizzle-kit) ----------
FROM base AS deps
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci --no-audit --no-fund

# ---------- migrate (one-shot job: drizzle-kit migrate) ----------
FROM deps AS migrate
ENV HOME=/tmp
COPY drizzle.config.ts ./
COPY drizzle ./drizzle
COPY src/db/schema.ts ./src/db/schema.ts
USER node
CMD ["node_modules/.bin/drizzle-kit", "migrate"]

# ---------- builder ----------
FROM deps AS builder
COPY . .

ARG NEXT_PUBLIC_APP_URL
ARG NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
ARG NEXT_PUBLIC_CLERK_SIGN_IN_URL
ARG NEXT_PUBLIC_CLERK_SIGN_UP_URL
ARG NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL
ARG NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL

# Keep the Node heap below the builder container memory cap (2 GB, see deploy.sh).
ENV NODE_OPTIONS=--max-old-space-size=1536

# Empty optional args are unset (an empty string is not the same as "not set").
# DATABASE_URL is a dummy: the db client connects lazily, nothing talks to it at build time.
RUN --mount=type=secret,id=clerk_secret_key,required=false \
    for v in NEXT_PUBLIC_APP_URL NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY NEXT_PUBLIC_CLERK_SIGN_IN_URL \
             NEXT_PUBLIC_CLERK_SIGN_UP_URL NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL \
             NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL; do \
      eval "[ -n \"\$$v\" ] || unset $v"; \
    done; \
    if [ -s /run/secrets/clerk_secret_key ]; then export CLERK_SECRET_KEY="$(cat /run/secrets/clerk_secret_key)"; fi; \
    export DATABASE_URL="postgres://build:build@127.0.0.1:1/build"; \
    npm run build

# Fail early and clearly if next.config.ts does not have output: "standalone".
RUN test -f .next/standalone/server.js || \
    (echo "ERROR: .next/standalone/server.js missing - add output: 'standalone' to next.config.ts" && exit 1)

# ---------- runner (final image) ----------
FROM base AS runner
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0

# Dedicated non-root user. Files stay root-owned = not writable by the app (rootfs is read-only anyway).
RUN addgroup -g 10001 -S app && adduser -S -u 10001 -G app -H -s /sbin/nologin app

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
# Runtime cache dir; compose mounts a tmpfs here (read_only rootfs).
RUN mkdir -p /app/.next/cache && chown app:app /app/.next/cache

USER app
EXPOSE 3000

# Any HTTP answer below 500 = alive. Override the path with HEALTH_PATH (e.g. /api/health).
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+(process.env.HEALTH_PATH||'/'),{redirect:'manual'}).then(r=>process.exit(r.status<500?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
