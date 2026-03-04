let market = null;

async function jfetch(url, opts = {}) {
  const res = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...opts });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `http_${res.status}`);
  return data;
}

function el(id) { return document.getElementById(id); }

async function refreshMarket() {
  market = await jfetch('/api/market');
  el('price').textContent = `가격: ${market.price.toLocaleString()}`;
  el('signal').textContent = `신호: ${market.signal} ${market.side || ''}`;
  el('rr').textContent = `RR: ${market.rr ?? '-'}`;
  el('source').textContent = `source: ${market.source}`;
  el('reason').textContent = `근거: ${market.reason}`;
  el('box').textContent = `VAL ${market.boxLow.toFixed(0)} / MID ${market.mid.toFixed(0)} / VAH ${market.boxHigh.toFixed(0)}`;
}

async function refreshStrategies() {
  const strategies = await jfetch('/api/strategies');
  const sel = el('strategyId');
  sel.innerHTML = '';
  strategies.forEach((s) => {
    const op = document.createElement('option');
    op.value = s.id;
    op.textContent = `#${s.id} ${s.name} (minRR ${s.min_rr})`;
    sel.appendChild(op);
  });
}

async function refreshRiskConfig() {
  const cfg = await jfetch('/api/risk-config');
  el('dailyLossLimit').value = cfg.daily_loss_limit;
  el('maxConsecutiveLosses').value = cfg.max_consecutive_losses;
  el('maxOpenTrades').value = cfg.max_open_trades;
}

async function refreshGuardrails() {
  const g = await jfetch('/api/guardrails');
  const status = g.blocked
    ? `<p class="warn">진입 차단 중: ${g.reasons.join(', ')}</p>`
    : '<p class="ok">진입 허용 상태</p>';
  el('guardrails').innerHTML = `
    ${status}
    <p>OPEN 포지션: <b>${g.openTrades}</b> / 일손익: <b>${g.dayPnl}</b> / 연속손실: <b>${g.consecutiveLosses}</b></p>
  `;
}

function getSelectedTradeId() { return Number(el('activeTrade').value || 0); }

async function refreshTrades() {
  const trades = await jfetch('/api/trades');
  const sel = el('activeTrade');
  sel.innerHTML = '';
  const openTrades = trades.filter((t) => t.status === 'OPEN');
  if (!openTrades.length) {
    const op = document.createElement('option');
    op.value = '';
    op.textContent = 'OPEN 포지션 없음';
    sel.appendChild(op);
  } else {
    openTrades.forEach((t) => {
      const op = document.createElement('option');
      op.value = t.id;
      op.textContent = `#${t.id} ${t.side} ${t.strategy_name || '-'} entry:${Number(t.entry).toFixed(1)} sl:${Number(t.sl || 0).toFixed(1)}`;
      sel.appendChild(op);
    });
  }
  await refreshTimeline();
}

