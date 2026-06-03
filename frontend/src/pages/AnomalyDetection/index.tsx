import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import {
  Area,
  ComposedChart,
  CartesianGrid,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  anomalyApi,
  forecastApi,
  type AnomalyPoint,
  type AnomalySummary,
  type TimelinePoint,
  type TrendBreak,
  type SKUResponse,
} from '../../services/api'
import { useIsMobile } from '../../hooks/useIsMobile'

// ------------------------------------------------------------------ //
// Design tokens                                                        //
// ------------------------------------------------------------------ //

const card: CSSProperties = {
  backgroundColor: '#ffffff',
  border: '1px solid #e2e8f0',
  borderRadius: '16px',
  boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
}

const labelStyle: CSSProperties = {
  fontSize: '11px', fontWeight: 600, textTransform: 'uppercase',
  letterSpacing: '0.08em', color: '#94a3b8',
}

type TimeRange = '6M' | '1Y' | '2Y' | 'ALL'

// ------------------------------------------------------------------ //
// Helpers                                                             //
// ------------------------------------------------------------------ //

function fmtDate(s: string): string {
  const d = new Date(s)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })
}

function fmtNum(n: number | null | undefined, dec = 1): string {
  if (n == null) return '—'
  return n.toFixed(dec)
}

function severityColor(s: number): string {
  const abs = Math.abs(s)
  if (abs >= 4) return '#ef4444'
  if (abs >= 2) return '#f59e0b'
  return '#10b981'
}

function filterByRange(points: TimelinePoint[], range: TimeRange): TimelinePoint[] {
  if (range === 'ALL' || !points.length) return points
  const last = new Date(points[points.length - 1].date)
  const days: Record<string, number> = { '6M': 180, '1Y': 365, '2Y': 730 }
  const cutoff = new Date(last.getTime() - days[range] * 86_400_000)
  return points.filter(p => new Date(p.date) >= cutoff)
}

// ------------------------------------------------------------------ //
// Summary cards                                                        //
// ------------------------------------------------------------------ //

interface SummaryCardProps {
  label: string
  value: string | number
  color: string
  pulse?: boolean
  loading?: boolean
}

function SummaryCard({ label, value, color, pulse, loading }: SummaryCardProps) {
  if (loading) {
    return (
      <div style={{ ...card, padding: '20px' }}>
        <div className="animate-pulse bg-slate-100 rounded-lg" style={{ height: 80 }} />
      </div>
    )
  }
  return (
    <div style={{ ...card, padding: '20px' }}>
      <p style={labelStyle}>{label}</p>
      <p style={{
        fontSize: '44px', fontWeight: 700, lineHeight: 1, marginTop: '8px', color,
        ...(pulse ? { animation: 'pulse 1.5s infinite' } : {}),
      }}>
        {value}
      </p>
    </div>
  )
}

// ------------------------------------------------------------------ //
// Timeline chart tooltip                                               //
// ------------------------------------------------------------------ //

interface TooltipPayload {
  name: string
  value: number | null
  color: string
  payload: TimelinePoint
}

