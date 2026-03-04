export default function MarketCard({ market, onRefresh }) {
  return (
    <section className="card">
      <div className="row">
        <span className="pill">가격: {market?.price?.toLocaleString?.() ?? '-'}</span>
        <span className="pill">신호: {market?.signal ?? '-'} {market?.side ?? ''}</span>
        <span className="pill">RR: {market?.rr ?? '-'}</span>
        <span className="pill">source: {market?.source ?? '-'}</span>
        <button onClick={onRefresh}>새로고침</button>
      </div>
      <p>근거: {market?.reason ?? '-'}</p>
    </section>
  )
}
