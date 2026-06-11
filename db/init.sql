CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE TABLE IF NOT EXISTS scan_runs (
  id BIGSERIAL PRIMARY KEY,
  cidr TEXT NOT NULL,
  ports TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  scanner_version TEXT NOT NULL DEFAULT 'fast_scan.py',
  scanner_pid INTEGER,
  scan_args TEXT,
  notes TEXT
);
ALTER TABLE scan_runs ADD COLUMN IF NOT EXISTS scan_args TEXT;

CREATE TABLE IF NOT EXISTS port_findings (
  id BIGSERIAL PRIMARY KEY,
  run_id BIGINT REFERENCES scan_runs(id) ON DELETE SET NULL,
  ip TEXT NOT NULL,
  port INTEGER NOT NULL CHECK (port BETWEEN 1 AND 65535),
  state TEXT NOT NULL DEFAULT 'open',
  latency_ms REAL,
  banner TEXT,
  headers TEXT,
  service TEXT,
  product TEXT,
  observed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (run_id, ip, port)
);

CREATE INDEX IF NOT EXISTS idx_port_findings_ip ON port_findings (ip);
CREATE INDEX IF NOT EXISTS idx_port_findings_port ON port_findings (port);
CREATE INDEX IF NOT EXISTS idx_port_findings_observed ON port_findings (observed_at DESC);
CREATE INDEX IF NOT EXISTS idx_port_findings_banner_trgm ON port_findings USING gin (banner gin_trgm_ops);

-- MaxMind GeoLite2 enrichment: IP -> country (location) and IP -> ASN/org.
-- Populated by import_maxmind.py. GiST indexes power containment lookups
-- (network >>= ip::inet) to map a finding's IP to its enclosing block.
CREATE TABLE IF NOT EXISTS geo_blocks (
  network cidr PRIMARY KEY,
  country_iso TEXT,
  country_name TEXT
);
CREATE INDEX IF NOT EXISTS idx_geo_blocks_network ON geo_blocks USING gist (network inet_ops);

CREATE TABLE IF NOT EXISTS asn_blocks (
  network cidr PRIMARY KEY,
  asn INTEGER,
  org TEXT
);
CREATE INDEX IF NOT EXISTS idx_asn_blocks_network ON asn_blocks USING gist (network inet_ops);

-- Better-auth tables. These MUST live here (not just db/schema.sql) because the
-- Postgres container only mounts db/init.sql into docker-entrypoint-initdb.d.
-- Without them, sign-in fails with a 500 ("Unable to create verification") when
-- better-auth tries to INSERT OAuth state into the verification table.
CREATE TABLE IF NOT EXISTS "user" (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  "emailVerified" BOOLEAN NOT NULL DEFAULT FALSE,
  image TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "session" (
  id TEXT PRIMARY KEY,
  "expiresAt" TIMESTAMPTZ NOT NULL,
  token TEXT NOT NULL UNIQUE,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "userId" TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_session_user ON "session"("userId");

CREATE TABLE IF NOT EXISTS "account" (
  id TEXT PRIMARY KEY,
  "accountId" TEXT NOT NULL,
  "providerId" TEXT NOT NULL,
  "userId" TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  "accessToken" TEXT,
  "refreshToken" TEXT,
  "idToken" TEXT,
  "accessTokenExpiresAt" TIMESTAMPTZ,
  "refreshTokenExpiresAt" TIMESTAMPTZ,
  scope TEXT,
  password TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_account_user ON "account"("userId");

CREATE TABLE IF NOT EXISTS "verification" (
  id TEXT PRIMARY KEY,
  identifier TEXT NOT NULL,
  value TEXT NOT NULL,
  "expiresAt" TIMESTAMPTZ NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
