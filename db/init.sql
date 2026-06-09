CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE TABLE IF NOT EXISTS scan_runs (
  id BIGSERIAL PRIMARY KEY,
  cidr TEXT NOT NULL,
  ports TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  scanner_version TEXT NOT NULL DEFAULT 'fast_scan.py',
  notes TEXT
);

CREATE TABLE IF NOT EXISTS port_findings (
  id BIGSERIAL PRIMARY KEY,
  run_id BIGINT REFERENCES scan_runs(id) ON DELETE SET NULL,
  ip TEXT NOT NULL,
  port INTEGER NOT NULL CHECK (port BETWEEN 1 AND 65535),
  state TEXT NOT NULL DEFAULT 'open',
  latency_ms REAL,
  banner TEXT,
  service TEXT,
  product TEXT,
  observed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (run_id, ip, port)
);

CREATE INDEX IF NOT EXISTS idx_port_findings_ip ON port_findings (ip);
CREATE INDEX IF NOT EXISTS idx_port_findings_port ON port_findings (port);
CREATE INDEX IF NOT EXISTS idx_port_findings_observed ON port_findings (observed_at DESC);
CREATE INDEX IF NOT EXISTS idx_port_findings_banner_trgm ON port_findings USING gin (banner gin_trgm_ops);
