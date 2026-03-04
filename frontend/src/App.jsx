import { useEffect, useMemo, useState } from 'react'

async function jfetch(url, opts = {}) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `http_${res.status}`)
  return data
}

export default function App() {
  const [market, setMarket] = useState(null)
  const [strategies, setStrategies] = useState([])
  const [risk, setRisk] = useState({ dailyLossLimit: 500, maxConsecutiveLosses: 3, maxOpenTrades: 1 })
  const [guardrails, setGuardrails] = useState(null)
  const [trades, setTrades] = useState([])
  const [timeline, setTimeline] = useState([])
  const [analytics, setAnalytics] = useState(null)

  const [form, setForm] = useState({ side: 'LONG', entry: '', sl: '', tp: '', notes: '', strategyId: '' })
  const [newStrategy, setNewStrategy] = useState({ name: '', minRR: '' })
  const [activeTradeId, setActiveTradeId] = useState('')

  const openTrades = useMemo(() => trades.filter((t) => t.status === 'OPEN'), [trades])

  async function refreshMarket() { setMarket(await jfetch('/api/market')) }
  async function refreshStrategies() { setStrategies(await jfetch('/api/strategies')) }
  async function refreshRisk() {
    const cfg = await jfetch('/api/risk-config')
    setRisk({
      dailyLossLimit: cfg.daily_loss_limit,
      maxConsecutiveLosses: cfg.max_consecutive_losses,
      maxOpenTrades: cfg.max_open_trades,
    })
  }
  async function refreshGuardrails() { setGuardrails(await jfetch('/api/guardrails')) }
  async function refreshTrades() { setTrades(await jfetch('/api/trades')) }
  async function refreshAnalytics() { setAnalytics(await jfetch('/api/analytics')) }
  async function refreshTimeline(tradeId) {
    if (!tradeId) return setTimeline([])
    setTimeline(await jfetch(`/api/trades/${tradeId}/timeline`))
  }

  async function refreshAll() {
    await Promise.all([refreshMarket(), refreshStrategies(), refreshRisk(), refreshGuardrails(), refreshTrades(), refreshAnalytics()])
  }

  async function onOpenTrade() {
    await jfetch('/api/trades', {
      method: 'POST',
      body: JSON.stringify({
        side: form.side,
        entry: Number(form.entry || market?.price || 0),
        sl: form.sl ? Number(form.sl) : null,
        tp: form.tp ? Number(form.tp) : null,
        notes: form.notes,
        strategyId: form.strategyId ? Number(form.strategyId) : null,
      }),
    })
    setForm((f) => ({ ...f, entry: '', sl: '', tp: '', notes: '' }))
    await refreshTrades()
    await refreshGuardrails()
    await refreshAnalytics()
  }

  async function onAddStrategy() {
    await jfetch('/api/strategies', {
      method: 'POST',
      body: JSON.stringify({ name: newStrategy.name, minRR: Number(newStrategy.minRR || 1.5), description: '' }),
    })
    setNewStrategy({ name: '', minRR: '' })
    await refreshStrategies()
  }

  async function onSaveRisk() {
    await jfetch('/api/risk-config', {
      method: 'POST',
      body: JSON.stringify({
        dailyLossLimit: Number(risk.dailyLossLimit),
        maxConsecutiveLosses: Number(risk.maxConsecutiveLosses),
        maxOpenTrades: Number(risk.maxOpenTrades),
      }),
    })
    await refreshGuardrails()
  }

  async function pushEvent(eventType, extra = {}) {
    if (!activeTradeId) return
    await jfetch(`/api/trades/${activeTradeId}/events`, {
      method: 'POST',
      body: JSON.stringify({ eventType, ...extra }),
    })
    await refreshTrades()
    await refreshTimeline(activeTradeId)
  }

  async function adjustSL(direction) {
    const t = trades.find((x) => String(x.id) === String(activeTradeId))
    if (!t) return
    const oldSL = Number(t.sl || 0)
    const newSL = oldSL + (direction === 'UP' ? 50 : -50)
    await pushEvent(direction === 'UP' ? 'SL_UP' : 'SL_DOWN', {
      note: direction === 'UP' ? 'SL 상향 조정' : 'SL 하향 조정',
      oldSL,
      newSL,
      price: market?.price || null,
    })
  }

  async function closeTrade() {
    if (!activeTradeId) return
    const price = Number(market?.price || 0)
    if (!price) return
    await jfetch(`/api/trades/${activeTradeId}/close`, {
      method: 'POST',
      body: JSON.stringify({ price }),
    })
    await refreshTrades()
    await refreshGuardrails()
    await refreshAnalytics()
    setTimeline([])
  }

  useEffect(() => {
    refreshAll().catch((e) => alert(e.message))
    const timer = setInterval(() => {
      refreshMarket().catch(() => {})
      refreshGuardrails().catch(() => {})
    }, 10000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    if (activeTradeId) refreshTimeline(activeTradeId).catch((e) => alert(e.message))
    else setTimeline([])
  }, [activeTradeId])

  return (
    <main className="wrap">
      <h1>BTC Decision App (React)</h1>

      <section className="card">
        <div className="row">
          <span className="pill">가격: {market?.price?.toLocaleString?.() ?? '-'}</span>
          <span className="pill">신호: {market?.signal ?? '-'} {market?.side ?? ''}</span>
          <span className="pill">RR: {market?.rr ?? '-'}</span>
          <span className="pill">source: {market?.source ?? '-'}</span>
          <button onClick={() => refreshMarket().catch((e) => alert(e.message))}>새로고침</button>
        </div>
        <p>근거: {market?.reason ?? '-'}</p>
      </section>

      <section className="card">
        <h3>리스크 가드레일</h3>
        {guardrails && (
          <>
            <p className={guardrails.blocked ? 'warn' : 'ok'}>
              {guardrails.blocked ? `진입 차단: ${guardrails.reasons.join(', ')}` : '진입 허용 상태'}
            </p>
            <p>OPEN {guardrails.openTrades} / 일손익 {guardrails.dayPnl} / 연속손실 {guardrails.consecutiveLosses}</p>
          </>
        )}
        <div className="row">
          <input value={risk.dailyLossLimit} onChange={(e) => setRisk((r) => ({ ...r, dailyLossLimit: e.target.value }))} />
          <input value={risk.maxConsecutiveLosses} onChange={(e) => setRisk((r) => ({ ...r, maxConsecutiveLosses: e.target.value }))} />
          <input value={risk.maxOpenTrades} onChange={(e) => setRisk((r) => ({ ...r, maxOpenTrades: e.target.value }))} />
          <button onClick={() => onSaveRisk().catch((e) => alert(e.message))}>리스크 저장</button>
        </div>
      </section>

      <section className="card">
        <h3>전략 프로필</h3>
        <div className="row">
          <select value={form.strategyId} onChange={(e) => setForm((f) => ({ ...f, strategyId: e.target.value }))}>
            <option value="">전략 선택(선택)</option>
            {strategies.map((s) => <option key={s.id} value={s.id}>{s.name} (minRR {s.min_rr})</option>)}
          </select>
          <input placeholder="새 전략 이름" value={newStrategy.name} onChange={(e) => setNewStrategy((s) => ({ ...s, name: e.target.value }))} />
          <input placeholder="최소 RR" value={newStrategy.minRR} onChange={(e) => setNewStrategy((s) => ({ ...s, minRR: e.target.value }))} />
          <button onClick={() => onAddStrategy().catch((e) => alert(e.message))}>전략 추가</button>
        </div>
      </section>

      <section className="card">
        <h3>포지션 시작</h3>
        <div className="row">
          <select value={form.side} onChange={(e) => setForm((f) => ({ ...f, side: e.target.value }))}><option>LONG</option><option>SHORT</option></select>
          <input placeholder="Entry" value={form.entry} onChange={(e) => setForm((f) => ({ ...f, entry: e.target.value }))} />
          <input placeholder="SL" value={form.sl} onChange={(e) => setForm((f) => ({ ...f, sl: e.target.value }))} />
          <input placeholder="TP" value={form.tp} onChange={(e) => setForm((f) => ({ ...f, tp: e.target.value }))} />
          <input placeholder="메모" value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
          <button onClick={() => onOpenTrade().catch((e) => alert(e.message))}>포지션 시작</button>
        </div>
      </section>

      <section className="card">
        <h3>포지션 운영</h3>
        <div className="row">
          <select value={activeTradeId} onChange={(e) => setActiveTradeId(e.target.value)}>
            <option value="">OPEN 포지션 선택</option>
            {openTrades.map((t) => <option key={t.id} value={t.id}>#{t.id} {t.side} {t.strategy_name || '-'}</option>)}
          </select>
          <button onClick={() => adjustSL('UP').catch((e) => alert(e.message))}>SL +50</button>
          <button onClick={() => adjustSL('DOWN').catch((e) => alert(e.message))}>SL -50</button>
          <button onClick={() => pushEvent('TAKE_PROFIT_PARTIAL', { note: '부분익절 25%', qtyPct: 25, price: market?.price || null }).catch((e) => alert(e.message))}>부분익절</button>
          <button onClick={() => closeTrade().catch((e) => alert(e.message))}>청산</button>
        </div>
      </section>

      <section className="card">
        <h3>타임라인</h3>
        <table>
          <thead><tr><th>시간</th><th>이벤트</th><th>메모</th><th>가격</th></tr></thead>
          <tbody>
            {timeline.map((e, idx) => (
              <tr key={`${e.event_time}-${idx}`}>
                <td>{new Date(e.event_time).toLocaleString()}</td>
                <td>{e.event_type}</td>
                <td>{e.note || ''}</td>
                <td>{e.price ? Number(e.price).toFixed(1) : '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="card">
        <h3>복기 지표</h3>
        <p>청산 거래 수: <b>{analytics?.closedTrades ?? 0}</b></p>
        <p>승률: <b>{analytics?.winRate ?? 0}%</b> / 평균손익: <b>{analytics?.avgPnl ?? 0}</b></p>
        <p>LONG 승률: <b>{analytics?.longWinRate ?? 0}%</b> / SHORT 승률: <b>{analytics?.shortWinRate ?? 0}%</b></p>
      </section>
    </main>
  )
}
