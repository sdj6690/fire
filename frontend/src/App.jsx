import { useEffect, useMemo, useState } from 'react'
import { api } from './api'
import MarketCard from './components/MarketCard'
import GuardrailsCard from './components/GuardrailsCard'
import StrategyCard from './components/StrategyCard'
import { OpenTradeCard, ManageTradeCard, TimelineCard, AnalyticsCard } from './components/TradeCards'

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

  const refreshMarket = async () => setMarket(await api.market())
  const refreshStrategies = async () => setStrategies(await api.strategies())
  const refreshGuardrails = async () => setGuardrails(await api.guardrails())
  const refreshTrades = async () => setTrades(await api.trades())
  const refreshAnalytics = async () => setAnalytics(await api.analytics())
  const refreshRisk = async () => {
    const cfg = await api.riskConfig()
    setRisk({
      dailyLossLimit: cfg.daily_loss_limit,
      maxConsecutiveLosses: cfg.max_consecutive_losses,
      maxOpenTrades: cfg.max_open_trades,
    })
  }
  const refreshTimeline = async (tradeId) => {
    if (!tradeId) return setTimeline([])
    setTimeline(await api.timeline(tradeId))
  }

  const refreshAll = async () => {
    await Promise.all([
      refreshMarket(),
      refreshStrategies(),
      refreshRisk(),
      refreshGuardrails(),
      refreshTrades(),
      refreshAnalytics(),
    ])
  }

  const onOpenTrade = async () => {
    await api.openTrade({
      side: form.side,
      entry: Number(form.entry || market?.price || 0),
      sl: form.sl ? Number(form.sl) : null,
      tp: form.tp ? Number(form.tp) : null,
      notes: form.notes,
      strategyId: form.strategyId ? Number(form.strategyId) : null,
    })
    setForm((f) => ({ ...f, entry: '', sl: '', tp: '', notes: '' }))
    await refreshTrades()
    await refreshGuardrails()
    await refreshAnalytics()
  }

  const onAddStrategy = async () => {
    await api.addStrategy({
      name: newStrategy.name,
      minRR: Number(newStrategy.minRR || 1.5),
      description: '',
    })
    setNewStrategy({ name: '', minRR: '' })
    await refreshStrategies()
  }

  const onSaveRisk = async () => {
    await api.saveRisk({
      dailyLossLimit: Number(risk.dailyLossLimit),
      maxConsecutiveLosses: Number(risk.maxConsecutiveLosses),
      maxOpenTrades: Number(risk.maxOpenTrades),
    })
    await refreshGuardrails()
  }

  const pushEvent = async (eventType, extra = {}) => {
    if (!activeTradeId) return
    await api.tradeEvent(activeTradeId, { eventType, ...extra })
    await refreshTrades()
    await refreshTimeline(activeTradeId)
  }

  const adjustSL = async (direction) => {
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

  const closeTrade = async () => {
    if (!activeTradeId) return
    const price = Number(market?.price || 0)
    if (!price) return
    await api.closeTrade(activeTradeId, price)
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
      <MarketCard market={market} onRefresh={() => refreshMarket().catch((e) => alert(e.message))} />
      <GuardrailsCard guardrails={guardrails} risk={risk} setRisk={setRisk} onSave={() => onSaveRisk().catch((e) => alert(e.message))} />
      <StrategyCard
        strategies={strategies}
        form={form}
        setForm={setForm}
        newStrategy={newStrategy}
        setNewStrategy={setNewStrategy}
        onAddStrategy={() => onAddStrategy().catch((e) => alert(e.message))}
      />
      <OpenTradeCard form={form} setForm={setForm} onOpenTrade={() => onOpenTrade().catch((e) => alert(e.message))} />
      <ManageTradeCard
        activeTradeId={activeTradeId}
        setActiveTradeId={setActiveTradeId}
        openTrades={openTrades}
        onSLUp={() => adjustSL('UP').catch((e) => alert(e.message))}
        onSLDown={() => adjustSL('DOWN').catch((e) => alert(e.message))}
        onTakeProfit={() => pushEvent('TAKE_PROFIT_PARTIAL', { note: '부분익절 25%', qtyPct: 25, price: market?.price || null }).catch((e) => alert(e.message))}
        onCloseTrade={() => closeTrade().catch((e) => alert(e.message))}
      />
      <TimelineCard timeline={timeline} />
      <AnalyticsCard analytics={analytics} />
    </main>
  )
}
