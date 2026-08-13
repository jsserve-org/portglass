# Fast Authorized TCP Port Scanner

A fast Python TCP connect scanner for **networks you own or administer**. It uses
multiple OS threads plus asyncio concurrency to cover large IPv4 ranges quickly,
while letting you slow scans down for accuracy and lower network impact.

## Install

No third-party dependencies required. Python 3.10+ recommended.

```bash
chmod +x fast_scan.py
```

## Examples

Scan common admin/web ports across a `/16` at a capped rate:

```bash
./fast_scan.py 192.168.0.0/16 \
  --ports common \
  --threads 4 \
  --concurrency 512 \
  --rate 250 \
  --timeout 0.8 \
  -o results.csv \
  --yes-i-own-this-network
```

Scan the built-in top 100 TCP ports. At `--rate 2000`, this is roughly
6.5 million attempts/hour, enough for 65,534 hosts × 100 ports in about an hour
if your network and machine can handle it:

```bash
./fast_scan.py 10.0.0.0/16 -p top100 --rate 2000 --threads 8 --concurrency 1024 \
  -o top100.csv --yes-i-own-this-network
```

Slow down and improve confidence:

```bash
./fast_scan.py 10.0.0.0/16 -p 22,80,443 --rate 100 --timeout 2.0 \
  --verify-retries 1 --banner -o careful.csv --yes-i-own-this-network
```

## Port syntax

- `common` (default): `22,80,443,445,3389,8080,8443`
- `top100`: built-in common 100 TCP ports
- Comma/range syntax: `22,80,443,8000-8100`

## Tuning

- `--rate`: global connection attempts per second. Lower this to slow down.
- `--timeout`: higher is more accurate on slow/filtering networks but slower.
- `--verify-retries`: re-check open ports to reduce false positives.
- `--banner`: tries to read a small banner after connecting; useful but slower.
- `--threads` and `--concurrency`: increase until your OS/network stops improving.

For a `/16` in an hour, required attempt rate is:

```text
hosts * ports / 3600
```

Examples:

- `/16` × 7 common ports: ~128 attempts/sec
- `/16` × 100 ports: ~1,821 attempts/sec
- `/16` × 1,024 ports: ~18,641 attempts/sec (usually too aggressive for Python TCP connect scanning)

## Output

CSV columns:

```text
ip,port,state,latency_ms,banner
```

Only open ports are written.

## Authorization

The scanner requires `--yes-i-own-this-network` so it is not accidentally run on
third-party networks. Only scan systems where you have permission.

## Shodan enrichment (optional)

Set `SHODAN_API_KEY` in the server environment to enrich US host-detail pages
with minified Shodan host metadata, reverse DNS, and forward-confirmed DNS.
The key is used only by the server and is never sent to the browser.

```bash
SHODAN_API_KEY=your_key_here
```

The integration is deliberately narrow to comply with Shodan's terms:

- it only looks up individual hosts already observed by Portglass;
- it returns Shodan data only for US hosts and does not expose bulk search;
- it requests minified host records, never service banners;
- responses are cached in process for six hours and as private minified DB
  summaries for 24 hours to reduce API usage;
- completed scans enrich at most 25 unique US hosts by default (configurable
  with `SHODAN_AUTO_ENRICH_LIMIT`, capped at 100), sequentially;
- lookup status is audited, while raw banners are never requested or stored;
- Shodan-derived data is not included in exports or public share snapshots; and
- every displayed result is attributed and linked to Shodan.

Your Shodan plan and any separate written agreement still control permitted
use. Academic/Research access must not be used commercially. See the
[Shodan Terms of Service](https://static.shodan.io/legal/terms.html) and
[API documentation](https://developer.shodan.io/api).

## Remote CLI

Portglass includes a cross-platform CLI that links to a website account using a
10-minute device code. The CLI stores its bearer credential in the current
user's OS config directory with user-only file permissions; the server stores
only a SHA-256 token digest. Linked devices can be reviewed and revoked at
`/cli`.

macOS, Fedora/Linux:

```bash
curl -fsSL https://scan.2oo.dev/cli/install.sh | sh
portglass login
```

Windows PowerShell:

```powershell
irm https://scan.2oo.dev/cli/install.ps1 | iex
portglass login
```

Activate a scan and return immediately, inspect it, then download its results:

```bash
portglass activate 192.0.2.0/28 -p common --label edge-audit
portglass scans
portglass status 123
portglass download 123 --format csv
```

`activate` (also available as `scan`) uses the same authorization checks,
skip-list enforcement, queue, and resource limits as the website. Only scan
networks you own or are explicitly authorized to assess.
