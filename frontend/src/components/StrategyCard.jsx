export default function StrategyCard({ strategies, form, setForm, newStrategy, setNewStrategy, onAddStrategy }) {
  return (
    <section className="card">
      <h3>전략 프로필</h3>
      <div className="row">
        <select value={form.strategyId} onChange={(e) => setForm((f) => ({ ...f, strategyId: e.target.value }))}>
          <option value="">전략 선택(선택)</option>
          {strategies.map((s) => <option key={s.id} value={s.id}>{s.name} (minRR {s.min_rr})</option>)}
        </select>
        <input placeholder="새 전략 이름" value={newStrategy.name} onChange={(e) => setNewStrategy((s) => ({ ...s, name: e.target.value }))} />
        <input placeholder="최소 RR" value={newStrategy.minRR} onChange={(e) => setNewStrategy((s) => ({ ...s, minRR: e.target.value }))} />
        <button onClick={onAddStrategy}>전략 추가</button>
      </div>
    </section>
  )
}
