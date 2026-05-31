import { useEffect, useState, type CSSProperties } from 'react'
import { useNavigate } from 'react-router-dom'
import { useIsMobile } from '../../hooks/useIsMobile'
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { forecastApi, inventoryApi, sopApi, type PortfolioItem, type InventoryHealthData, type InventorySKU } from '../../services/api'

function greeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

function currentSopWeek(): string {
  const today = new Date()
  const startOf2024 = new Date('2024-01-01')
  const weekNum = Math.ceil((today.getTime() - startOf2024.getTime()) / (7 * 24 * 60 * 60 * 1000))
  return `S&OP Week ${(weekNum % 52) + 1}`
}

const card: CSSProperties = {
  backgroundColor: '#ffffff',
  border: '1px solid #e2e8f0',
  borderRadius: '16px',
  boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
}

interface KPICardProps {
  label: string
  value: string | number
  sub: string
  color: string
  loading?: boolean
  compact?: boolean
}

function KPICard({ label, value, sub, color, loading, compact }: KPICardProps) {
  const p = compact ? '14px' : '24px'
  const vSize = compact ? '36px' : '48px'
  if (loading) {
    return (
      <div style={{ ...card, padding: p, height: compact ? '100px' : '130px' }}>
        <div className="animate-pulse bg-slate-100 rounded-lg" style={{ height: '100%' }} />
      </div>
    )
  }
  return (
    <div style={{ ...card, padding: p }}>
      <p style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#94a3b8' }}>{label}</p>
      <p style={{ fontSize: vSize, fontWeight: 700, lineHeight: 1, marginTop: '8px', marginBottom: '8px', color }}>{value}</p>
      <p style={{ fontSize: '12px', color: '#94a3b8' }}>{sub}</p>
    </div>
  )
}

interface Alert {
  type: 'stockout' | 'expiry' | 'signal'
  sku: string
  message: string
  severity: 'critical' | 'warning' | 'info'
  time: string
}

function AlertFeed({ alerts, loading }: { alerts: Alert[]; loading: boolean }) {
  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {[1, 2, 3].map((i) => (
          <div key={i} className="animate-pulse bg-slate-100 rounded-xl" style={{ height: 56 }} />
        ))}
      </div>
    )
  }

  if (alerts.length === 0) {
    return <p style={{ fontSize: '13px', color: '#94a3b8' }}>No active alerts</p>
  }

  return (
    <div>
      {alerts.map((a, i) => (
        <div
          key={i}
          style={{
            display: 'flex', alignItems: 'flex-start', gap: '12px',
            padding: '12px 0',
            borderBottom: i < alerts.length - 1 ? '1px solid #f1f5f9' : 'none',
          }}
        >
          {/* Colored dot */}
          <div style={{
            width: 8, height: 8, borderRadius: '50%', marginTop: 5, flexShrink: 0,
            backgroundColor: a.severity === 'critical' ? '#ef4444' : a.severity === 'warning' ? '#f59e0b' : '#3b82f6',
          }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: '13px', fontWeight: 600, color: '#0f172a', marginBottom: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {a.sku}
            </p>
            <p style={{ fontSize: '12px', color: '#64748b' }}>{a.message}</p>
          </div>
          <span style={{
            flexShrink: 0, fontSize: '10px', fontWeight: 700,
            padding: '3px 10px', borderRadius: '999px', textTransform: 'uppercase', letterSpacing: '0.04em',
            backgroundColor: a.severity === 'critical' ? 'rgba(239,68,68,0.10)' : a.severity === 'warning' ? 'rgba(245,158,11,0.10)' : 'rgba(59,130,246,0.10)',
            color: a.severity === 'critical' ? '#ef4444' : a.severity === 'warning' ? '#f59e0b' : '#3b82f6',
          }}>
            {a.severity}
          </span>
        </div>
      ))}
    </div>
  )
}

