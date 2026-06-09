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
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public 2>/dev/null || true
COPY fast_scan.py ./fast_scan.py
COPY db ./db
ENV NODE_ENV=production PORT=51111 PUBLIC_PORT=51111
EXPOSE 51111
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "server.js"]
