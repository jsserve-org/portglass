#!/usr/bin/env python3
"""
Fast authorized TCP port scanner with SOCKS5 proxy support and host discovery.

Designed for defensive inventory of networks you own/administer. It uses multiple
OS threads, each running an asyncio event loop, to perform TCP connect checks.

Host discovery pre-phase:
  A quick sweep over a small set of common ports finds the alive hosts first.
  The full port scan then runs only on discovered responsive IPs, which is
  much faster on large ranges with many offline addresses.

Proxy support:
  --proxy socks5://host:port routes every TCP connect through a SOCKS5 proxy.
"""
from __future__ import annotations

import argparse
import asyncio
import csv
import ipaddress
import contextlib
import os
import queue
import socket
import struct
import sys
import threading
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, Iterator, Sequence

TOP_100_PORTS = [
    7, 9, 13, 21, 22, 23, 25, 26, 37, 53, 79, 80, 81, 88, 106, 110, 111, 113,
    119, 135, 139, 143, 144, 179, 199, 389, 427, 443, 444, 445, 465, 513, 514,
    515, 543, 544, 548, 554, 587, 631, 646, 873, 990, 993, 995, 1025, 1026,
    1027, 1028, 1029, 1110, 1433, 1720, 1723, 1755, 1900, 2000, 2001, 2049,
    2121, 2717, 3000, 3128, 3306, 3389, 3986, 4899, 5000, 5009, 5051, 5060,
    5101, 5190, 5357, 5432, 5631, 5666, 5800, 5900, 6000, 6001, 6646, 7070,
    8000, 8008, 8009, 8080, 8081, 8443, 8888, 9100, 9999, 10000, 32768, 49152,
    49153, 49154, 49155, 49156, 49157,
]


HTTP_PROBE_PORTS = frozenset([
    80, 81, 88, 443, 3000, 3128, 4444, 4567, 5000, 5001, 5050, 5100,
    5443, 5555, 5601, 5800, 5984, 6080, 6443, 7000, 7001, 7070, 7474,
    8000, 8008, 8009, 8080, 8081, 8088, 8090, 8091, 8181, 8222, 8443,
    8501, 8834, 8880, 8888, 9000, 9001, 9043, 9090, 9091, 9200, 9443,
    9600, 9981, 10000, 10443, 12443, 15672, 50000,
])

SERVICE_HINTS = {
    20: "ftp-data", 21: "ftp", 22: "ssh", 23: "telnet", 25: "smtp",
    53: "dns", 69: "tftp", 80: "http", 110: "pop3", 111: "rpcbind",
    119: "nntp", 123: "ntp", 135: "msrpc", 139: "netbios-ssn",
    143: "imap", 161: "snmp", 389: "ldap", 443: "https", 445: "smb",
    465: "smtps", 500: "isakmp", 514: "syslog", 554: "rtsp",
    587: "submission", 631: "ipp", 636: "ldaps", 873: "rsync",
    990: "ftps", 993: "imaps", 995: "pop3s", 1080: "socks",
    1433: "mssql", 1521: "oracle", 1883: "mqtt", 2049: "nfs",
    2375: "docker", 2376: "docker-tls", 3000: "http-alt",
    3128: "http-proxy", 3306: "mysql", 3389: "rdp", 5432: "postgres",
    5672: "amqp", 5900: "vnc", 5984: "couchdb", 6379: "redis",
    6443: "kubernetes-api", 8000: "http-alt", 8008: "http-alt",
    8080: "http-proxy", 8081: "http-alt", 8443: "https-alt",
    8883: "mqtts", 8888: "http-alt", 9000: "http-alt", 9200: "elasticsearch",
    9443: "https-alt", 10000: "webmin", 11211: "memcached", 15672: "rabbitmq-http",
    27017: "mongodb",
}


def service_hint(port: int) -> str:
    return SERVICE_HINTS.get(port, "tcp")


def protocol_metadata(ip: str, port: int, latency_ms: float, probe: str, banner: str = "", http_headers: str = "") -> str:
    """Build a headers-style protocol block for every open TCP service.

    HTTP services keep their real HTTP response headers at the top; every other
    protocol gets a synthetic metadata header block so the UI always has
    protocol/header context even when the service is not HTTP.
    """
    lines = [
        f"Protocol: tcp",
        f"Service-Hint: {service_hint(port)}",
        f"Endpoint: {ip}:{port}",
        f"Probe: {probe}",
        f"Latency-Ms: {latency_ms:.1f}",
    ]
    if banner:
        lines.append(f"Banner: {banner[:512]}")
    metadata = "\n".join(lines)
    if http_headers:
        return f"{http_headers}\n\n--- Portglass Protocol Metadata ---\n{metadata}"
    return metadata


