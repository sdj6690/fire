import json
import os
import signal
import subprocess
import time
import urllib.request
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def fetch(url, method='GET', payload=None):
    data = None
    headers = {}
    if payload is not None:
        data = json.dumps(payload).encode('utf-8')
        headers['Content-Type'] = 'application/json'
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    with urllib.request.urlopen(req, timeout=5) as resp:
        return resp.getcode(), json.loads(resp.read().decode('utf-8'))


class ServerSmokeTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        db = ROOT / 'trades.db'
        if db.exists():
            db.unlink()
        cls.proc = subprocess.Popen(['python3', 'server.py'], cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        time.sleep(1.0)

    @classmethod
    def tearDownClass(cls):
        if cls.proc and cls.proc.poll() is None:
            os.kill(cls.proc.pid, signal.SIGTERM)
            cls.proc.wait(timeout=3)
        db = ROOT / 'trades.db'
        if db.exists():
            db.unlink()

    def test_market_and_core_flow(self):
        code, market = fetch('http://127.0.0.1:4173/api/market')
        self.assertEqual(code, 200)
        self.assertIn('price', market)

        code, strategies = fetch('http://127.0.0.1:4173/api/strategies')
        self.assertEqual(code, 200)
        self.assertGreaterEqual(len(strategies), 1)

        code, created = fetch(
            'http://127.0.0.1:4173/api/trades',
            method='POST',
            payload={
                'side': 'LONG',
                'entry': 90000,
                'sl': 89900,
                'tp': 90200,
                'notes': 'smoke',
                'strategyId': strategies[0]['id'],
            },
        )
        self.assertEqual(code, 201)
        trade_id = created['tradeId']

        code, _ = fetch(
            f'http://127.0.0.1:4173/api/trades/{trade_id}/events',
            method='POST',
            payload={'eventType': 'SL_UP', 'note': 'smoke sl', 'oldSL': 89900, 'newSL': 89950, 'price': 90020},
        )
        self.assertEqual(code, 201)

        code, closed = fetch(
            f'http://127.0.0.1:4173/api/trades/{trade_id}/close',
            method='POST',
            payload={'price': 90100},
        )
        self.assertEqual(code, 200)
        self.assertIn('pnl', closed)

        code, timeline = fetch(f'http://127.0.0.1:4173/api/trades/{trade_id}/timeline')
        self.assertEqual(code, 200)
        self.assertGreaterEqual(len(timeline), 2)

        code, analytics = fetch('http://127.0.0.1:4173/api/analytics')
        self.assertEqual(code, 200)
        self.assertIn('winRate', analytics)


if __name__ == '__main__':
    unittest.main()
