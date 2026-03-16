# ─────────────────────────────────────────────────────────────────────────────
# Stage 1 — Build React client
# ─────────────────────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app/client

# Install dependencies first (layer cache)
COPY client/package*.json ./
RUN npm install

# Copy source and build
COPY client/ ./
RUN npm run build

# ─────────────────────────────────────────────────────────────────────────────
# Stage 2 — Production server
# ─────────────────────────────────────────────────────────────────────────────
FROM node:20-alpine AS production

WORKDIR /app

# Install server production dependencies only.
# ISS-64: better-sqlite3 ships with pre-compiled binaries for common platforms
# (linux/amd64, linux/arm64). npm ci --omit=dev skips devDependencies so no
# build toolchain (python3, make, g++) is needed. If the pre-compiled binary is
# missing for this exact platform/Node version, npm will attempt to compile from
# source and fail unless build tools are present. In that case, add:
#   RUN apk add --no-cache python3 make g++ before this RUN step.
COPY server/package*.json ./server/
RUN npm ci --prefix server --omit=dev

# Copy server source
COPY server/ ./server/

# Copy built React assets from Stage 1
COPY --from=builder /app/client/dist ./client/dist

# Create a writable data directory for the SQLite database
RUN mkdir -p /data
ENV DATABASE_PATH=/data/poker_trainer.sqlite

# Runtime configuration
ENV NODE_ENV=production
ENV PORT=3001
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3001/health || exit 1

CMD ["node", "server/index.js"]
