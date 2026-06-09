FROM node:22-alpine AS web-build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM python:3.12-alpine AS runtime
WORKDIR /app
RUN apk add --no-cache nodejs npm tini postgresql-client && pip install --no-cache-dir 'psycopg[binary]'
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=web-build /app/dist ./dist
COPY --from=web-build /app/dist-server ./dist-server
COPY fast_scan.py ./fast_scan.py
COPY db ./db
ENV NODE_ENV=production PORT=51111 PUBLIC_PORT=51111
EXPOSE 51111
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist-server/index.js"]
