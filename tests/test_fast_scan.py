import argparse
import asyncio
import queue
import threading
import unittest
from unittest.mock import patch

import fast_scan


class FakeCursor:
    def __init__(self, connection):
        self.connection = connection

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def executemany(self, *_args):
        self.connection.execute_calls += 1
        if self.connection.execute_calls == 1:
            raise RuntimeError("transient database error")


class FakeConnection:
    def __init__(self):
        self.execute_calls = 0
        self.commits = 0
        self.rollbacks = 0

    def cursor(self):
        return FakeCursor(self)

    def commit(self):
        self.commits += 1

    def rollback(self):
        self.rollbacks += 1


class ScannerResilienceTests(unittest.TestCase):
    def test_excluded_ports_are_removed_before_target_generation(self):
        self.assertEqual(
            fast_scan.filter_excluded_ports([80, 443, 5060, 5061], "5060,5061"),
            [80, 443],
        )

    def test_excluding_every_selected_port_is_rejected(self):
        with self.assertRaises(argparse.ArgumentTypeError):
            fast_scan.filter_excluded_ports([5060], "5060")

    def test_dynamic_seed_uses_selected_common_ports_and_never_excluded_ones(self):
        selected = fast_scan.filter_excluded_ports([22, 80, 443, 5060, 9999], "5060")
        self.assertEqual(fast_scan.dynamic_seed_ports(selected), [22, 80, 443])

    def test_dynamic_seed_falls_back_for_custom_uncommon_ports(self):
        self.assertEqual(fast_scan.dynamic_seed_ports([12345, 23456]), [12345, 23456])

    def test_main_never_generates_targets_for_excluded_port(self):
        observed_ports = []

        async def record_scan_batch(batch, **kwargs):
            observed_ports.extend(port for _, port in batch)
            for _ in batch:
                kwargs["on_attempt"]()
            return []

        with patch.object(fast_scan, "scan_batch", record_scan_batch):
            result = fast_scan.main([
                "127.0.0.0/30",
                "--ports", "80,5060",
                "--exclude-ports", "5060",
                "--threads", "1",
                "--concurrency", "2",
                "--rate", "0",
                "--no-csv",
                "--yes-i-own-this-network",
            ])

        self.assertEqual(result, 0)
        self.assertEqual(observed_ports, [80, 80])

    def test_worker_keeps_draining_after_a_batch_failure(self):
        batches = queue.Queue()
        batches.put([("192.0.2.1", 80)])
        batches.put([("192.0.2.2", 443)])
        batches.put(None)

        calls = 0

        async def flaky_scan_batch(batch, **kwargs):
            nonlocal calls
            calls += 1
            if calls == 1:
                raise RuntimeError("injected batch failure")
            kwargs["on_attempt"]()
            return []

        args = argparse.Namespace(
            rate=0,
            threads=1,
            proxy=None,
            concurrency=1,
            timeout=0.1,
            verify_retries=0,
            banner=False,
            read_timeout=0.1,
            jitter=0,
        )
        stats = {"attempted": 0, "open": 0, "current_ip": None}
        lock = threading.Lock()

        with patch.object(fast_scan, "scan_batch", flaky_scan_batch):
            thread = threading.Thread(
                target=fast_scan.worker,
                args=(0, batches, None, None, lock, None, lock, None, args, stats, lock),
            )
            thread.start()
            thread.join(timeout=2)

        self.assertFalse(thread.is_alive())
        self.assertEqual(calls, 2)
        self.assertEqual(batches.unfinished_tasks, 0)
        self.assertEqual(stats["attempted"], 1)

    def test_database_insert_rolls_back_and_retries(self):
        connection = FakeConnection()
        finding = fast_scan.Finding("192.0.2.1", 80, "open", 1.0)

        with patch.object(fast_scan.time, "sleep"):
            fast_scan.db_insert_findings(
                connection, threading.Lock(), 1, [finding],
            )

        self.assertEqual(connection.execute_calls, 2)
        self.assertEqual(connection.rollbacks, 1)
        self.assertEqual(connection.commits, 1)


class BatchIsolationTests(unittest.IsolatedAsyncioTestCase):
    async def test_one_probe_error_does_not_cancel_the_batch(self):
        attempted = 0

        def mark_attempt():
            nonlocal attempted
            attempted += 1

        async def flaky_verify(ip, port, *args, **kwargs):
            kwargs["on_attempt"]()
            if ip == "192.0.2.1":
                raise RuntimeError("injected probe failure")
            return None

        with patch.object(fast_scan, "verify_open", flaky_verify):
            findings = await fast_scan.scan_batch(
                [("192.0.2.1", 80), ("192.0.2.2", 443)],
                concurrency=2,
                timeout=0.1,
                per_thread_rate=0,
                verify_retries=0,
                banner=False,
                proxy=None,
                on_attempt=mark_attempt,
            )

        self.assertEqual(findings, [])
        self.assertEqual(attempted, 2)


if __name__ == "__main__":
    unittest.main()
