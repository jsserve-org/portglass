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