export default function Dashboard() {
  const navigate = useNavigate()
  const isMobile = useIsMobile()
  const userName = localStorage.getItem('pulsechain_user_name') || 'User'
  const [health, setHealth] = useState<InventoryHealthData | null>(null)
  const [inventory, setInventory] = useState<InventorySKU[]>([])
  const [portfolio, setPortfolio] = useState<PortfolioItem[]>([])
  const [daysUntilSop, setDaysUntilSop] = useState<number>(7)
  const [chartData, setChartData] = useState<{ date: string; actual: number; forecast: number }[]>([])
  const [loading, setLoading] = useState({ kpi: true, chart: true, alerts: true })
  const [topSku, setTopSku] = useState<string>('')

  useEffect(() => {
    inventoryApi.getHealth()
      .then((r) => setHealth(r.data))
      .finally(() => setLoading((p) => ({ ...p, kpi: false })))

    inventoryApi.listSKUs()
      .then((r) => setInventory(r.data))
      .finally(() => setLoading((p) => ({ ...p, alerts: false })))

    forecastApi.getPortfolio()
      .then((r) => {
        setPortfolio(r.data)
        if (r.data.length > 0) {
          const first = r.data[0]
          setTopSku(first.name)
          return forecastApi.getLatest(first.id, 'ensemble', 30)
        }
      })
      .then((r) => {
        if (!r) return
        const combined = [
          ...r.data.historical.slice(-30).map((p) => ({ date: p.date, actual: p.actual, forecast: 0 })),
          ...r.data.forecast.slice(0, 14).map((p) => ({ date: p.date, actual: 0, forecast: p.forecast })),
        ]
        setChartData(combined)
      })
      .finally(() => setLoading((p) => ({ ...p, chart: false })))

    sopApi.getCalendar()
      .then((r) => {
        const active = r.data.find((e) => e.status === 'active')
        if (active) {
          const end = new Date(active.week_end)
          const diff = Math.ceil((end.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
          setDaysUntilSop(Math.max(0, diff))
        }
      })
      .catch(() => {})
  }, [])

  const avgMape = portfolio.length > 0
    ? (portfolio.reduce((s, p) => s + (p.mape ?? 15), 0) / portfolio.length).toFixed(1)
    : null

  const alerts: Alert[] = inventory
    .filter((s) => s.status !== 'HEALTHY')
    .slice(0, 5)
    .map((s) => ({
      type: s.status === 'CRITICAL' ? 'stockout' : 'expiry',
      sku: s.sku_name,
      message: s.status === 'CRITICAL'
        ? `${s.dos.toFixed(0)} days of stock — critical level`
        : `${s.dos.toFixed(0)} days of stock — at risk`,
      severity: s.status === 'CRITICAL' ? 'critical' : 'warning',
      time: 'now',
    } as Alert))

  const today = new Date()

  const quickActions = [
    { label: 'Run Forecast', icon: '📈', path: '/forecast', color: '#00D4B4' },
    { label: 'View Inventory', icon: '📦', path: '/inventory', color: '#FF6B35' },
    { label: 'Check Signals', icon: '📡', path: '/pharma-pulse', color: '#a78bfa' },
    { label: 'Export Report', icon: '⬇', path: '/sop', color: '#60a5fa' },
  ]

  return (
    <div style={{ background: '#f8fafc', minHeight: '100%', padding: '24px' }}>

      {/* Welcome banner — no card wrapper */}
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: isMobile ? '20px' : '28px', fontWeight: 700, color: '#0f172a', margin: 0 }}>
          {greeting()}, {userName} 👋
        </h1>
        <p style={{ fontSize: '14px', color: '#64748b', marginTop: '6px' }}>
          {today.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          {' · '}{currentSopWeek()}
          {' · '}{portfolio.length || 8} SKUs tracked
        </p>
      </div>

      {/* KPI row */}
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${isMobile ? 2 : 4}, 1fr)`, gap: isMobile ? '12px' : '20px', marginBottom: isMobile ? '12px' : '20px' }}>
        <KPICard
          label="Portfolio Forecast Accuracy"
          value={avgMape != null ? `${avgMape}%` : '—'}
          sub="Avg MAPE across all SKUs"
          color="#00D4B4"
          loading={loading.kpi}
          compact={isMobile}
        />
        <KPICard
          label="Stockout Risk"
          value={health?.stockout_risk_count ?? '—'}
          sub="SKUs at critical stock level"
          color="#ef4444"
          loading={loading.kpi}
          compact={isMobile}
        />
        <KPICard
          label="Demand Signals"
          value={health?.total_skus ?? '—'}
          sub="PharmaPulse monitored SKUs"
          color="#a78bfa"
          loading={loading.kpi}
          compact={isMobile}
        />
        <KPICard
          label="Days Until S&OP"
          value={daysUntilSop}
          sub="Next consensus meeting"
          color="#FF6B35"
          loading={loading.kpi}
          compact={isMobile}
        />
      </div>

      {/* Chart + Alerts */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: isMobile ? '12px' : '20px', marginBottom: isMobile ? '12px' : '20px' }}>
        {/* Mini chart */}
        <div style={{ ...card, padding: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '16px' }}>
            <div>
              <p style={{ fontSize: '15px', fontWeight: 600, color: '#0f172a', marginBottom: '4px' }}>
                {topSku ? topSku.split(' (')[0] : 'Top SKU'} — Forecast vs Actuals
              </p>
              <p style={{ fontSize: '12px', color: '#94a3b8' }}>Last 30 days + 14-day outlook</p>
            </div>
            <button
              onClick={() => navigate('/forecast')}
              style={{ fontSize: '13px', fontWeight: 500, color: '#00D4B4', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
            >
              Full forecast →
            </button>
          </div>
          {loading.chart ? (
            <div className="animate-pulse bg-slate-100 rounded-xl" style={{ height: 220 }} />
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={chartData} margin={{ left: 0, right: 8, top: 4, bottom: 4 }}>
                <defs>
                  <linearGradient id="gradActual" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#00D4B4" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#00D4B4" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gradForecast" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#FF6B35" stopOpacity={0.20} />
                    <stop offset="95%" stopColor="#FF6B35" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="date" tick={{ fill: '#94a3b8', fontSize: 10 }} axisLine={false} tickLine={false} interval={6} />
                <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} axisLine={false} tickLine={false} width={40} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}
                  labelStyle={{ color: '#0f172a', fontWeight: 600 }}
                />
                <Area type="monotone" dataKey="actual" stroke="#00D4B4" fill="url(#gradActual)" strokeWidth={2} dot={false} name="Actual" />
                <Area type="monotone" dataKey="forecast" stroke="#FF6B35" fill="url(#gradForecast)" strokeWidth={2} dot={false} name="Forecast" strokeDasharray="4 2" />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Alerts */}
        <div style={{ ...card, padding: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
            <p style={{ fontSize: '15px', fontWeight: 600, color: '#0f172a' }}>Recent Alerts</p>
            <button
              onClick={() => navigate('/inventory')}
              style={{ fontSize: '13px', fontWeight: 500, color: '#00D4B4', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
            >
              View all →
            </button>
          </div>
          <AlertFeed alerts={alerts} loading={loading.alerts} />
        </div>
      </div>

      {/* Quick actions */}
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${isMobile ? 2 : 4}, 1fr)`, gap: '12px' }}>
        {quickActions.map((action) => (
          <button
            key={action.path}
            onClick={() => navigate(action.path)}
            style={{
              display: 'flex', alignItems: 'center', gap: '12px',
              padding: isMobile ? '12px 14px' : '16px 20px', background: '#fff',
              border: '1px solid #e2e8f0', borderRadius: '12px',
              cursor: 'pointer', transition: 'all 0.15s',
              boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
            }}
            onMouseEnter={(e) => {
              const el = e.currentTarget as HTMLButtonElement
              el.style.borderColor = '#00D4B4'
              el.style.boxShadow = '0 2px 8px rgba(0,212,180,0.12)'
            }}
            onMouseLeave={(e) => {
              const el = e.currentTarget as HTMLButtonElement
              el.style.borderColor = '#e2e8f0'
              el.style.boxShadow = '0 1px 2px rgba(0,0,0,0.05)'
            }}
          >
            <span style={{ fontSize: '22px' }}>{action.icon}</span>
            <span style={{ fontSize: '13px', fontWeight: 600, color: '#0f172a' }}>{action.label}</span>
          </button>
        ))}
      </div>

    </div>
  )
}
