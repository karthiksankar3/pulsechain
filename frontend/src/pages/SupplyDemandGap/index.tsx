import { useEffect, useState, useMemo, type CSSProperties } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  supplyGapApi,
  forecastApi,
  type GapSummary,
  type SKUGapData,
  type WaterfallPoint,
  type SKUResponse,
} from '../../services/api'
import { useIsMobile } from '../../hooks/useIsMobile'

// ------------------------------------------------------------------ //
// Design tokens
// ------------------------------------------------------------------ //

const card: CSSProperties = {
  backgroundColor: '#ffffff',
  border: '1px solid #e2e8f0',
  borderRadius: '16px',
  boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
}

const labelStyle: CSSProperties = {
  fontSize: '11px',
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  color: '#94a3b8',
}

const TEAL = '#00D4B4'
const RED = '#ef4444'
const AMBER = '#f59e0b'
const NAVY = '#0A1628'

// ------------------------------------------------------------------ //
// Helpers
// ------------------------------------------------------------------ //

function fmtNum(n: number | null | undefined, dec = 0): string {
  if (n == null) return '—'
  return n.toLocaleString('en-IN', { maximumFractionDigits: dec })
}

function fmtCurrency(n: number | null | undefined): string {
  if (n == null) return '—'
  if (n >= 1_000_000) return `₹${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `₹${(n / 1_000).toFixed(1)}K`
  return `₹${n.toFixed(0)}`
}

function statusColor(status: string): string {
  switch (status) {
    case 'CRITICAL': return RED
    case 'DEFICIT': return '#f97316'
    case 'LOW': return AMBER
    case 'HEALTHY': return '#10b981'
    default: return '#64748b'
  }
}

function statusBg(status: string): string {
  switch (status) {
    case 'CRITICAL': return 'rgba(239,68,68,0.1)'
    case 'DEFICIT': return 'rgba(249,115,22,0.1)'
    case 'LOW': return 'rgba(245,158,11,0.1)'
    case 'HEALTHY': return 'rgba(16,185,129,0.1)'
    default: return 'rgba(100,116,139,0.1)'
  }
}

function generatePO(sku: SKUGapData): void {
  const poNumber = `PO-${Date.now().toString().slice(-8)}`
  const qty = sku.total_recommended_order_qty ?? sku.recommended_immediate_order
  const unitPrice = sku.unit_price
  const totalValue = qty * unitPrice
  const requiredBy = new Date()
  requiredBy.setDate(requiredBy.getDate() + 14)

  const rows = [
    ['PO Number', 'SKU Code', 'SKU Name', 'Quantity', 'Unit Price (₹)', 'Total Value (₹)', 'Required By Date'],
    [poNumber, sku.atc_code, sku.sku_name, qty.toFixed(0), unitPrice.toFixed(2), totalValue.toFixed(2), requiredBy.toISOString().split('T')[0]],
  ]
  const csv = rows.map(r => r.join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${poNumber}_${sku.atc_code}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

// ------------------------------------------------------------------ //
// Summary card
// ------------------------------------------------------------------ //

function SummaryCard({
  label, value, color, pulse, loading,
}: {
  label: string; value: string; color: string; pulse?: boolean; loading?: boolean
}) {
  if (loading) {
    return (
      <div style={{ ...card, padding: '20px' }}>
        <div style={{ height: 80, borderRadius: 8, backgroundColor: '#f1f5f9' }} />
      </div>
    )
  }
  return (
    <div style={{ ...card, padding: '20px' }}>
      <p style={labelStyle}>{label}</p>
      <p style={{
        fontSize: '40px', fontWeight: 700, lineHeight: 1, marginTop: '8px',
        color, ...(pulse ? { animation: 'pulse 1.5s infinite' } : {}),
      }}>
        {value}
      </p>
    </div>
  )
}

// ------------------------------------------------------------------ //
// Custom tooltip for gap chart
// ------------------------------------------------------------------ //

function GapTooltip({ active, payload, label }: {
  active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string
}) {
  if (!active || !payload?.length || !label) return null
  return (
    <div style={{
      backgroundColor: '#fff', border: '1px solid #e2e8f0',
      borderRadius: 10, padding: '10px 14px', fontSize: 12,
      boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
    }}>
      <p style={{ fontWeight: 700, marginBottom: 6, color: NAVY }}>{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color, margin: '2px 0' }}>
          {p.name}: <strong>{fmtNum(p.value, 1)}</strong>
        </p>
      ))}
    </div>
  )
}

// ------------------------------------------------------------------ //
// Sortable table header
// ------------------------------------------------------------------ //

type SortDir = 'asc' | 'desc'
type SortKey = 'sku_name' | 'current_stock' | 'total_12_week_demand' | 'gap_12_weeks' | 'first_stockout_week' | 'overall_status'

function SortHeader({
  label, sortKey, currentKey, direction, onSort,
}: {
  label: string; sortKey: SortKey; currentKey: SortKey; direction: SortDir; onSort: (k: SortKey) => void
}) {
  const active = sortKey === currentKey
  return (
    <th
      onClick={() => onSort(sortKey)}
      style={{
        padding: '10px 12px', textAlign: 'left', fontSize: 11, fontWeight: 600,
        textTransform: 'uppercase', letterSpacing: '0.06em', color: active ? NAVY : '#64748b',
        cursor: 'pointer', whiteSpace: 'nowrap', userSelect: 'none',
        borderBottom: '1px solid #e2e8f0', backgroundColor: '#f8fafc',
      }}
    >
      {label} {active ? (direction === 'asc' ? '↑' : '↓') : ''}
    </th>
  )
}

// ------------------------------------------------------------------ //
// Main page
// ------------------------------------------------------------------ //

export default function SupplyDemandGap() {
  const isMobile = useIsMobile()

  const [summary, setSummary] = useState<GapSummary | null>(null)
  const [portfolio, setPortfolio] = useState<SKUGapData[]>([])
  const [skus, setSkus] = useState<SKUResponse[]>([])
  const [selectedSkuId, setSelectedSkuId] = useState<number | null>(null)
  const [skuGap, setSkuGap] = useState<SKUGapData | null>(null)
  const [waterfall, setWaterfall] = useState<WaterfallPoint[]>([])

  const [summaryLoading, setSummaryLoading] = useState(true)
  const [portfolioLoading, setPortfolioLoading] = useState(true)
  const [chartLoading, setChartLoading] = useState(false)

  const [sortKey, setSortKey] = useState<SortKey>('urgency_rank' as SortKey)
  const [sortDir, setSortDir] = useState<SortDir>('asc')

  // Initial data load
  useEffect(() => {
    supplyGapApi.getSummary().then(r => {
      setSummary(r.data)
      setSummaryLoading(false)
    }).catch(() => setSummaryLoading(false))

    supplyGapApi.getPortfolio().then(r => {
      setPortfolio(r.data)
      setPortfolioLoading(false)
      if (r.data.length > 0) {
        setSelectedSkuId(r.data[0].sku_id)
      }
    }).catch(() => setPortfolioLoading(false))

    forecastApi.listSkus().then(r => setSkus(r.data)).catch(() => {})
  }, [])

  // Load chart data when selected SKU changes
  useEffect(() => {
    if (!selectedSkuId) return
    setChartLoading(true)
    Promise.all([
      supplyGapApi.getSKUGap(selectedSkuId),
      supplyGapApi.getWaterfall(selectedSkuId),
    ]).then(([gapRes, waterfallRes]) => {
      setSkuGap(gapRes.data)
      setWaterfall(waterfallRes.data)
      setChartLoading(false)
    }).catch(() => setChartLoading(false))
  }, [selectedSkuId])

  // Sort portfolio
  const sortedPortfolio = useMemo(() => {
    const sorted = [...portfolio].sort((a, b) => {
      let aVal: number | string = a[sortKey as keyof SKUGapData] as number | string ?? 0
      let bVal: number | string = b[sortKey as keyof SKUGapData] as number | string ?? 0
      if (sortKey === 'overall_status') {
        const order: Record<string, number> = { CRITICAL: 0, DEFICIT: 1, LOW: 2, HEALTHY: 3 }
        aVal = order[a.overall_status ?? 'HEALTHY'] ?? 3
        bVal = order[b.overall_status ?? 'HEALTHY'] ?? 3
      }
      if (sortKey === 'first_stockout_week') {
        aVal = a.first_stockout_week ?? 99
        bVal = b.first_stockout_week ?? 99
      }
      if (typeof aVal === 'string') return sortDir === 'asc' ? aVal.localeCompare(bVal as string) : (bVal as string).localeCompare(aVal)
      return sortDir === 'asc' ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number)
    })
    return sorted
  }, [portfolio, sortKey, sortDir])

  function handleSort(key: SortKey) {
    if (key === sortKey) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
  }

  // Gap chart data from skuGap.weeks
  const gapChartData = useMemo(() => {
    if (!skuGap) return []
    return skuGap.weeks.map(w => ({
      name: `Wk ${w.week_number}`,
      gap: w.gap,
      supply: w.available_supply,
      demand: w.demand_forecast,
    }))
  }, [skuGap])

  // Waterfall chart: show cumulative stock levels
  const waterfallChartData = useMemo(() => {
    return waterfall.map(w => ({
      name: w.label,
      stock: Math.max(w.cumulative, 0),
      stockNeg: Math.min(w.cumulative, 0),
    }))
  }, [waterfall])

  const selectedSkuName = skuGap?.sku_name ?? skus.find(s => s.id === selectedSkuId)?.name ?? ''

  const padding = isMobile ? 16 : 24
  const gap = isMobile ? 16 : 20

  // Action items (CRITICAL + DEFICIT SKUs)
  const actionItems = portfolio.filter(p => p.needs_immediate_action)

  return (
    <div style={{ padding, backgroundColor: '#0A1628', minHeight: '100vh' }}>

      {/* Summary cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)',
        gap,
        marginBottom: gap,
      }}>
        <SummaryCard
          label="Critical Gaps"
          value={summaryLoading ? '…' : String(summary?.critical_count ?? 0)}
          color={RED}
          pulse={(summary?.critical_count ?? 0) > 0}
          loading={summaryLoading}
        />
        <SummaryCard
          label="Total Deficit Units"
          value={summaryLoading ? '…' : fmtNum(summary?.total_deficit_units)}
          color={RED}
          loading={summaryLoading}
        />
        <SummaryCard
          label="Weeks to First Stockout"
          value={summaryLoading ? '…' : summary?.weeks_to_first_stockout != null ? `Wk ${summary.weeks_to_first_stockout}` : 'None'}
          color={AMBER}
          loading={summaryLoading}
        />
        <SummaryCard
          label="Recommended Order Value"
          value={summaryLoading ? '…' : fmtCurrency(summary?.total_recommended_order_value)}
          color={TEAL}
          loading={summaryLoading}
        />
      </div>

      {/* Portfolio Gap Table */}
      <div style={{ ...card, marginBottom: gap, overflow: 'hidden' }}>
        <div style={{ padding: '20px 20px 16px', borderBottom: '1px solid #f1f5f9' }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: NAVY, margin: 0 }}>
            12-Week Supply-Demand Gap Analysis
          </h2>
          <p style={{ fontSize: 12, color: '#64748b', marginTop: 4, marginBottom: 0 }}>
            Forecast demand vs available supply across all products
          </p>
        </div>

        {portfolioLoading ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>Loading portfolio…</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr>
                  <SortHeader label="Product" sortKey="sku_name" currentKey={sortKey as SortKey} direction={sortDir} onSort={handleSort} />
                  <SortHeader label="Current Stock" sortKey="current_stock" currentKey={sortKey as SortKey} direction={sortDir} onSort={handleSort} />
                  <SortHeader label="12W Demand" sortKey="total_12_week_demand" currentKey={sortKey as SortKey} direction={sortDir} onSort={handleSort} />
                  <SortHeader label="12W Gap" sortKey="gap_12_weeks" currentKey={sortKey as SortKey} direction={sortDir} onSort={handleSort} />
                  <SortHeader label="Status" sortKey="overall_status" currentKey={sortKey as SortKey} direction={sortDir} onSort={handleSort} />
                  <SortHeader label="First Stockout" sortKey="first_stockout_week" currentKey={sortKey as SortKey} direction={sortDir} onSort={handleSort} />
                  <th style={{ padding: '10px 12px', textAlign: 'left', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#64748b', borderBottom: '1px solid #e2e8f0', backgroundColor: '#f8fafc', whiteSpace: 'nowrap' }}>Rec. Order</th>
                  <th style={{ padding: '10px 12px', textAlign: 'left', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#64748b', borderBottom: '1px solid #e2e8f0', backgroundColor: '#f8fafc' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {sortedPortfolio.map((sku, i) => {
                  const isSelected = sku.sku_id === selectedSkuId
                  const gap12 = sku.gap_12_weeks
                  return (
                    <tr
                      key={sku.sku_id}
                      onClick={() => setSelectedSkuId(sku.sku_id)}
                      style={{
                        backgroundColor: isSelected ? 'rgba(0,212,180,0.04)' : i % 2 === 0 ? '#fff' : '#fafafa',
                        cursor: 'pointer', transition: 'background 0.1s',
                        borderLeft: isSelected ? `3px solid ${TEAL}` : '3px solid transparent',
                      }}
                    >
                      <td style={{ padding: '12px', color: NAVY, fontWeight: 500 }}>
                        <div>{sku.sku_name}</div>
                        <div style={{ fontSize: 11, color: '#94a3b8' }}>{sku.atc_code}</div>
                      </td>
                      <td style={{ padding: '12px', color: '#334155' }}>{fmtNum(sku.current_stock)}</td>
                      <td style={{ padding: '12px', color: '#334155' }}>{fmtNum(sku.total_12_week_demand)}</td>
                      <td style={{ padding: '12px', fontWeight: 600, color: gap12 < 0 ? RED : TEAL }}>
                        {gap12 < 0 ? '↓ ' : '↑ '}{fmtNum(Math.abs(gap12))}
                      </td>
                      <td style={{ padding: '12px' }}>
                        <span style={{
                          padding: '3px 10px', borderRadius: 99, fontSize: 11, fontWeight: 700,
                          color: statusColor(sku.overall_status ?? ''),
                          backgroundColor: statusBg(sku.overall_status ?? ''),
                        }}>
                          {sku.overall_status}
                        </span>
                      </td>
                      <td style={{ padding: '12px' }}>
                        {sku.first_stockout_week != null ? (
                          <span style={{ color: RED, fontWeight: 600 }}>Week {sku.first_stockout_week}</span>
                        ) : (
                          <span style={{ color: '#10b981', fontWeight: 500 }}>No stockout</span>
                        )}
                      </td>
                      <td style={{ padding: '12px', color: '#334155' }}>
                        {fmtNum(sku.total_recommended_order_qty)} units
                      </td>
                      <td style={{ padding: '12px' }}>
                        {sku.overall_status === 'CRITICAL' ? (
                          <button
                            onClick={(e) => { e.stopPropagation(); generatePO(sku) }}
                            style={{
                              padding: '5px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                              border: `1px solid ${RED}`, color: RED, backgroundColor: 'transparent',
                              cursor: 'pointer', whiteSpace: 'nowrap',
                            }}
                          >
                            Order Now
                          </button>
                        ) : sku.overall_status === 'DEFICIT' ? (
                          <button
                            onClick={(e) => { e.stopPropagation(); generatePO(sku) }}
                            style={{
                              padding: '5px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                              border: `1px solid ${AMBER}`, color: AMBER, backgroundColor: 'transparent',
                              cursor: 'pointer', whiteSpace: 'nowrap',
                            }}
                          >
                            Plan Order
                          </button>
                        ) : (
                          <span style={{ fontSize: 12, color: '#94a3b8' }}>—</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Two-column charts section */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? '1fr' : '55% 1fr',
        gap,
        marginBottom: gap,
      }}>
        {/* Left: Weekly Gap Chart */}
        <div style={{ ...card, padding: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
            <div>
              <h3 style={{ fontSize: 14, fontWeight: 700, color: NAVY, margin: 0 }}>
                Week-by-Week Gap Analysis
              </h3>
              <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 2, marginBottom: 0 }}>
                Surplus (teal) / Deficit (red) vs available supply
              </p>
            </div>
            <select
              value={selectedSkuId ?? ''}
              onChange={e => setSelectedSkuId(Number(e.target.value))}
              style={{
                padding: '6px 10px', borderRadius: 8, border: '1px solid #e2e8f0',
                fontSize: 12, color: NAVY, backgroundColor: '#f8fafc',
                cursor: 'pointer',
              }}
            >
              {portfolio.map(s => (
                <option key={s.sku_id} value={s.sku_id}>{s.sku_name}</option>
              ))}
            </select>
          </div>

          {chartLoading ? (
            <div style={{ height: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8' }}>
              Loading…
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <ComposedChart data={gapChartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#94a3b8' }} />
                <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} width={55} />
                <Tooltip content={<GapTooltip />} />
                <ReferenceLine y={0} stroke="#334155" strokeWidth={1.5} label={{ value: 'Stockout threshold', position: 'insideTopRight', fontSize: 10, fill: '#64748b' }} />
                <Bar dataKey="gap" name="Gap (units)" radius={[3, 3, 0, 0]}>
                  {gapChartData.map((entry, i) => (
                    <Cell key={i} fill={entry.gap >= 0 ? TEAL : RED} />
                  ))}
                </Bar>
                <Line type="monotone" dataKey="supply" name="Available Supply" stroke="#94a3b8" dot={false} strokeWidth={2} />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Right: Stock Waterfall Chart */}
        <div style={{ ...card, padding: '20px' }}>
          <div style={{ marginBottom: 16 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: NAVY, margin: 0 }}>
              Stock Waterfall — {selectedSkuName}
            </h3>
            <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 2, marginBottom: 0 }}>
              Closing stock level after each week's demand
            </p>
          </div>

          {chartLoading ? (
            <div style={{ height: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8' }}>
              Loading…
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={waterfallChartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="name" tick={{ fontSize: 9, fill: '#94a3b8' }} interval={0} angle={-35} textAnchor="end" height={40} />
                <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} width={55} />
                <Tooltip
                  formatter={(val: number) => [fmtNum(val, 0) + ' units', 'Stock Level']}
                  contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }}
                />
                <ReferenceLine y={0} stroke={RED} strokeDasharray="4 2" />
                <Bar dataKey="stock" name="Stock Level" radius={[3, 3, 0, 0]}>
                  {waterfallChartData.map((entry, i) => (
                    <Cell
                      key={i}
                      fill={i === 0 ? TEAL : entry.stock > 0 ? 'rgba(0,212,180,0.5)' : RED}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Action Recommendations Panel */}
      <div style={{ ...card, padding: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
          <div>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: NAVY, margin: 0 }}>
              Recommended Actions
            </h3>
            <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 2, marginBottom: 0 }}>
              Immediate procurement actions required for at-risk SKUs
            </p>
          </div>
          {actionItems.length > 0 && (
            <div style={{
              fontSize: 12, fontWeight: 600, color: TEAL,
              backgroundColor: 'rgba(0,212,180,0.08)',
              padding: '4px 12px', borderRadius: 99,
            }}>
              {actionItems.length} SKU{actionItems.length > 1 ? 's' : ''} need action
            </div>
          )}
        </div>

        {portfolioLoading ? (
          <div style={{ textAlign: 'center', color: '#94a3b8', padding: 24 }}>Loading…</div>
        ) : actionItems.length === 0 ? (
          <div style={{
            textAlign: 'center', padding: '40px 20px',
            color: '#10b981', backgroundColor: 'rgba(16,185,129,0.05)',
            borderRadius: 12, border: '1px dashed rgba(16,185,129,0.3)',
          }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>✓</div>
            <div style={{ fontWeight: 600 }}>All SKUs are within healthy supply levels</div>
            <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>No immediate procurement actions required</div>
          </div>
        ) : (
          <>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ backgroundColor: '#f8fafc' }}>
                    {['SKU Name', 'Issue', 'First Stockout', 'Recommended Order', 'Order Value', 'Urgency', 'Action'].map(h => (
                      <th key={h} style={{
                        padding: '10px 12px', textAlign: 'left', fontSize: 11, fontWeight: 600,
                        textTransform: 'uppercase', letterSpacing: '0.06em', color: '#64748b',
                        borderBottom: '1px solid #e2e8f0', whiteSpace: 'nowrap',
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {actionItems.map((sku, i) => {
                    const issue = sku.overall_status === 'CRITICAL'
                      ? `Critical deficit from Week ${sku.first_stockout_week}`
                      : `Deficit expected from Week ${sku.first_stockout_week}`
                    const recQty = sku.total_recommended_order_qty ?? 0
                    const orderValue = recQty * sku.unit_price

                    return (
                      <tr key={sku.sku_id} style={{ backgroundColor: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                        <td style={{ padding: '12px', color: NAVY, fontWeight: 500 }}>
                          <div>{sku.sku_name}</div>
                          <div style={{ fontSize: 11, color: '#94a3b8' }}>{sku.atc_code}</div>
                        </td>
                        <td style={{ padding: '12px', color: '#475569', fontSize: 12 }}>{issue}</td>
                        <td style={{ padding: '12px' }}>
                          {sku.first_stockout_week != null
                            ? <span style={{ color: RED, fontWeight: 600 }}>Week {sku.first_stockout_week}</span>
                            : <span style={{ color: '#10b981' }}>None</span>
                          }
                        </td>
                        <td style={{ padding: '12px', fontWeight: 600, color: NAVY }}>
                          {fmtNum(recQty)} units
                        </td>
                        <td style={{ padding: '12px', color: '#334155' }}>{fmtCurrency(orderValue)}</td>
                        <td style={{ padding: '12px' }}>
                          <span style={{
                            padding: '3px 10px', borderRadius: 99, fontSize: 11, fontWeight: 700,
                            color: statusColor(sku.overall_status ?? ''),
                            backgroundColor: statusBg(sku.overall_status ?? ''),
                          }}>
                            {sku.overall_status}
                          </span>
                        </td>
                        <td style={{ padding: '12px' }}>
                          <button
                            onClick={() => generatePO(sku)}
                            style={{
                              padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                              border: 'none',
                              backgroundColor: sku.overall_status === 'CRITICAL' ? RED : AMBER,
                              color: '#fff', cursor: 'pointer', whiteSpace: 'nowrap',
                            }}
                          >
                            Generate PO
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Total recommended order value */}
            <div style={{
              marginTop: 16, padding: '12px 16px',
              backgroundColor: 'rgba(0,212,180,0.06)',
              borderRadius: 10, border: '1px solid rgba(0,212,180,0.15)',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              flexWrap: 'wrap', gap: 8,
            }}>
              <span style={{ fontSize: 13, color: '#475569' }}>
                Total recommended procurement value across {actionItems.length} SKU{actionItems.length > 1 ? 's' : ''}
              </span>
              <span style={{ fontSize: 20, fontWeight: 700, color: TEAL }}>
                {fmtCurrency(actionItems.reduce((sum, s) => sum + (s.total_recommended_order_value ?? 0), 0))}
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
