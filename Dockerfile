# syntax=docker/dockerfile:1

# Debian rather than Alpine, deliberately. bcrypt ships both glibc and musl
# arm64 prebuilds, so Alpine would install cleanly — but this service holds
# whole PDFs in memory (multer's memoryStorage, then a second copy from S3,
# then a ~1.33x base64 expansion for Gemini) against a hard cgroup limit, and
# musl's allocator is materially worse under exactly that pattern. Here the
# penalty for getting it wrong is an OOMKill, not slowness. The extra ~40 MB is
# not worth arguing about.
ARG NODE_VERSION=22-bookworm-slim

# ---- deps: full install, including devDependencies the build needs ----------
FROM node:${NODE_VERSION} AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci

# ---- build: nest build -> dist/ --------------------------------------------
FROM deps AS build
WORKDIR /app
COPY tsconfig.json tsconfig.build.json nest-cli.json ./
COPY src ./src
RUN npm run build

# ---- prod-deps: the runtime tree only --------------------------------------
# A separate install rather than pruning the build stage: `npm ci` starts from
# the lockfile every time, so the result cannot depend on what the build left
# behind.
FROM node:${NODE_VERSION} AS prod-deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --omit=dev

# ---- runner ----------------------------------------------------------------
FROM node:${NODE_VERSION} AS runner
WORKDIR /app

ENV NODE_ENV=production
# A ceiling, not a reservation. Note it does NOT bound this app's real memory
# driver: Buffers live outside the V8 heap, so MAX_UPLOAD_MB and
# GEMINI_MAX_PAYLOAD_MB are the settings that decide whether the container fits
# its limit. Raising either without raising the limit ends in an OOMKill.
ENV NODE_OPTIONS=--max-old-space-size=768

COPY --from=prod-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
# Carried for `npm run seed:reviewer:prod` and so the image reports its version.
COPY --chown=node:node package.json ./

# `node` (uid 1000) already exists in the official image.
USER node
EXPOSE 8000

# Node 22 has global fetch, so this needs nothing installed. Only used by
# docker compose; Kubernetes uses the probes in the Deployment instead.
HEALTHCHECK --interval=10s --timeout=3s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8000)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Exec form, and no init process on purpose: Node as PID 1 ignores SIGTERM
# under the default disposition, but `app.enableShutdownHooks()` in main.ts
# installs a real SIGTERM listener, which reinstates it and drives the
# in-flight analysis drain. Node spawns no children, so nothing needs reaping.
CMD ["node", "dist/main"]
