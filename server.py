#!/usr/bin/env python3
import json
import sqlite3
import urllib.request
from datetime import datetime, timezone
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parent
WEB_DIST = ROOT / "web_dist"
DB_PATH = ROOT / "trades.db"
BINANCE = "https://fapi.binance.com"


def now_iso():
    return datetime.now(timezone.utc).isoformat()


def db_conn():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    conn = db_conn()
    cur = conn.cursor()
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS strategy_profiles (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            description TEXT,
            min_rr REAL NOT NULL DEFAULT 1.5,
            created_at TEXT NOT NULL
        )
        """
    )
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS risk_config (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            daily_loss_limit REAL NOT NULL DEFAULT 500,
            max_consecutive_losses INTEGER NOT NULL DEFAULT 3,
            max_open_trades INTEGER NOT NULL DEFAULT 1,
            updated_at TEXT NOT NULL
        )
        """
    )
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS trades (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            side TEXT NOT NULL CHECK (side IN ('LONG','SHORT')),
            entry REAL NOT NULL,
            sl REAL,
            tp REAL,
            status TEXT NOT NULL DEFAULT 'OPEN',
            opened_at TEXT NOT NULL,
            closed_at TEXT,
            pnl REAL,
            notes TEXT,
            strategy_id INTEGER,
            FOREIGN KEY(strategy_id) REFERENCES strategy_profiles(id)
        )
        """
    )
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS trade_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            trade_id INTEGER NOT NULL,
            event_time TEXT NOT NULL,
            event_type TEXT NOT NULL,
            price REAL,
            note TEXT,
            old_sl REAL,
            new_sl REAL,
            qty_pct REAL,
            FOREIGN KEY(trade_id) REFERENCES trades(id)
        )
        """
    )

    # light migration for older DB
    cols = [r["name"] for r in cur.execute("PRAGMA table_info(trades)").fetchall()]
    if "strategy_id" not in cols:
        cur.execute("ALTER TABLE trades ADD COLUMN strategy_id INTEGER")

    cnt_strategy = cur.execute("SELECT COUNT(*) c FROM strategy_profiles").fetchone()["c"]
    if cnt_strategy == 0:
        cur.execute(
            "INSERT INTO strategy_profiles(name, description, min_rr, created_at) VALUES(?,?,?,?)",
            ("Box Mean Revert", "VAL/VAH 평균회귀", 1.5, now_iso()),
        )
        cur.execute(
            "INSERT INTO strategy_profiles(name, description, min_rr, created_at) VALUES(?,?,?,?)",
            ("Breakout Follow", "돌파 추세추종", 2.0, now_iso()),
        )

    cfg = cur.execute("SELECT * FROM risk_config WHERE id=1").fetchone()
    if not cfg:
        cur.execute(
            "INSERT INTO risk_config(id, daily_loss_limit, max_consecutive_losses, max_open_trades, updated_at) VALUES(1,500,3,1,?)",
            (now_iso(),),
        )

    conn.commit()
    conn.close()


def fetch_json(url: str):
    with urllib.request.urlopen(url, timeout=8) as resp:
        return json.loads(resp.read().decode("utf-8"))


def fetch_market_snapshot():
    try:
        kl = fetch_json(f"{BINANCE}/fapi/v1/klines?symbol=BTCUSDT&interval=15m&limit=120")
        ticker = fetch_json(f"{BINANCE}/fapi/v1/ticker/price?symbol=BTCUSDT")
        price = float(ticker["price"])
        highs = [float(k[2]) for k in kl[-30:]]
        lows = [float(k[3]) for k in kl[-30:]]
        source = "binance"
    except Exception:
        price = 90000.0
        lows = [89500.0, 89600.0, 89700.0]
        highs = [90300.0, 90400.0, 90500.0]
        source = "fallback"

    box_high = max(highs)
    box_low = min(lows)
    mid = (box_high + box_low) / 2
    rng = max(1e-9, box_high - box_low)

    near_low = price <= box_low + rng * 0.2
    near_high = price >= box_high - rng * 0.2

    signal = "WAIT"
    side = None
    rr = None
    reason = "중앙 구간: 관망"

    if near_low:
        signal = "READY"
        side = "LONG"
        risk = max(1.0, price - (box_low - rng * 0.1))
        reward = max(0.0, mid - price)
        rr = round(reward / risk, 2)
        reason = "박스 하단 접근(평균회귀 후보)"
    elif near_high:
        signal = "READY"
        side = "SHORT"
        risk = max(1.0, (box_high + rng * 0.1) - price)
        reward = max(0.0, price - mid)
        rr = round(reward / risk, 2)
        reason = "박스 상단 접근(평균회귀 후보)"

    return {
        "price": price,
        "boxLow": box_low,
        "boxHigh": box_high,
        "mid": mid,
        "signal": signal,
        "side": side,
        "rr": rr,
        "reason": reason,
        "timestamp": now_iso(),
        "source": source,
    }


