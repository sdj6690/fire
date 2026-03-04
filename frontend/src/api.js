export async function jfetch(url, opts = {}) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `http_${res.status}`)
  return data
}

export const api = {
  market: () => jfetch('/api/market'),
  strategies: () => jfetch('/api/strategies'),
  riskConfig: () => jfetch('/api/risk-config'),
  guardrails: () => jfetch('/api/guardrails'),
  trades: () => jfetch('/api/trades'),
  timeline: (tradeId) => jfetch(`/api/trades/${tradeId}/timeline`),
  analytics: () => jfetch('/api/analytics'),
  openTrade: (payload) => jfetch('/api/trades', { method: 'POST', body: JSON.stringify(payload) }),
  addStrategy: (payload) => jfetch('/api/strategies', { method: 'POST', body: JSON.stringify(payload) }),
  saveRisk: (payload) => jfetch('/api/risk-config', { method: 'POST', body: JSON.stringify(payload) }),
  tradeEvent: (tradeId, payload) => jfetch(`/api/trades/${tradeId}/events`, { method: 'POST', body: JSON.stringify(payload) }),
  closeTrade: (tradeId, price) => jfetch(`/api/trades/${tradeId}/close`, { method: 'POST', body: JSON.stringify({ price }) }),
}
