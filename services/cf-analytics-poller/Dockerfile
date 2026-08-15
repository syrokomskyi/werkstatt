FROM node:24-slim

WORKDIR /app

COPY package.json ./
COPY tsconfig.json ./
COPY src/ ./src/

ENV NODE_ENV=production
ENV POLL_INTERVAL_MS=300000

CMD ["node", "--import", "tsx", "src/loop.ts"]