def compute_guardrails(conn):
    cfg = conn.execute("SELECT * FROM risk_config WHERE id=1").fetchone()
    open_count = conn.execute("SELECT COUNT(*) c FROM trades WHERE status='OPEN'").fetchone()["c"]

    day_prefix = datetime.now(timezone.utc).date().isoformat()
    day_closed = conn.execute(
        "SELECT pnl FROM trades WHERE status='CLOSED' AND closed_at LIKE ?",
        (f"{day_prefix}%",),
    ).fetchall()
    day_pnl = sum(float(r["pnl"] or 0) for r in day_closed)

    last_closed = conn.execute(
        "SELECT pnl FROM trades WHERE status='CLOSED' ORDER BY closed_at DESC LIMIT 20"
    ).fetchall()
    consec_losses = 0
    for r in last_closed:
        if float(r["pnl"] or 0) < 0:
            consec_losses += 1
        else:
            break

    blocks = []
    if open_count >= cfg["max_open_trades"]:
        blocks.append("OPEN 포지션 개수 제한 초과")
    if day_pnl <= -float(cfg["daily_loss_limit"]):
        blocks.append("일 손실 한도 초과")
    if consec_losses >= int(cfg["max_consecutive_losses"]):
        blocks.append("연속 손실 제한 도달")

    return {
        "openTrades": open_count,
        "dayPnl": round(day_pnl, 2),
        "consecutiveLosses": consec_losses,
        "config": dict(cfg),
        "blocked": len(blocks) > 0,
        "reasons": blocks,
    }


def parse_path_id(path):
    parts = path.strip("/").split("/")
    if len(parts) < 3:
        return None
    try:
        return int(parts[2])
    except Exception:
        return None