@dataclass(frozen=True)
class Finding:
    ip: str
    port: int
    state: str
    latency_ms: float
    banner: str = ""
    headers: str = ""


class AsyncRateLimiter:
    """Simple per-thread async rate limiter in connection attempts/second."""

    def __init__(self, rate: float):
        self.interval = 0.0 if rate <= 0 else 1.0 / rate
        self._next_at = 0.0
        self._lock = asyncio.Lock()

    async def wait(self) -> None:
        if self.interval <= 0:
            return
        async with self._lock:
            now = time.monotonic()
            if self._next_at > now:
                await asyncio.sleep(self._next_at - now)
                now = time.monotonic()
            self._next_at = max(self._next_at, now) + self.interval


def parse_ports(spec: str) -> list[int]:
    spec = spec.strip().lower()
    if spec in {"top100", "top-100"}:
        return sorted(set(TOP_100_PORTS))
    if spec in {"common", "default"}:
        return sorted(set([
            21, 22, 23, 25, 53, 69, 80, 110, 123, 135, 139, 143,
            161, 162, 389, 443, 445, 465, 500, 514, 554, 587, 631,
            636, 667, 700, 749, 873, 902, 912, 1080, 1194, 1433,
            1521, 1701, 1723, 1883, 1900, 2049, 2179, 2195, 2375,
            2376, 3000, 3128, 3268, 3269, 3306, 3389, 3780, 4444,
            4500, 4730, 4786, 4848, 5000, 5001, 5060, 5061, 5188,
            5222, 5353, 5357, 5432, 5560, 5672, 5900, 5938, 5984,
            6379, 6443, 6653, 6942, 7001, 7474, 7687, 8000, 8008,
            8009, 8080, 8081, 8443, 8883, 8888, 9000, 9001, 9042,
            9043, 9090, 9092, 9200, 9443, 9981, 10000, 11211, 15672,
            15674, 20000, 27017, 27018, 27019, 28015, 29015, 50000,
        ]))
    if spec == "all":
        return list(range(1, 65536))

    ports: set[int] = set()
    for part in spec.split(","):
        part = part.strip()
        if not part:
            continue
        if "-" in part:
            left, right = part.split("-", 1)
            start, end = int(left), int(right)
            if start > end:
                start, end = end, start
            ports.update(range(start, end + 1))
        else:
            ports.add(int(part))

    bad = [p for p in ports if p < 1 or p > 65535]
    if bad:
        raise argparse.ArgumentTypeError(f"invalid port(s): {bad[:5]}")
    return sorted(ports)


def parse_proxy(proxy_str: str | None) -> tuple[str, int] | None:
    if not proxy_str:
        return None
    s = proxy_str.strip()
    if s.startswith("socks5://"):
        s = s[9:]
    host, port_s = s.rsplit(":", 1)
    return host, int(port_s)


async def socks5_connect(proxy_host: str, proxy_port: int, target_ip: str, target_port: int, timeout: float):
    """Open a TCP connection through a SOCKS5 proxy. Returns (reader, writer)."""
    reader, writer = await asyncio.wait_for(
        asyncio.open_connection(proxy_host, proxy_port), timeout=timeout
    )
    try:
        # Greeting: ver 5, 1 method, no-auth (0x00)
        writer.write(bytes([0x05, 0x01, 0x00]))
        await writer.drain()
        resp = await asyncio.wait_for(reader.readexactly(2), timeout=timeout)
        if resp[0] != 0x05 or resp[1] != 0x00:
            raise ConnectionError(f"SOCKS5 auth negotiation failed: {resp.hex()}")

        # Connect request: ver 5, cmd connect (0x01), reserved, ATYP IPv4 (0x01)
        ip_bytes = socket.inet_aton(target_ip)
        req = bytes([0x05, 0x01, 0x00, 0x01]) + ip_bytes + struct.pack(">H", target_port)
        writer.write(req)
        await writer.drain()

        # Read reply header (first 4 bytes)
        header = await asyncio.wait_for(reader.readexactly(4), timeout=timeout)
        if header[0] != 0x05:
            raise ConnectionError(f"SOCKS5 unexpected reply version: {header[0]}")
        if header[1] != 0x00:
            raise ConnectionError(f"SOCKS5 connect failed with code {header[1]}")
        atyp = header[3]
        if atyp == 0x01:  # IPv4
            await asyncio.wait_for(reader.readexactly(4 + 2), timeout=timeout)
        elif atyp == 0x03:  # Domain
            dlen = await asyncio.wait_for(reader.readexactly(1), timeout=timeout)
            await asyncio.wait_for(reader.readexactly(dlen[0] + 2), timeout=timeout)
        elif atyp == 0x04:  # IPv6
            await asyncio.wait_for(reader.readexactly(16 + 2), timeout=timeout)
        return reader, writer
    except Exception:
        writer.close()
        try:
            await writer.wait_closed()
        except Exception:
            pass
        raise


