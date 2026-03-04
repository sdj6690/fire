export function OpenTradeCard({ form, setForm, onOpenTrade }) {
  return (
    <section className="card">
      <h3>포지션 시작</h3>
      <div className="row">
        <select value={form.side} onChange={(e) => setForm((f) => ({ ...f, side: e.target.value }))}><option>LONG</option><option>SHORT</option></select>
        <input placeholder="Entry" value={form.entry} onChange={(e) => setForm((f) => ({ ...f, entry: e.target.value }))} />
        <input placeholder="SL" value={form.sl} onChange={(e) => setForm((f) => ({ ...f, sl: e.target.value }))} />
        <input placeholder="TP" value={form.tp} onChange={(e) => setForm((f) => ({ ...f, tp: e.target.value }))} />
        <input placeholder="메모" value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
        <button onClick={onOpenTrade}>포지션 시작</button>
      </div>
    </section>
  )
}

export function ManageTradeCard({ activeTradeId, setActiveTradeId, openTrades, onSLUp, onSLDown, onTakeProfit, onCloseTrade }) {
  return (
    <section className="card">
      <h3>포지션 운영</h3>
      <div className="row">
        <select value={activeTradeId} onChange={(e) => setActiveTradeId(e.target.value)}>
          <option value="">OPEN 포지션 선택</option>
          {openTrades.map((t) => <option key={t.id} value={t.id}>#{t.id} {t.side} {t.strategy_name || '-'}</option>)}
        </select>
        <button onClick={onSLUp}>SL +50</button>
        <button onClick={onSLDown}>SL -50</button>
        <button onClick={onTakeProfit}>부분익절</button>
        <button onClick={onCloseTrade}>청산</button>
      </div>
    </section>
  )
}

export function TimelineCard({ timeline }) {
  return (
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
  )
}

export function AnalyticsCard({ analytics }) {
  return (
    <section className="card">
      <h3>복기 지표</h3>
      <p>청산 거래 수: <b>{analytics?.closedTrades ?? 0}</b></p>
      <p>승률: <b>{analytics?.winRate ?? 0}%</b> / 평균손익: <b>{analytics?.avgPnl ?? 0}</b></p>
      <p>LONG 승률: <b>{analytics?.longWinRate ?? 0}%</b> / SHORT 승률: <b>{analytics?.shortWinRate ?? 0}%</b></p>
    </section>
  )
}
