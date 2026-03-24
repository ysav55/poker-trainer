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

# Install server production dependencies only (no devDependencies)
COPY server/package*.json ./server/
RUN npm ci --prefix server --omit=dev

# Copy server source
COPY server/ ./server/

# Copy player roster (gitignored but needed at runtime)
COPY players.csv ./players.csv

# Copy built React assets from Stage 1
COPY --from=builder /app/client/dist ./client/dist

# Runtime configuration
ENV NODE_ENV=production
ENV PORT=3001
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3001/health || exit 1

CMD ["node", "server/index.js"]