async def _open_connection(ip: str, port: int, timeout: float, proxy: tuple[str, int] | None):
    if proxy is None:
        return await asyncio.wait_for(asyncio.open_connection(ip, port), timeout=timeout)
    return await socks5_connect(proxy[0], proxy[1], ip, port, timeout=timeout)


def iter_targets(cidr: str, ports: Sequence[int]) -> Iterator[tuple[str, int]]:
    net = ipaddress.ip_network(cidr, strict=False)
    if net.version != 4:
        raise ValueError("only IPv4 ranges are supported")
    for ip in net.hosts():
        ip_s = str(ip)
        for port in ports:
            yield ip_s, port


def chunked(items: Iterable[tuple[str, int]], size: int) -> Iterator[list[tuple[str, int]]]:
    batch: list[tuple[str, int]] = []
    for item in items:
        batch.append(item)
        if len(batch) >= size:
            yield batch
            batch = []
    if batch:
        yield batch


async def scan_once(
    ip: str,
    port: int,
    timeout: float,
    limiter: AsyncRateLimiter,
    banner: bool,
    proxy: tuple[str, int] | None,
    on_attempt=None,
) -> Finding | None:
    await limiter.wait()
    if on_attempt is not None:
        on_attempt()
    started = time.perf_counter()
    writer = None
    try:
        reader, writer = await _open_connection(ip, port, timeout, proxy)
        latency_ms = (time.perf_counter() - started) * 1000.0
        banner_text = ""
        headers_text = ""
        probe_kind = "tcp-connect"
        if banner or port in HTTP_PROBE_PORTS:
            try:
                if port in HTTP_PROBE_PORTS:
                    probe_kind = "http-get"
                    probe = f"GET / HTTP/1.1\r\nHost: {ip}\r\nUser-Agent: Mozilla/5.0\r\nConnection: close\r\n\r\n"
                    writer.write(probe.encode())
                    await writer.drain()
                    data = await asyncio.wait_for(reader.read(4096), timeout=min(timeout, 2.0))
                    response = data.decode("utf-8", errors="replace")
                    parts = response.split("\r\n\r\n", 1)
                    if parts and parts[0].startswith("HTTP/"):
                        headers_text = parts[0]
                    else:
                        parts2 = response.split("\n\n", 1)
                        if parts2 and parts2[0].startswith("HTTP/"):
                            headers_text = parts2[0]
                        else:
                            banner_text = response.replace("\r", " ").replace("\n", " ").strip()[:512]
                else:
                    probe_kind = "passive-banner"
                    data = await asyncio.wait_for(reader.read(128), timeout=min(timeout, 1.0))
                    banner_text = data.decode("utf-8", errors="replace").replace("\r", " ").replace("\n", " ").strip()
            except Exception:
                pass
        headers_text = protocol_metadata(ip, port, latency_ms, probe_kind, banner_text, headers_text)
        return Finding(ip=ip, port=port, state="open", latency_ms=latency_ms, banner=banner_text, headers=headers_text)
    except (asyncio.TimeoutError, OSError, ConnectionError):
        return None
    finally:
        if writer is not None:
            writer.close()
            try:
                await writer.wait_closed()
            except Exception:
                pass