function ChartTooltip({ active, payload, label }: {
  active?: boolean
  payload?: TooltipPayload[]
  label?: string
}) {
  if (!active || !payload?.length || !label) return null
  const point = payload[0]?.payload as TimelinePoint | undefined
  return (
    <div style={{
      background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10,
      padding: '10px 14px', fontSize: 11, boxShadow: '0 4px 12px rgba(0,0,0,0.10)',
      maxWidth: 260,
    }}>
      <p style={{ fontWeight: 700, color: '#0f172a', marginBottom: 6 }}>{fmtDate(label)}</p>
      {payload.filter(p => p.value != null && p.name !== 'lower_bound' && p.name !== 'band').map(p => (
        <p key={p.name} style={{ color: p.color, margin: '2px 0' }}>
          {p.name === 'actual' ? 'Actual' : p.name === 'rolling_mean' ? 'Expected' : p.name}:{' '}
          <span style={{ fontWeight: 600 }}>{fmtNum(p.value, 2)}</span>
        </p>
      ))}
      {point?.is_anomaly && (
        <div style={{
          marginTop: 8, padding: '6px 8px', borderRadius: 6,
          backgroundColor: point.anomaly_type === 'DEMAND_SPIKE'
            ? 'rgba(255,107,53,0.10)' : 'rgba(239,68,68,0.10)',
          borderLeft: `3px solid ${point.anomaly_type === 'DEMAND_SPIKE' ? '#FF6B35' : '#ef4444'}`,
        }}>
          <p style={{ fontWeight: 700, color: point.anomaly_type === 'DEMAND_SPIKE' ? '#FF6B35' : '#ef4444', marginBottom: 2 }}>
            {point.anomaly_type === 'DEMAND_SPIKE' ? '↑ DEMAND SPIKE' : '↓ DEMAND DROP'}
          </p>
          <p style={{ color: '#64748b' }}>
            {fmtNum(point.upper_bound != null && point.rolling_mean != null
              ? (point.actual - point.rolling_mean) / (point.upper_bound - point.rolling_mean) * 100 : null, 0)}% above normal range
          </p>
        </div>
      )}
    </div>
  )
}

// ------------------------------------------------------------------ //
// Timeline chart                                                       //
// ------------------------------------------------------------------ //

interface TimelineChartProps {
  skus: SKUResponse[]
  selectedSkuId: number | null
  onSelectSku: (id: number) => void
}

