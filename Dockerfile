FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm install --legacy-peer-deps
COPY . .
RUN npx next build

FROM python:3.12-alpine AS runtime
WORKDIR /app
RUN apk add --no-cache nodejs npm tini postgresql-client && pip install --no-cache-dir 'psycopg[binary]'
COPY package*.json ./
RUN npm install --omit=dev --legacy-peer-deps
# Custom server (server.js) hosts Next + the scan-status WebSocket, so we ship
# the full .next build + prod node_modules rather than the standalone bundle.
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY server.js next.config.ts ./
COPY fast_scan.py ./fast_scan.py
COPY import_maxmind.py ./import_maxmind.py
COPY db ./db
ENV NODE_ENV=production PORT=51111 PUBLIC_PORT=51111
EXPOSE 51111
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "server.js"]
