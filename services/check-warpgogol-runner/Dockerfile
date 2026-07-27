FROM mcr.microsoft.com/playwright:v1.61.1-noble

WORKDIR /workspace

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages ./packages
COPY services/check-webgogol-runner ./services/check-webgogol-runner

RUN corepack enable && pnpm install --filter check-webgogol-runner --frozen-lockfile

CMD ["pnpm", "--filter", "check-webgogol-runner", "dev"]