function TimelineChart({ skus, selectedSkuId, onSelectSku }: TimelineChartProps) {
  const isMobile = useIsMobile()
  const [timeline, setTimeline] = useState<TimelinePoint[]>([])
  const [loading, setLoading] = useState(false)
  const [timeRange, setTimeRange] = useState<TimeRange>('1Y')

  useEffect(() => {
    if (!selectedSkuId) return
    setLoading(true)
    setTimeline([])
    anomalyApi.getTimeline(selectedSkuId)
      .then(r => setTimeline(r.data))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [selectedSkuId])

  const filtered = useMemo(() => filterByRange(timeline, timeRange), [timeline, timeRange])
  const selectedSku = skus.find(s => s.id === selectedSkuId)
  const chartH = isMobile ? 240 : 320

  const tabActive: CSSProperties = { backgroundColor: '#00D4B4', color: '#fff', fontWeight: 600, padding: '5px 12px', borderRadius: 7, border: 'none', cursor: 'pointer', fontSize: 12 }
  const tabInactive: CSSProperties = { backgroundColor: '#f1f5f9', color: '#64748b', fontWeight: 500, padding: '5px 12px', borderRadius: 7, border: 'none', cursor: 'pointer', fontSize: 12 }

  return (
    <div style={{ ...card, padding: 24, marginBottom: 20 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h3 style={{ fontSize: 16, fontWeight: 600, color: '#0f172a', margin: 0 }}>
            Demand Anomaly Detection — {selectedSku ? selectedSku.name.split(' (')[0] : '…'}
          </h3>
          <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>
            Rolling 28-point mean ± 3σ / 2σ confidence band
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          {/* SKU selector */}
          <select
            value={selectedSkuId ?? ''}
            onChange={e => onSelectSku(Number(e.target.value))}
            style={{
              border: '1px solid #e2e8f0', borderRadius: 10, padding: '7px 12px',
              fontSize: 13, color: '#0f172a', background: '#fff', outline: 'none', cursor: 'pointer',
            }}
          >
            {skus.map(s => (
              <option key={s.id} value={s.id}>{s.name.split(' (')[0]} ({s.atc_code})</option>
            ))}
          </select>
          {/* Time range */}
          <div style={{ display: 'flex', gap: 4 }}>
            {(['6M', '1Y', '2Y', 'ALL'] as TimeRange[]).map(r => (
              <button key={r} onClick={() => setTimeRange(r)} style={timeRange === r ? tabActive : tabInactive}>{r}</button>
            ))}
          </div>
        </div>
      </div>

      {/* Chart */}
      {loading ? (
        <div className="animate-pulse bg-slate-100 rounded-xl" style={{ height: chartH }} />
      ) : filtered.length === 0 ? (
        <div style={{ height: chartH, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <p style={{ color: '#94a3b8', fontSize: 14 }}>Select a product to load the anomaly timeline</p>
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={chartH}>
          <ComposedChart data={filtered} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis
              dataKey="date"
              tickFormatter={fmtDate}
              tick={{ fontSize: 10, fill: '#94a3b8' }}
              tickLine={false}
              axisLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              tick={{ fontSize: 10, fill: '#94a3b8' }}
              tickLine={false}
              axisLine={false}
              width={44}
            />
            <Tooltip content={<ChartTooltip />} />

            {/* Confidence band: lower baseline (transparent) + band on top */}
            <Area
              dataKey="lower_bound"
              stroke="none"
              fill="transparent"
              stackId="band"
              isAnimationActive={false}
              legendType="none"
            />
            <Area
              dataKey="band"
              stroke="none"
              fill="rgba(239,68,68,0.07)"
              stackId="band"
              isAnimationActive={false}
              name="Normal range"
            />

            {/* Rolling mean */}
            <Line
              dataKey="rolling_mean"
              stroke="#94a3b8"
              strokeWidth={1.5}
              strokeDasharray="5 3"
              dot={false}
              name="rolling_mean"
              isAnimationActive={false}
            />

            {/* Actual values with anomaly dots */}
            <Line
              dataKey="actual"
              stroke="#00D4B4"
              strokeWidth={1.5}
              name="actual"
              isAnimationActive={false}
              dot={(props: { cx: number; cy: number; index: number; payload: TimelinePoint }) => {
                const { cx, cy, payload, index } = props
                if (!payload.is_anomaly) return <g key={index} />
                const color = payload.anomaly_type === 'DEMAND_SPIKE' ? '#FF6B35' : '#ef4444'
                return (
                  <circle
                    key={index}
                    cx={cx}
                    cy={cy}
                    r={5}
                    fill={color}
                    stroke="white"
                    strokeWidth={1.5}
                  />
                )
              }}
              activeDot={{ r: 4, fill: '#00D4B4' }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      )}

      {/* Legend */}
      <div style={{ display: 'flex', gap: 20, marginTop: 12, paddingTop: 12, borderTop: '1px solid #f1f5f9', flexWrap: 'wrap' }}>
        {[
          { color: '#00D4B4', dash: false, label: 'Actual demand' },
          { color: '#94a3b8', dash: true, label: 'Rolling mean' },
          { color: 'rgba(239,68,68,0.25)', area: true, label: 'Normal range' },
          { color: '#FF6B35', dot: true, label: 'Demand spike' },
          { color: '#ef4444', dot: true, label: 'Demand drop' },
        ].map(l => (
          <span key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#64748b' }}>
            {l.area ? (
              <span style={{ width: 16, height: 10, background: l.color, borderRadius: 2, display: 'inline-block' }} />
            ) : l.dot ? (
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: l.color, display: 'inline-block' }} />
            ) : (
              <span style={{ width: 20, height: 2, display: 'inline-block', borderRadius: 1, background: l.dash ? `repeating-linear-gradient(to right, ${l.color} 0, ${l.color} 5px, transparent 5px, transparent 8px)` : l.color }} />
            )}
            {l.label}
          </span>
        ))}
      </div>
    </div>
  )
}

// ------------------------------------------------------------------ //
// Anomaly table                                                        //
// ------------------------------------------------------------------ //

interface AnomalyTableProps {
  skus: SKUResponse[]
}

function AnomalyTable({ skus }: AnomalyTableProps) {
  const [anomalies, setAnomalies] = useState<AnomalyPoint[]>([])
  const [loading, setLoading] = useState(true)
  const [filterSkuId, setFilterSkuId] = useState<number | 'all'>('all')
  const [visible, setVisible] = useState(15)

  useEffect(() => {
    anomalyApi.getPortfolio(9999)
      .then(r => setAnomalies(r.data.sort((a, b) => b.date.localeCompare(a.date))))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  const filtered = filterSkuId === 'all'
    ? anomalies
    : anomalies.filter(a => a.sku_id === filterSkuId)

  const th: CSSProperties = {
    padding: '10px 12px', textAlign: 'left', fontSize: '10px', fontWeight: 600,
    textTransform: 'uppercase', letterSpacing: '0.06em', color: '#94a3b8',
    background: '#f8fafc', borderBottom: '1px solid #e2e8f0', whiteSpace: 'nowrap',
  }

  return (
    <div style={{ ...card, flex: 3, minWidth: 0, padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h3 style={{ fontSize: 16, fontWeight: 600, color: '#0f172a', margin: 0 }}>Detected Anomalies</h3>
          <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>Portfolio-wide — most recent first</p>
        </div>
        <select
          value={filterSkuId}
          onChange={e => { setFilterSkuId(e.target.value === 'all' ? 'all' : Number(e.target.value)); setVisible(15) }}
          style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: '6px 10px', fontSize: 12, color: '#0f172a', background: '#fff', outline: 'none' }}
        >
          <option value="all">All SKUs</option>
          {skus.map(s => <option key={s.id} value={s.id}>{s.name.split(' (')[0]}</option>)}
        </select>
      </div>

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="animate-pulse bg-slate-100 rounded" style={{ height: 40 }} />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <p style={{ fontSize: 13, color: '#94a3b8', textAlign: 'center', padding: '20px 0' }}>No anomalies found</p>
      ) : (
        <>
          <div style={{ overflowX: 'auto', borderRadius: 10, border: '1px solid #e2e8f0' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr>
                  <th style={th}>Date</th>
                  <th style={th}>Product</th>
                  <th style={th}>Type</th>
                  <th style={{ ...th, textAlign: 'right' }}>Actual</th>
                  <th style={{ ...th, textAlign: 'right' }}>Expected</th>
                  <th style={{ ...th, textAlign: 'right' }}>Dev %</th>
                  <th style={{ ...th, textAlign: 'right' }}>Severity</th>
                  <th style={th}>Cause</th>
                </tr>
              </thead>
              <tbody>
                {filtered.slice(0, visible).map((a, i) => (
                  <tr
                    key={`${a.date}-${a.sku_id}-${i}`}
                    style={{ borderTop: '1px solid #f1f5f9', backgroundColor: i % 2 === 0 ? '#fff' : '#fafafa' }}
                  >
                    <td style={{ padding: '10px 12px', color: '#64748b', whiteSpace: 'nowrap' }}>{fmtDate(a.date)}</td>
                    <td style={{ padding: '10px 12px', fontWeight: 500, color: '#0f172a', whiteSpace: 'nowrap' }}>
                      {a.sku_name ? a.sku_name.split(' (')[0] : '—'}
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      <span style={{
                        fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 999, whiteSpace: 'nowrap',
                        backgroundColor: a.type === 'DEMAND_SPIKE' ? 'rgba(255,107,53,0.12)' : 'rgba(239,68,68,0.12)',
                        color: a.type === 'DEMAND_SPIKE' ? '#FF6B35' : '#ef4444',
                        textTransform: 'uppercase', letterSpacing: '0.04em',
                      }}>
                        {a.type === 'DEMAND_SPIKE' ? '↑ Spike' : '↓ Drop'}
                      </span>
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', fontFamily: 'monospace', color: '#0f172a' }}>{fmtNum(a.actual, 1)}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', fontFamily: 'monospace', color: '#64748b' }}>{fmtNum(a.expected, 1)}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600, color: a.deviation_pct > 0 ? '#FF6B35' : '#ef4444' }}>
                      {a.deviation_pct > 0 ? '+' : ''}{fmtNum(a.deviation_pct, 1)}%
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: severityColor(a.severity) }}>
                      {a.severity > 0 ? '+' : ''}{fmtNum(a.severity, 1)}σ
                    </td>
                    <td style={{ padding: '10px 12px', color: '#64748b', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={a.probable_cause}>
                      {a.probable_cause}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {filtered.length > visible && (
            <button
              onClick={() => setVisible(v => v + 15)}
              style={{
                marginTop: 12, width: '100%', padding: '10px', borderRadius: 10,
                border: '1px solid #e2e8f0', background: '#fff', color: '#64748b',
                fontSize: 13, fontWeight: 500, cursor: 'pointer',
              }}
            >
              Load more ({filtered.length - visible} remaining)
            </button>
          )}
        </>
      )}
    </div>
  )
}

// ------------------------------------------------------------------ //
// Trend breaks panel                                                   //
// ------------------------------------------------------------------ //

interface TrendBreaksProps {
  skus: SKUResponse[]
}

function TrendBreaksPanel({ skus }: TrendBreaksProps) {
  const [selectedSkuId, setSelectedSkuId] = useState<number | null>(null)
  const [breaks, setBreaks] = useState<TrendBreak[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (skus.length > 0 && !selectedSkuId) setSelectedSkuId(skus[0].id)
  }, [skus])

  useEffect(() => {
    if (!selectedSkuId) return
    setLoading(true)
    setBreaks([])
    anomalyApi.getTrends(selectedSkuId)
      .then(r => setBreaks(r.data))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [selectedSkuId])

  return (
    <div style={{ ...card, flex: 2, minWidth: 0, padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h3 style={{ fontSize: 16, fontWeight: 600, color: '#0f172a', margin: 0 }}>Trend Change Detection</h3>
          <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>CUSUM method — sustained shifts</p>
        </div>
        <select
          value={selectedSkuId ?? ''}
          onChange={e => setSelectedSkuId(Number(e.target.value))}
          style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: '6px 10px', fontSize: 12, color: '#0f172a', background: '#fff', outline: 'none' }}
        >
          {skus.map(s => <option key={s.id} value={s.id}>{s.name.split(' (')[0]}</option>)}
        </select>
      </div>

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="animate-pulse bg-slate-100 rounded-xl" style={{ height: 56 }} />
          ))}
        </div>
      ) : breaks.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '32px 0' }}>
          <div style={{ fontSize: 40, opacity: 0.2, marginBottom: 12 }}>📈</div>
          <p style={{ fontSize: 13, color: '#94a3b8' }}>No significant trend breaks detected</p>
          <p style={{ fontSize: 12, color: '#cbd5e1', marginTop: 6 }}>Demand appears stable for this SKU</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {breaks.map((b, i) => (
            <div
              key={i}
              style={{
                padding: '14px 16px', borderRadius: 12,
                backgroundColor: b.direction === 'UP' ? 'rgba(0,212,180,0.06)' : 'rgba(239,68,68,0.06)',
                border: `1px solid ${b.direction === 'UP' ? 'rgba(0,212,180,0.25)' : 'rgba(239,68,68,0.20)'}`,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{
                    fontSize: 18, fontWeight: 700,
                    color: b.direction === 'UP' ? '#00D4B4' : '#ef4444',
                  }}>
                    {b.direction === 'UP' ? '↑' : '↓'}
                  </span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>
                    {b.direction === 'UP' ? 'Upward trend break' : 'Downward trend break'}
                  </span>
                </div>
                <span style={{
                  fontSize: 12, fontWeight: 700, padding: '2px 10px', borderRadius: 999,
                  backgroundColor: b.direction === 'UP' ? 'rgba(0,212,180,0.12)' : 'rgba(239,68,68,0.12)',
                  color: b.direction === 'UP' ? '#00D4B4' : '#ef4444',
                }}>
                  {b.magnitude.toFixed(1)}%
                </span>
              </div>
              <p style={{ fontSize: 12, color: '#94a3b8', margin: 0 }}>
                {fmtDate(b.date)} — {b.description}
              </p>
            </div>
          ))}
        </div>
      )}

      <div style={{ marginTop: 16, padding: '12px 14px', borderRadius: 10, backgroundColor: '#f8fafc', border: '1px solid #e2e8f0' }}>
        <p style={{ fontSize: 11, color: '#94a3b8', lineHeight: 1.6 }}>
          <strong style={{ color: '#64748b' }}>CUSUM (Cumulative Sum)</strong> detects sustained direction changes by accumulating deviations from the baseline mean. A break is flagged when the cumulative deviation exceeds 5× the historical standard deviation.
        </p>
      </div>
    </div>
  )
}

// ------------------------------------------------------------------ //
// Insights panel                                                       //
// ------------------------------------------------------------------ //

interface InsightsPanelProps {
  summary: AnomalySummary | null
  portfolio: AnomalyPoint[]
}

function InsightsPanel({ summary, portfolio }: InsightsPanelProps) {
  const isMobile = useIsMobile()

  // Most recent anomalies (last 30 days of data)
  const recentAnomalies = useMemo(() => {
    if (!portfolio.length) return []
    const sorted = [...portfolio].sort((a, b) => b.date.localeCompare(a.date))
    return sorted.slice(0, 5)
  }, [portfolio])

  // Top actions from critical anomalies
  const topActions = useMemo(() => {
    return portfolio
      .filter(a => Math.abs(a.severity) > 3)
      .slice(0, 3)
      .map(a => ({
        action: a.recommended_action,
        sku: a.sku_name?.split(' (')[0] ?? '—',
        type: a.type,
      }))
  }, [portfolio])

  return (
    <div style={{ ...card, padding: 24 }}>
      <h3 style={{ fontSize: 16, fontWeight: 600, color: '#0f172a', marginBottom: 20, marginTop: 0 }}>
        Anomaly Insights
      </h3>
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)', gap: 20 }}>

        {/* Card 1: Most volatile */}
        <div style={{ backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12, padding: 16 }}>
          <p style={{ ...labelStyle, marginBottom: 12 }}>Most Volatile Product</p>
          <p style={{ fontSize: 20, fontWeight: 700, color: '#0f172a', marginBottom: 6 }}>
            {summary?.most_anomalous_sku?.split(' (')[0] ?? '—'}
          </p>
          <p style={{ fontSize: 12, color: '#94a3b8', lineHeight: 1.5 }}>
            Highest number of detected anomalies across the portfolio. Requires elevated monitoring cadence and proactive safety stock review.
          </p>
        </div>

        {/* Card 2: Recent pattern */}
        <div style={{ backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12, padding: 16 }}>
          <p style={{ ...labelStyle, marginBottom: 12 }}>Recent Anomaly Pattern</p>
          {recentAnomalies.length === 0 ? (
            <p style={{ fontSize: 12, color: '#94a3b8' }}>No recent anomalies detected</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {recentAnomalies.slice(0, 3).map((a, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                  <span style={{
                    fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 999, flexShrink: 0, marginTop: 1,
                    backgroundColor: a.type === 'DEMAND_SPIKE' ? 'rgba(255,107,53,0.12)' : 'rgba(239,68,68,0.12)',
                    color: a.type === 'DEMAND_SPIKE' ? '#FF6B35' : '#ef4444',
                  }}>
                    {a.type === 'DEMAND_SPIKE' ? '↑' : '↓'}
                  </span>
                  <div>
                    <p style={{ fontSize: 12, fontWeight: 500, color: '#0f172a' }}>{a.sku_name?.split(' (')[0]}</p>
                    <p style={{ fontSize: 11, color: '#94a3b8' }}>{fmtDate(a.date)} · {a.probable_cause}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Card 3: Recommended actions */}
        <div style={{ backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12, padding: 16 }}>
          <p style={{ ...labelStyle, marginBottom: 12 }}>Recommended Actions</p>
          {topActions.length === 0 ? (
            <p style={{ fontSize: 12, color: '#94a3b8' }}>No critical anomalies requiring immediate action</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {topActions.map((a, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                  <span style={{
                    width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
                    backgroundColor: '#00D4B4', color: '#0A1628',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 10, fontWeight: 700,
                  }}>
                    {i + 1}
                  </span>
                  <div>
                    <p style={{ fontSize: 12, fontWeight: 500, color: '#0f172a' }}>{a.action}</p>
                    <p style={{ fontSize: 11, color: '#94a3b8' }}>{a.sku}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ------------------------------------------------------------------ //
// Main page                                                            //
// ------------------------------------------------------------------ //

export default function AnomalyDetection() {
  const isMobile = useIsMobile()
  const [summary, setSummary] = useState<AnomalySummary | null>(null)
  const [portfolio, setPortfolio] = useState<AnomalyPoint[]>([])
  const [skus, setSkus] = useState<SKUResponse[]>([])
  const [selectedSkuId, setSelectedSkuId] = useState<number | null>(null)
  const [loadingSummary, setLoadingSummary] = useState(true)

  useEffect(() => {
    anomalyApi.getSummary()
      .then(r => setSummary(r.data))
      .catch(console.error)
      .finally(() => setLoadingSummary(false))

    anomalyApi.getPortfolio(9999)
      .then(r => setPortfolio(r.data))
      .catch(console.error)

    forecastApi.listSkus()
      .then(r => {
        setSkus(r.data)
        if (r.data.length > 0) setSelectedSkuId(r.data[0].id)
      })
      .catch(console.error)
  }, [])

  return (
    <div style={{ background: '#f8fafc', minHeight: '100%', padding: isMobile ? 16 : 24 }}>

      {/* ── Summary Cards ────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${isMobile ? 2 : 5}, 1fr)`, gap: isMobile ? 10 : 16, marginBottom: 20 }}>
        <SummaryCard
          label="Total Anomalies"
          value={loadingSummary ? '…' : summary?.total_anomalies ?? 0}
          color="#00D4B4"
          loading={loadingSummary}
        />
        <SummaryCard
          label="Demand Spikes"
          value={loadingSummary ? '…' : summary?.spikes ?? 0}
          color="#FF6B35"
          loading={loadingSummary}
        />
        <SummaryCard
          label="Demand Drops"
          value={loadingSummary ? '…' : summary?.drops ?? 0}
          color="#ef4444"
          loading={loadingSummary}
        />
        <SummaryCard
          label="Critical >4σ"
          value={loadingSummary ? '…' : summary?.critical_anomalies ?? 0}
          color="#ef4444"
          pulse={!loadingSummary && (summary?.critical_anomalies ?? 0) > 0}
          loading={loadingSummary}
        />
        <SummaryCard
          label="Anomaly Rate / 100"
          value={loadingSummary ? '…' : `${summary?.anomaly_rate ?? 0}%`}
          color="#f59e0b"
          loading={loadingSummary}
        />
      </div>

      {/* ── Timeline Chart ────────────────────────────────────────── */}
      <TimelineChart
        skus={skus}
        selectedSkuId={selectedSkuId}
        onSelectSku={setSelectedSkuId}
      />

      {/* ── Table + Trend Breaks ─────────────────────────────────── */}
      <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: 20, marginBottom: 20 }}>
        <AnomalyTable skus={skus} />
        <TrendBreaksPanel skus={skus} />
      </div>

      {/* ── Insights Panel ───────────────────────────────────────── */}
      <InsightsPanel summary={summary} portfolio={portfolio} />

    </div>
  )
}
