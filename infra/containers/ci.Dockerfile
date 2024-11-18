# Phase 1 verification image; runtime credentials are injected by Testcontainers.
FROM node:24.21.0-bookworm-slim AS build
WORKDIR /workspace
ENV CI=true NEXT_TELEMETRY_DISABLED=1 HUSKY=0
RUN corepack enable && corepack prepare pnpm@10.18.3 --activate
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm turbo run build --filter=@hsm/api --filter=@hsm/worker --filter=@hsm/web

FROM node:24.21.0-bookworm-slim AS runtime
WORKDIR /workspace
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
COPY --from=build --chown=node:node /workspace /workspace
USER node
CMD ["node", "apps/api/dist/main.js"]