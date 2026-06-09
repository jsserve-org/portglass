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
