FROM mcr.microsoft.com/playwright:v1.61.1-noble

WORKDIR /workspace

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages ./packages
COPY services/check-warpgogol-runner ./services/check-warpgogol-runner

RUN corepack enable && pnpm install --filter check-warpgogol-runner --frozen-lockfile

CMD ["pnpm", "--filter", "check-warpgogol-runner", "dev"]
