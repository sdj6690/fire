export default function GuardrailsCard({ guardrails, risk, setRisk, onSave }) {
  return (
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
        <button onClick={onSave}>리스크 저장</button>
      </div>
    </section>
  )
}