async def verify_open(
    ip: str,
    port: int,
    timeout: float,
    limiter: AsyncRateLimiter,
    retries: int,
    banner: bool,
    proxy: tuple[str, int] | None,
    on_attempt=None,
) -> Finding | None:
    finding = await scan_once(ip, port, timeout, limiter, banner, proxy, on_attempt=on_attempt)
    if finding is None:
        return None
    for _ in range(max(0, retries)):
        again = await scan_once(ip, port, timeout, limiter, banner, proxy)
        if again is None:
            return None
        if not finding.banner and again.banner:
            finding = Finding(finding.ip, finding.port, finding.state, finding.latency_ms, again.banner, finding.headers)
        if again.headers and (not finding.headers or (again.headers.startswith("HTTP/") and not finding.headers.startswith("HTTP/"))):
            finding = Finding(finding.ip, finding.port, finding.state, finding.latency_ms, finding.banner, again.headers)
    return finding


async def scan_batch(
    batch: Sequence[tuple[str, int]],
    *,
    concurrency: int,
    timeout: float,
    per_thread_rate: float,
    verify_retries: int,
    banner: bool,
    proxy: tuple[str, int] | None,
    on_attempt=None,
) -> list[Finding]:
    limiter = AsyncRateLimiter(per_thread_rate)
    sem = asyncio.Semaphore(concurrency)
    results: list[Finding] = []

    async def runner(ip: str, port: int) -> None:
        async with sem:
            finding = await verify_open(ip, port, timeout, limiter, verify_retries, banner, proxy, on_attempt=on_attempt)
            if finding is not None:
                results.append(finding)

    await asyncio.gather(*(runner(ip, port) for ip, port in batch))
    return results


async def discover_hosts(
    cidr: str,
    ports: Sequence[int],
    *,
    concurrency: int,
    timeout: float,
    rate: float,
    threads: int,
    proxy: tuple[str, int] | None,
) -> set[str]:
    """Quickly find alive hosts by probing a small set of ports."""
    net = ipaddress.ip_network(cidr, strict=False)
    hosts = [str(ip) for ip in net.hosts()]
    total = len(hosts) * len(ports)
    if total == 0:
        return set()

    print(f"Discovery phase: {len(hosts):,} hosts × {len(ports)} port(s) = {total:,} quick probes", file=sys.stderr)
    limiter = AsyncRateLimiter(rate / threads if threads > 0 and rate > 0 else 0)
    sem = asyncio.Semaphore(concurrency)
    alive: set[str] = set()
    attempted = 0

    async def probe(ip: str, port: int) -> None:
        nonlocal attempted
        async with sem:
            await limiter.wait()
            attempted += 1
            try:
                await _open_connection(ip, port, timeout, proxy)
                alive.add(ip)
            except Exception:
                pass

    await asyncio.gather(*(probe(ip, port) for ip in hosts for port in ports))
    print(f"Discovery found {len(alive):,} alive host(s) out of {len(hosts):,}", file=sys.stderr)
    return alive


def writerow_safe(csv_writer: csv.writer | None, csv_file, lock: threading.Lock, finding: Finding) -> None:
    if csv_writer is None:
        return
    with lock:
        csv_writer.writerow([finding.ip, finding.port, finding.state, f"{finding.latency_ms:.1f}", finding.banner, finding.headers])
        if csv_file is not None:
            csv_file.flush()


def db_insert_findings(db_conn, db_lock: threading.Lock, run_id: int | None, findings: Sequence[Finding]) -> None:
    if db_conn is None or not findings:
        return
    with db_lock:
        with db_conn.cursor() as cur:
            cur.executemany(
                """
                INSERT INTO port_findings (run_id, ip, port, state, latency_ms, banner, headers)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (run_id, ip, port) DO UPDATE SET
                  state = EXCLUDED.state,
                  latency_ms = EXCLUDED.latency_ms,
                  banner = EXCLUDED.banner,
                  headers = EXCLUDED.headers,
                  observed_at = now()
                """,
                [(run_id, f.ip, f.port, f.state, f.latency_ms, f.banner, f.headers) for f in findings],
            )
        db_conn.commit()


