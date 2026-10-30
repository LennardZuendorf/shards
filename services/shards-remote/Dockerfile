# Official immutable manifests, verified 2026-10-30. Vercel builds linux/amd64.
FROM tailscale/tailscale:v1.104.4@sha256:ed6480b33c6eb67c9cbd203ed42b9fb57e361986725b6856def71b7a3d9e276c AS tailscale
FROM node:24.15.0-bookworm-slim@sha256:4e6b70dd6cbfc88c8157ba19aa3d9f9cce6ba4703576d55459e45efcbc9c5f5d AS build
WORKDIR /app
RUN npm install --global pnpm@12.6.0 --ignore-scripts
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --ignore-scripts
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN pnpm build

FROM node:24.15.0-bookworm-slim@sha256:4e6b70dd6cbfc88c8157ba19aa3d9f9cce6ba4703576d55459e45efcbc9c5f5d
WORKDIR /app
COPY --from=tailscale /usr/local/bin/tailscale /usr/local/bin/tailscale
COPY --from=tailscale /usr/local/bin/tailscaled /usr/local/bin/tailscaled
COPY --from=tailscale /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/ca-certificates.crt
COPY --from=build --chown=node:node /app/package.json ./package.json
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
ENV NODE_ENV=production TS_EXPERIMENTAL_SERVICE_AUTO_ADVERTISEMENT=false
# Vercel also offers deployment env as build arguments. Declare no secret ARG,
# run no enrollment in the build, and load credentials only at runtime.
USER node
STOPSIGNAL SIGTERM
ENTRYPOINT ["node", "dist/supervisor.js"]
