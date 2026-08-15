FROM node:22-alpine AS base
RUN corepack enable

# --- Dependencies ---
FROM base AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# --- Build ---
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm build

# --- Production ---
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Install Chromium, dependencies, and CJK fonts for PDF export.
#
# tini is not optional here. Each PDF export launches a Chromium that
# generate-pdf.ts closes correctly, but Chromium's helper processes are
# re-parented to PID 1 as they die, and PID 1 was `node server.js` — a Node
# process never calls wait() on children it does not know about, so every export
# left ~4 unreaped zombies behind. They cost no memory, which is why the symptom
# is delayed and confusing: the container looks healthy until the PID table
# fills, at which point Chromium can no longer fork and every export fails until
# a restart clears the table (issue #95).
#
# Measured on twwch/jadeai:latest: 5 exports left 20 zombies, all state Z with
# PPID 1. The same 5 exports under `docker run --init` left zero.
RUN apk add --no-cache chromium nss freetype harfbuzz ca-certificates ttf-freefont \
    font-noto-cjk tini

# Tell puppeteer / generate-pdf to use the system Chromium
ENV CHROME_PATH=/usr/bin/chromium-browser

# Copy build output and necessary files
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

# Drizzle migration files (for auto-migration on startup)
COPY --from=builder /app/drizzle ./drizzle

# Data directory for SQLite
RUN mkdir -p /app/data
VOLUME /app/data

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# tini as PID 1 reaps the orphans and forwards signals, so `docker stop` still
# shuts the server down cleanly. Baked into the image rather than left to
# `docker run --init`, because the people hitting this are running the documented
# command and have no reason to suspect a flag they were never told about.
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "server.js"]