def worker(
    worker_id: int,
    batches: "queue.Queue[list[tuple[str, int]] | None]",
    csv_writer: csv.writer | None,
    csv_file,
    csv_lock: threading.Lock,
    db_conn,
    db_lock: threading.Lock,
    run_id: int | None,
    args: argparse.Namespace,
    stats: dict[str, int],
    stats_lock: threading.Lock,
) -> None:
    per_thread_rate = (args.rate / args.threads) if args.rate > 0 else 0
    proxy = parse_proxy(args.proxy)
    while True:
        batch = batches.get()
        if batch is None:
            batches.task_done()
            return
        try:
            def mark_attempt() -> None:
                with stats_lock:
                    stats["attempted"] += 1

            findings = asyncio.run(
                scan_batch(
                    batch,
                    concurrency=args.concurrency,
                    timeout=args.timeout,
                    per_thread_rate=per_thread_rate,
                    verify_retries=args.verify_retries,
                    banner=args.banner,
                    proxy=proxy,
                    on_attempt=mark_attempt,
                )
            )
            for finding in findings:
                writerow_safe(csv_writer, csv_file, csv_lock, finding)
            db_insert_findings(db_conn, db_lock, run_id, findings)
            with stats_lock:
                stats["open"] += len(findings)
        except Exception as exc:
            print(f"\nWorker {worker_id} error: {exc}", file=sys.stderr)
            raise
        finally:
            batches.task_done()


def progress_thread(stats: dict[str, int], stats_lock: threading.Lock, total: int, started: float, stop: threading.Event) -> None:
    while not stop.wait(2.0):
        with stats_lock:
            attempted = stats["attempted"]
            opened = stats["open"]
        elapsed = max(0.001, time.time() - started)
        rate = attempted / elapsed
        pct = (attempted / total * 100.0) if total else 0.0
        eta = (total - attempted) / rate if rate > 0 else 0.0
        print(f"\r{attempted:,}/{total:,} {pct:5.1f}% | {rate:,.0f}/s | open {opened:,} | ETA {eta/60:.1f}m", end="", file=sys.stderr)
    print(file=sys.stderr)


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description="Fast multi-threaded authorized TCP connect port scanner")
    p.add_argument("cidr", help="IPv4 CIDR to scan, e.g. 192.168.0.0/16")
    p.add_argument("-p", "--ports", default="common", help="Ports: common, top100, 80,443, or 1-1024 (default: common)")
    p.add_argument("-o", "--output", default="scan-results.csv", help="CSV output path")
    p.add_argument("--threads", type=int, default=4, help="OS scanner threads (default: 4)")
    p.add_argument("--concurrency", type=int, default=512, help="Concurrent sockets per thread (default: 512)")
    p.add_argument("--timeout", type=float, default=0.8, help="TCP connect timeout seconds; increase for accuracy (default: 0.8)")
    p.add_argument("--rate", type=float, default=250.0, help="Global max connection attempts/second; lower to slow down (default: 250, 0=unlimited)")
    p.add_argument("--verify-retries", type=int, default=0, help="Re-check open ports N extra times to reduce false positives (slower)")
    p.add_argument("--banner", action="store_true", help="Try to read a small banner after connect (slower, may block until timeout)")
    p.add_argument("--db-url", default=os.environ.get("DATABASE_URL"), help="Postgres connection URL; also reads DATABASE_URL")
    p.add_argument("--no-csv", action="store_true", help="Do not write CSV output; useful with --db-url")
    p.add_argument("--batch-size", type=int, default=4096, help="Internal work batch size (default: 4096)")
    p.add_argument("--run-id", type=int, default=None, help="Existing scan_runs id to use (skip INSERT)")
    p.add_argument("--proxy", default=os.environ.get("SCAN_PROXY"), help="SOCKS5 proxy host:port (also SCAN_PROXY env var)")
    p.add_argument("--discover", action="store_true", help="Quickly discover alive hosts first, then full-scan only those")
    p.add_argument("--discover-ports", default="22,80,443,445,3389", help="Ports used for host discovery (default: 22,80,443,445,3389)")
    p.add_argument("--discover-timeout", type=float, default=0.6, help="Discovery connect timeout (default: 0.6)")
    p.add_argument("--yes-i-own-this-network", action="store_true", help="Required acknowledgement for authorized scanning")
    return p