class Handler(BaseHTTPRequestHandler):
    def _send(self, code=200, payload=None, content_type="application/json; charset=utf-8"):
        body = b""
        if payload is not None:
            if content_type.startswith("application/json"):
                body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
            else:
                body = payload.encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        if body:
            self.wfile.write(body)

    def _read_json(self):
        length = int(self.headers.get("Content-Length", "0"))
        raw = self.rfile.read(length) if length > 0 else b"{}"
        return json.loads(raw.decode("utf-8"))

    def do_GET(self):
        path = urlparse(self.path).path

        if path == "/api/market":
            self._send(200, fetch_market_snapshot())
            return

        if path == "/api/strategies":
            conn = db_conn()
            rows = conn.execute("SELECT * FROM strategy_profiles ORDER BY id ASC").fetchall()
            conn.close()
            self._send(200, [dict(r) for r in rows])
            return

        if path == "/api/risk-config":
            conn = db_conn()
            cfg = conn.execute("SELECT * FROM risk_config WHERE id=1").fetchone()
            conn.close()
            self._send(200, dict(cfg))
            return

        if path == "/api/guardrails":
            conn = db_conn()
            payload = compute_guardrails(conn)
            conn.close()
            self._send(200, payload)
            return

        if path == "/api/trades":
            conn = db_conn()
            rows = conn.execute(
                """
                SELECT t.*, s.name AS strategy_name
                FROM trades t
                LEFT JOIN strategy_profiles s ON t.strategy_id = s.id
                ORDER BY t.id DESC
                """
            ).fetchall()
            conn.close()
            self._send(200, [dict(r) for r in rows])
            return

        if path.startswith("/api/trades/") and path.endswith("/timeline"):
            trade_id = parse_path_id(path)
            if trade_id is None:
                self._send(400, {"error": "invalid_trade_id"})
                return
            conn = db_conn()
            rows = conn.execute(
                "SELECT event_time, event_type, note, price, old_sl, new_sl, qty_pct FROM trade_events WHERE trade_id=? ORDER BY event_time ASC",
                (trade_id,),
            ).fetchall()
            conn.close()
            self._send(200, [dict(r) for r in rows])
            return

        if path == "/api/analytics":
            conn = db_conn()
            trades = conn.execute("SELECT * FROM trades WHERE status='CLOSED'").fetchall()
            if not trades:
                conn.close()
                self._send(200, {"closedTrades": 0, "winRate": 0, "avgPnl": 0, "longWinRate": 0, "shortWinRate": 0, "tips": ["아직 청산 거래가 없습니다."]})
                return

            pnls = [float(t["pnl"] or 0) for t in trades]
            wins = sum(1 for p in pnls if p > 0)
            long_t = [t for t in trades if t["side"] == "LONG"]
            short_t = [t for t in trades if t["side"] == "SHORT"]

            def wr(arr):
                if not arr:
                    return 0.0
                return round(sum(1 for t in arr if float(t["pnl"] or 0) > 0) / len(arr) * 100, 1)

            win_rate = round((wins / len(pnls)) * 100, 1)
            avg = round(sum(pnls) / len(pnls), 2)
            long_wr = wr(long_t)
            short_wr = wr(short_t)

            tips = []
            if win_rate < 45:
                tips.append("승률이 낮습니다. 진입 필터를 강화하세요.")
            if avg < 0:
                tips.append("평균 손익이 음수입니다. 손절 확대/조기청산 습관 점검이 필요합니다.")
            if long_wr > 0 and short_wr > 0 and abs(long_wr - short_wr) >= 20:
                better = "LONG" if long_wr > short_wr else "SHORT"
                tips.append(f"사이드 편차 큼: {better} 성과가 더 좋습니다. 약한 쪽 진입을 줄여보세요.")
            if not tips:
                tips.append("성과가 안정적입니다. 동일 규칙을 유지하고 과매매를 경계하세요.")

            # 시간대 히트(UTC 기준)
            hours = {str(h): {"count": 0, "win": 0} for h in range(24)}
            for t in trades:
                try:
                    h = datetime.fromisoformat(t["opened_at"]).hour
                except Exception:
                    h = 0
                key = str(h)
                hours[key]["count"] += 1
                if float(t["pnl"] or 0) > 0:
                    hours[key]["win"] += 1

            conn.close()
            self._send(
                200,
                {
                    "closedTrades": len(pnls),
                    "winRate": win_rate,
                    "avgPnl": avg,
                    "longWinRate": long_wr,
                    "shortWinRate": short_wr,
                    "hourly": hours,
                    "tips": tips,
                },
            )
            return

        # static files (prefer React build output)
        static_root = WEB_DIST if WEB_DIST.exists() else ROOT
        file_path = static_root / ("index.html" if path == "/" else path.lstrip("/"))

        # SPA fallback: if direct route and asset not found, return index.html
        if not file_path.exists() and not Path(path).suffix:
            file_path = static_root / "index.html"

        if file_path.exists() and file_path.is_file():
            ctype = "text/plain; charset=utf-8"
            if file_path.suffix == ".html":
                ctype = "text/html; charset=utf-8"
            elif file_path.suffix == ".js":
                ctype = "application/javascript; charset=utf-8"
            elif file_path.suffix == ".css":
                ctype = "text/css; charset=utf-8"
            self._send(200, file_path.read_text(encoding="utf-8"), ctype)
            return

        self._send(404, {"error": "not_found"})

    def do_POST(self):
        path = urlparse(self.path).path
        try:
            payload = self._read_json()
        except Exception:
            self._send(400, {"error": "invalid_json"})
            return

        if path == "/api/strategies":
            name = str(payload.get("name") or "").strip()
            if not name:
                self._send(400, {"error": "invalid_strategy_name"})
                return
            desc = str(payload.get("description") or "").strip()
            min_rr = float(payload.get("minRR") or 1.5)
            conn = db_conn()
            try:
                conn.execute(
                    "INSERT INTO strategy_profiles(name, description, min_rr, created_at) VALUES(?,?,?,?)",
                    (name, desc, min_rr, now_iso()),
                )
                conn.commit()
            except sqlite3.IntegrityError:
                conn.close()
                self._send(409, {"error": "strategy_name_exists"})
                return
            conn.close()
            self._send(201, {"ok": True})
            return

        if path == "/api/risk-config":
            daily = float(payload.get("dailyLossLimit") or 500)
            consec = int(payload.get("maxConsecutiveLosses") or 3)
            max_open = int(payload.get("maxOpenTrades") or 1)
            conn = db_conn()
            conn.execute(
                "UPDATE risk_config SET daily_loss_limit=?, max_consecutive_losses=?, max_open_trades=?, updated_at=? WHERE id=1",
                (daily, consec, max_open, now_iso()),
            )
            conn.commit()
            conn.close()
            self._send(200, {"ok": True})
            return

        if path == "/api/trades":
            side = payload.get("side")
            entry = float(payload.get("entry") or 0)
            sl = payload.get("sl")
            tp = payload.get("tp")
            notes = payload.get("notes")
            strategy_id = payload.get("strategyId")

            if side not in ("LONG", "SHORT") or entry <= 0:
                self._send(400, {"error": "invalid_trade_payload"})
                return

            conn = db_conn()
            guards = compute_guardrails(conn)
            if guards["blocked"]:
                conn.close()
                self._send(409, {"error": "risk_blocked", "guardrails": guards})
                return

            if strategy_id is not None:
                strategy = conn.execute("SELECT * FROM strategy_profiles WHERE id=?", (strategy_id,)).fetchone()
                if not strategy:
                    conn.close()
                    self._send(400, {"error": "invalid_strategy_id"})
                    return
                if sl is not None and tp is not None:
                    risk = abs(entry - float(sl))
                    reward = abs(float(tp) - entry)
                    rr = reward / risk if risk > 0 else 0
                    if rr < float(strategy["min_rr"]):
                        conn.close()
                        self._send(409, {"error": "rr_below_strategy_min", "required": strategy["min_rr"], "actual": round(rr, 2)})
                        return

            cur = conn.cursor()
            cur.execute(
                "INSERT INTO trades(side, entry, sl, tp, opened_at, notes, strategy_id) VALUES(?,?,?,?,?,?,?)",
                (side, entry, sl, tp, now_iso(), notes, strategy_id),
            )
            trade_id = cur.lastrowid
            cur.execute(
                "INSERT INTO trade_events(trade_id, event_time, event_type, price, note) VALUES(?,?,?,?,?)",
                (trade_id, now_iso(), "OPEN", entry, "포지션 진입"),
            )
            conn.commit()
            conn.close()
            self._send(201, {"tradeId": trade_id})
            return

        if path.startswith("/api/trades/") and path.endswith("/events"):
            trade_id = parse_path_id(path)
            if trade_id is None:
                self._send(400, {"error": "invalid_trade_id"})
                return
            event_type = payload.get("eventType")
            note = payload.get("note", "")
            price = payload.get("price")
            old_sl = payload.get("oldSL")
            new_sl = payload.get("newSL")
            qty_pct = payload.get("qtyPct")

            conn = db_conn()
            exists = conn.execute("SELECT id FROM trades WHERE id=?", (trade_id,)).fetchone()
            if not exists:
                conn.close()
                self._send(404, {"error": "trade_not_found"})
                return

            conn.execute(
                "INSERT INTO trade_events(trade_id, event_time, event_type, price, note, old_sl, new_sl, qty_pct) VALUES(?,?,?,?,?,?,?,?)",
                (trade_id, now_iso(), event_type, price, note, old_sl, new_sl, qty_pct),
            )
            if event_type in ("SL_UP", "SL_DOWN") and new_sl is not None:
                conn.execute("UPDATE trades SET sl=? WHERE id=?", (new_sl, trade_id))
            conn.commit()
            conn.close()
            self._send(201, {"ok": True})
            return

        if path.startswith("/api/trades/") and path.endswith("/close"):
            trade_id = parse_path_id(path)
            if trade_id is None:
                self._send(400, {"error": "invalid_trade_id"})
                return
            close_price = float(payload.get("price") or 0)
            if close_price <= 0:
                self._send(400, {"error": "invalid_close_price"})
                return

            conn = db_conn()
            trade = conn.execute("SELECT * FROM trades WHERE id=?", (trade_id,)).fetchone()
            if not trade:
                conn.close()
                self._send(404, {"error": "trade_not_found"})
                return
            pnl = close_price - trade["entry"] if trade["side"] == "LONG" else trade["entry"] - close_price
            conn.execute(
                "UPDATE trades SET status='CLOSED', closed_at=?, pnl=? WHERE id=?",
                (now_iso(), pnl, trade_id),
            )
            conn.execute(
                "INSERT INTO trade_events(trade_id, event_time, event_type, price, note) VALUES(?,?,?,?,?)",
                (trade_id, now_iso(), "CLOSE", close_price, "포지션 청산"),
            )
            conn.commit()
            conn.close()
            self._send(200, {"ok": True, "pnl": round(pnl, 2)})
            return

        self._send(404, {"error": "not_found"})


def main():
    init_db()
    server = ThreadingHTTPServer(("0.0.0.0", 4173), Handler)
    print("Server started at http://0.0.0.0:4173")
    server.serve_forever()


if __name__ == "__main__":
    main()