async function refreshTimeline() {
  const tradeId = getSelectedTradeId();
  const tb = el('timeline');
  tb.innerHTML = '';
  if (!tradeId) return;
  const events = await jfetch(`/api/trades/${tradeId}/timeline`);
  events.forEach((e) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${new Date(e.event_time).toLocaleString()}</td><td>${e.event_type}</td><td>${e.note || ''}</td><td>${e.price ? Number(e.price).toFixed(1) : '-'}</td>`;
    tb.appendChild(tr);
  });
}

async function refreshReview() {
  const a = await jfetch('/api/analytics');
  const tips = a.tips.map((t) => `<li>${t}</li>`).join('');
  el('review').innerHTML = `
    <p>청산 거래 수: <b>${a.closedTrades}</b></p>
    <p>승률: <b>${a.winRate}%</b> / 평균손익: <b>${a.avgPnl}</b></p>
    <p>LONG 승률: <b>${a.longWinRate}%</b> / SHORT 승률: <b>${a.shortWinRate}%</b></p>
    <ul>${tips}</ul>
  `;
}

async function openTrade() {
  const side = el('side').value;
  const entry = Number(el('entry').value || market?.price || 0);
  const sl = Number(el('sl').value || 0);
  const tp = Number(el('tp').value || 0);
  const notes = el('notes').value;
  const strategyId = Number(el('strategyId').value || 0) || null;
  await jfetch('/api/trades', {
    method: 'POST',
    body: JSON.stringify({ side, entry, sl: sl || null, tp: tp || null, notes, strategyId }),
  });
  await refreshTrades();
  await refreshGuardrails();
  await refreshReview();
}

async function pushEvent(eventType, patch = {}) {
  const tradeId = getSelectedTradeId();
  if (!tradeId) return alert('OPEN 포지션을 선택하세요.');
  await jfetch(`/api/trades/${tradeId}/events`, {
    method: 'POST',
    body: JSON.stringify({ eventType, ...patch }),
  });
  await refreshTrades();
}

async function slMove(direction) {
  const tradeId = getSelectedTradeId();
  if (!tradeId) return alert('OPEN 포지션을 선택하세요.');
  const trades = await jfetch('/api/trades');
  const t = trades.find((x) => x.id === tradeId);
  if (!t) return;
  const oldSL = Number(t.sl || 0);
  const newSL = oldSL + (direction === 'UP' ? 50 : -50);
  await pushEvent(direction === 'UP' ? 'SL_UP' : 'SL_DOWN', {
    note: direction === 'UP' ? 'SL 상향 조정' : 'SL 하향 조정',
    oldSL,
    newSL,
    price: market?.price || null,
  });
}

async function closeTrade() {
  const tradeId = getSelectedTradeId();
  if (!tradeId) return alert('OPEN 포지션을 선택하세요.');
  const price = market?.price;
  if (!price) return;
  const res = await jfetch(`/api/trades/${tradeId}/close`, {
    method: 'POST',
    body: JSON.stringify({ price }),
  });
  alert(`청산 완료. PnL=${res.pnl}`);
  await refreshTrades();
  await refreshGuardrails();
  await refreshReview();
}

async function saveRiskConfig() {
  await jfetch('/api/risk-config', {
    method: 'POST',
    body: JSON.stringify({
      dailyLossLimit: Number(el('dailyLossLimit').value || 500),
      maxConsecutiveLosses: Number(el('maxConsecutiveLosses').value || 3),
      maxOpenTrades: Number(el('maxOpenTrades').value || 1),
    }),
  });
  await refreshGuardrails();
  alert('리스크 설정 저장 완료');
}

async function addStrategy() {
  const name = el('newStrategyName').value.trim();
  const minRR = Number(el('newStrategyRR').value || 1.5);
  if (!name) return alert('전략 이름을 입력하세요.');
  await jfetch('/api/strategies', {
    method: 'POST',
    body: JSON.stringify({ name, minRR, description: '' }),
  });
  el('newStrategyName').value = '';
  el('newStrategyRR').value = '';
  await refreshStrategies();
}

window.addEventListener('DOMContentLoaded', async () => {
  el('refresh').onclick = async () => { try { await refreshMarket(); } catch (e) { alert(e.message); } };
  el('openTrade').onclick = async () => { try { await openTrade(); } catch (e) { alert(e.message); } };
  el('slUp').onclick = async () => { try { await slMove('UP'); } catch (e) { alert(e.message); } };
  el('slDown').onclick = async () => { try { await slMove('DOWN'); } catch (e) { alert(e.message); } };
  el('takeProfit').onclick = async () => {
    try {
      await pushEvent('TAKE_PROFIT_PARTIAL', { note: '부분익절 25%', price: market?.price || null, qtyPct: 25 });
    } catch (e) { alert(e.message); }
  };
  el('closeTrade').onclick = async () => { try { await closeTrade(); } catch (e) { alert(e.message); } };
  el('activeTrade').onchange = async () => { await refreshTimeline(); };
  el('saveRisk').onclick = async () => { try { await saveRiskConfig(); } catch (e) { alert(e.message); } };
  el('addStrategy').onclick = async () => { try { await addStrategy(); } catch (e) { alert(e.message); } };

  try {
    await refreshMarket();
    await refreshStrategies();
    await refreshRiskConfig();
    await refreshGuardrails();
    await refreshTrades();
    await refreshReview();
  } catch (e) {
    alert(e.message);
  }

  setInterval(async () => {
    try {
      await refreshMarket();
      await refreshGuardrails();
    } catch (_) {}
  }, 10000);
});