def main(argv: Sequence[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    if not args.yes_i_own_this_network:
        print("Refusing to run without authorization acknowledgement. Add --yes-i-own-this-network for networks you own/administer.", file=sys.stderr)
        return 2
    if args.threads < 1 or args.concurrency < 1 or args.batch_size < 1:
        print("threads, concurrency, and batch-size must be positive", file=sys.stderr)
        return 2

    try:
        import resource
        soft, hard = resource.getrlimit(resource.RLIMIT_NOFILE)
        target = min(max(soft, args.threads * args.concurrency + 256), hard)
        resource.setrlimit(resource.RLIMIT_NOFILE, (target, hard))
    except Exception:
        pass

    ports = parse_ports(args.ports)
    net = ipaddress.ip_network(args.cidr, strict=False)

    proxy = parse_proxy(args.proxy)
    if proxy:
        print(f"Routing through SOCKS5 proxy {proxy[0]}:{proxy[1]}", file=sys.stderr)

    alive_hosts: set[str] | None = None
    if args.discover:
        discover_ports = parse_ports(args.discover_ports)
        alive_hosts = asyncio.run(discover_hosts(
            args.cidr,
            discover_ports,
            concurrency=args.concurrency,
            timeout=args.discover_timeout,
            rate=args.rate,
            threads=args.threads,
            proxy=proxy,
        ))
        if not alive_hosts:
            print("No alive hosts discovered. Exiting.", file=sys.stderr)
            return 0

    def target_iter() -> Iterator[tuple[str, int]]:
        hosts = alive_hosts if alive_hosts is not None else (str(ip) for ip in net.hosts())
        for ip in hosts:
            for port in ports:
                yield ip, port

    total = sum(1 for _ in target_iter())

    out = Path(args.output)
    batches: "queue.Queue[list[tuple[str, int]] | None]" = queue.Queue(maxsize=args.threads * 4)
    stats = {"attempted": 0, "open": 0}
    stats_lock = threading.Lock()
    csv_lock = threading.Lock()
    db_lock = threading.Lock()
    db_conn = None
    run_id = None
    if args.db_url:
        try:
            import psycopg
            db_conn = psycopg.connect(args.db_url)
            if args.run_id is not None:
                run_id = args.run_id
                with db_conn.cursor() as cur:
                    cur.execute(
                        "UPDATE scan_runs SET cidr = %s, ports = %s, started_at = now(), finished_at = NULL WHERE id = %s",
                        (str(net), ",".join(map(str, ports)), run_id),
                    )
                db_conn.commit()
                print(f"Resuming scan run_id={run_id}", file=sys.stderr)
            else:
                with db_conn.cursor() as cur:
                    cur.execute(
                        "INSERT INTO scan_runs (cidr, ports) VALUES (%s, %s) RETURNING id",
                        (str(net), ",".join(map(str, ports))),
                    )
                    run_id = cur.fetchone()[0]
                db_conn.commit()
                print(f"Writing open-port findings to Postgres run_id={run_id}", file=sys.stderr)
        except ImportError:
            print("Postgres output requires psycopg. Install with: python3 -m pip install 'psycopg[binary]'", file=sys.stderr)
            return 2
    stop_progress = threading.Event()
    started = time.time()

    file_cm = contextlib.nullcontext(None) if args.no_csv else out.open("w", newline="", encoding="utf-8")
    with file_cm as f:
        csv_writer = None if args.no_csv else csv.writer(f)
        if csv_writer is not None:
            csv_writer.writerow(["ip", "port", "state", "latency_ms", "banner", "headers"])

        progress = threading.Thread(target=progress_thread, args=(stats, stats_lock, total, started, stop_progress), daemon=True)
        progress.start()

        print(
            f"Scanning {args.cidr} on {len(ports)} port(s): {total:,} TCP connect attempts. "
            f"rate={args.rate}/s threads={args.threads} concurrency/thread={args.concurrency}",
            file=sys.stderr,
        )

        workers = [
            threading.Thread(target=worker, args=(i, batches, csv_writer, f, csv_lock, db_conn, db_lock, run_id, args, stats, stats_lock), daemon=True)
            for i in range(args.threads)
        ]
        for t in workers:
            t.start()

        try:
            for batch in chunked(target_iter(), args.batch_size):
                batches.put(batch)
            for _ in workers:
                batches.put(None)
            batches.join()
        except KeyboardInterrupt:
            print("\nInterrupted; partial results saved.", file=sys.stderr)
            return 130
        finally:
            stop_progress.set()
            for _ in workers:
                try:
                    batches.put_nowait(None)
                except queue.Full:
                    pass
            for t in workers:
                t.join(timeout=1.0)

    elapsed = time.time() - started
    if db_conn is not None and run_id is not None:
        with db_conn.cursor() as cur:
            cur.execute("UPDATE scan_runs SET finished_at = now() WHERE id = %s", (run_id,))
        db_conn.commit()
        db_conn.close()
    target = f"Postgres run_id={run_id}" if args.no_csv else str(out)
    print(f"Done in {elapsed:.1f}s. Open ports: {stats['open']:,}. Results: {target}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
