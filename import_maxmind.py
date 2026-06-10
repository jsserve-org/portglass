#!/usr/bin/env python3
"""Download MaxMind GeoLite2 Country + ASN CSVs and load them into Postgres.

Populates two lookup tables used to enrich scan findings:
  geo_blocks(network cidr, country_iso, country_name)   -- location data
  asn_blocks(network cidr, asn, org)                     -- ASN data

Lookups in the app use containment: `network >>= '1.2.3.4'::inet`, picking the
most specific (longest-prefix) match.

Credentials come from a MaxMind account id + license key, supplied via
--account-id / --license-key or the MAXMIND_ACCOUNT_ID / MAXMIND_LICENSE_KEY
environment variables. Only IPv4 blocks are loaded (the scanner is IPv4-only).

Usage:
  python3 import_maxmind.py --db-url postgres://... \
      --account-id 123456 --license-key XXXX
"""
from __future__ import annotations

import argparse
import csv
import io
import os
import sys
import tempfile
import zipfile
from pathlib import Path
from urllib.request import Request, urlopen

DOWNLOAD_BASE = "https://download.maxmind.com/geoip/databases"
EDITIONS = {
    "country": "GeoLite2-Country-CSV",
    "asn": "GeoLite2-ASN-CSV",
}


def download_edition(edition: str, account_id: str, license_key: str, dest_dir: Path) -> Path:
    """Download and extract one CSV edition; return the extracted directory."""
    import base64

    url = f"{DOWNLOAD_BASE}/{EDITIONS[edition]}/download?suffix=zip"
    token = base64.b64encode(f"{account_id}:{license_key}".encode()).decode()
    req = Request(url, headers={"Authorization": f"Basic {token}"})
    print(f"Downloading {EDITIONS[edition]} ...", file=sys.stderr)
    with urlopen(req) as resp:  # noqa: S310 - fixed MaxMind host
        data = resp.read()
    with zipfile.ZipFile(io.BytesIO(data)) as zf:
        zf.extractall(dest_dir)
    # The zip extracts to a single dated directory, e.g. GeoLite2-ASN-CSV_20260609.
    for child in sorted(dest_dir.iterdir()):
        if child.is_dir() and child.name.startswith(EDITIONS[edition]):
            return child
    raise RuntimeError(f"Could not find extracted dir for {edition}")


def load_country(db_conn, src_dir: Path) -> int:
    blocks = src_dir / "GeoLite2-Country-Blocks-IPv4.csv"
    locations = src_dir / "GeoLite2-Country-Locations-en.csv"

    geo: dict[str, tuple[str, str]] = {}
    with locations.open(newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            geo[row["geoname_id"]] = (row["country_iso_code"], row["country_name"])

    with db_conn.cursor() as cur:
        cur.execute("TRUNCATE geo_blocks")
        with cur.copy("COPY geo_blocks (network, country_iso, country_name) FROM STDIN") as copy:
            count = 0
            with blocks.open(newline="", encoding="utf-8") as f:
                for row in csv.DictReader(f):
                    gid = row["geoname_id"] or row["registered_country_geoname_id"]
                    iso, name = geo.get(gid, ("", ""))
                    copy.write_row((row["network"], iso or None, name or None))
                    count += 1
    db_conn.commit()
    return count


def load_asn(db_conn, src_dir: Path) -> int:
    blocks = src_dir / "GeoLite2-ASN-Blocks-IPv4.csv"
    with db_conn.cursor() as cur:
        cur.execute("TRUNCATE asn_blocks")
        with cur.copy("COPY asn_blocks (network, asn, org) FROM STDIN") as copy:
            count = 0
            with blocks.open(newline="", encoding="utf-8") as f:
                for row in csv.DictReader(f):
                    asn = row["autonomous_system_number"] or None
                    org = row["autonomous_system_organization"] or None
                    copy.write_row((row["network"], asn, org))
                    count += 1
    db_conn.commit()
    return count


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--db-url", default=os.environ.get("DATABASE_URL"), help="Postgres URL (or DATABASE_URL)")
    p.add_argument("--account-id", default=os.environ.get("MAXMIND_ACCOUNT_ID"))
    p.add_argument("--license-key", default=os.environ.get("MAXMIND_LICENSE_KEY"))
    args = p.parse_args(argv)

    if not args.db_url:
        print("Missing --db-url / DATABASE_URL", file=sys.stderr)
        return 2
    if not args.account_id or not args.license_key:
        print("Missing MaxMind credentials (--account-id / --license-key)", file=sys.stderr)
        return 2

    try:
        import psycopg
    except ImportError:
        print("Requires psycopg: pip install 'psycopg[binary]'", file=sys.stderr)
        return 2

    with tempfile.TemporaryDirectory() as tmp:
        tmp_path = Path(tmp)
        country_dir = download_edition("country", args.account_id, args.license_key, tmp_path)
        asn_dir = download_edition("asn", args.account_id, args.license_key, tmp_path)

        db_conn = psycopg.connect(args.db_url)
        try:
            n_geo = load_country(db_conn, country_dir)
            print(f"Loaded {n_geo:,} geo_blocks", file=sys.stderr)
            n_asn = load_asn(db_conn, asn_dir)
            print(f"Loaded {n_asn:,} asn_blocks", file=sys.stderr)
        finally:
            db_conn.close()

    print("MaxMind import complete.", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
