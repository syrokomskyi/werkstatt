FROM node:22-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*

COPY package.json ./
COPY tsconfig.json ./

COPY src/ ./src/

ENV NODE_ENV=production
ENV PROBE_INTERVAL_MS=300000

CMD ["node", "--import", "tsx", "src/loop.ts"]
