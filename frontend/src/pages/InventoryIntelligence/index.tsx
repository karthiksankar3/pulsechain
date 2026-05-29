import { Fragment, useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  inventoryApi,
  type ABCXYZItem,
  type InventoryHealthData,
  type InventorySKU,
  type SafetyStockResult,
  type SKUDetail,
} from '../../services/api'

// ------------------------------------------------------------------ //
// Types & constants                                                    //
// ------------------------------------------------------------------ //

type ABCClass = 'A' | 'B' | 'C'
type XYZClass = 'X' | 'Y' | 'Z'

const CELL_BG: Record<string, string> = {
  AX: 'rgba(0,212,180,0.18)',
  AY: 'rgba(0,212,180,0.10)',
  AZ: 'rgba(0,212,180,0.06)',
  BX: 'rgba(0,212,180,0.10)',
  BY: '#f1f5f9',
  BZ: 'rgba(255,107,53,0.10)',
  CX: '#f8fafc',
  CY: 'rgba(255,107,53,0.06)',
  CZ: 'rgba(239,68,68,0.08)',
}

function dosColor(dos: number): string {
  if (dos < 30) return '#ef4444'
  if (dos < 60) return '#f59e0b'
  return '#10b981'
}

function riskColor(prob: number): string {
  if (prob > 0.3) return '#ef4444'
  if (prob > 0.1) return '#f59e0b'
  return '#10b981'
}

function fmtNum(n: number | null | undefined, decimals = 1): string {
  if (n === null || n === undefined) return '—'
  return n.toFixed(decimals)
}

function fmtCurrency(n: number): string {
  if (n >= 1_000_000) return `₹${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `₹${(n / 1_000).toFixed(1)}K`
  return `₹${n.toFixed(0)}`
}

// ------------------------------------------------------------------ //
// Skeleton                                                            //
// ------------------------------------------------------------------ //

function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-slate-100 ${className ?? ''}`} />
}

// ------------------------------------------------------------------ //
// Health Cards                                                         //
// ------------------------------------------------------------------ //

interface HealthCardProps {
  label: string
  value: number | string
  badge?: 'red' | 'amber' | 'teal' | 'none'
  delay?: number
}

function HealthCard({ label, value, badge = 'none', delay = 0 }: HealthCardProps) {
  const valueColor =
    badge === 'red'   ? '#ef4444' :
    badge === 'amber' ? '#f59e0b' :
    badge === 'teal'  ? '#00D4B4' :
    '#0f172a'

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay }}
      style={{
        backgroundColor: '#ffffff',
        border: '1px solid #e2e8f0',
        borderRadius: '16px',
        padding: '20px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
      }}
    >
      <p style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#94a3b8' }}>
        {label}
      </p>
      <p style={{ fontSize: '48px', fontWeight: 700, lineHeight: 1, marginTop: '8px', color: valueColor }}>
        {value}
      </p>
    </motion.div>
  )
}

// ------------------------------------------------------------------ //
// ABC-XYZ Matrix                                                       //
// ------------------------------------------------------------------ //

interface MatrixProps {
  items: ABCXYZItem[]
  selectedCell: string | null
  onCellClick: (cell: string | null) => void
}

function ABCXYZMatrix({ items, selectedCell, onCellClick }: MatrixProps) {
  const cellCount = (abc: ABCClass, xyz: XYZClass) =>
    items.filter((i) => i.abc_class === abc && i.xyz_class === xyz).length

  const ABC_LABELS: Record<ABCClass, string> = { A: 'High Rev', B: 'Mid Rev', C: 'Low Rev' }
  const XYZ_LABELS: Record<XYZClass, string> = { X: 'Stable', Y: 'Variable', Z: 'Volatile' }

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '20px' }}>
        <div>
          <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#0f172a', margin: 0 }}>
            ABC × XYZ Segmentation
          </h3>
          <p style={{ fontSize: '12px', color: '#94a3b8', marginTop: '4px' }}>
            Click a cell to filter the table
          </p>
        </div>
        {selectedCell && (
          <button
            onClick={() => onCellClick(null)}
            style={{ fontSize: '12px', color: '#00D4B4', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', padding: 0 }}
          >
            Clear filter
          </button>
        )}
      </div>

      {/* Grid: 1 label col + 3 data cols */}
      <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr 1fr 1fr', gap: '6px' }}>
        {/* Top-left corner */}
        <div />

        {/* Column headers */}
        {(['X', 'Y', 'Z'] as XYZClass[]).map((xyz) => (
          <div
            key={xyz}
            style={{
              textAlign: 'center',
              padding: '8px 4px 10px',
              borderBottom: '2px solid #e2e8f0',
            }}
          >
            <span style={{ fontSize: '13px', fontWeight: 700, color: '#334155' }}>{xyz}</span>
            <div style={{ fontSize: '10px', color: '#94a3b8', marginTop: '2px' }}>{XYZ_LABELS[xyz]}</div>
          </div>
        ))}

        {/* Rows: label + 3 cells each */}
        {(['A', 'B', 'C'] as ABCClass[]).map((abc) => (
          <Fragment key={abc}>
            {/* Row label */}
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '4px 10px 4px 0',
                borderRight: '2px solid #e2e8f0',
              }}
            >
              <span style={{ fontSize: '14px', fontWeight: 700, color: '#334155' }}>{abc}</span>
              <span style={{ fontSize: '9px', color: '#94a3b8', textAlign: 'center', lineHeight: 1.3 }}>
                {ABC_LABELS[abc]}
              </span>
            </div>

            {/* Cells */}
            {(['X', 'Y', 'Z'] as XYZClass[]).map((xyz) => {
              const key = `${abc}${xyz}`
              const count = cellCount(abc, xyz)
              const isSelected = selectedCell === key
              return (
                <button
                  key={xyz}
                  onClick={() => onCellClick(isSelected ? null : key)}
                  style={{
                    height: '76px',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: '10px',
                    background: isSelected ? 'rgba(0,212,180,0.20)' : (CELL_BG[key] ?? '#f8fafc'),
                    border: isSelected ? '2px solid #00D4B4' : '2px solid transparent',
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                    boxShadow: isSelected ? '0 0 0 3px rgba(0,212,180,0.15)' : '0 1px 2px rgba(0,0,0,0.04)',
                    outline: 'none',
                  }}
                  onMouseEnter={(e) => {
                    if (!isSelected) (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 4px 12px rgba(0,0,0,0.10)'
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.boxShadow = isSelected
                      ? '0 0 0 3px rgba(0,212,180,0.15)'
                      : '0 1px 2px rgba(0,0,0,0.04)'
                  }}
                >
                  <span style={{ fontSize: '28px', fontWeight: 700, color: count > 0 ? '#0f172a' : '#cbd5e1', lineHeight: 1 }}>
                    {count}
                  </span>
                  <span style={{ fontSize: '10px', color: '#64748b', marginTop: '3px', fontWeight: 500 }}>
                    {key}
                  </span>
                </button>
              )
            })}
          </Fragment>
        ))}
      </div>
    </div>
  )
}

// ------------------------------------------------------------------ //
// SKU Table                                                            //
// ------------------------------------------------------------------ //

type SortKey = 'dos' | 'stockout_probability_30d' | 'expiry_risk_score' | 'current_stock'

interface SKUTableProps {
  skus: InventorySKU[]
  loading: boolean
  selectedCell: string | null
  selectedSkuId: number | null
  onSelectSku: (id: number) => void
}

function SKUTable({ skus, loading, selectedCell, selectedSkuId, onSelectSku }: SKUTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>('stockout_probability_30d')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  const filtered = selectedCell
    ? skus.filter(
        (s) => s.abc_class === selectedCell[0] && s.xyz_class === selectedCell[1],
      )
    : skus

  const sorted = [...filtered].sort((a, b) => {
    const va = a[sortKey] ?? 0
    const vb = b[sortKey] ?? 0
    return sortDir === 'asc' ? (va as number) - (vb as number) : (vb as number) - (va as number)
  })

  function toggleSort(key: SortKey) {
    if (key === sortKey) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(key); setSortDir('desc') }
  }

  const SortBtn = ({ col, label }: { col: SortKey; label: string }) => (
    <button
      onClick={() => toggleSort(col)}
      style={{
        background: 'none', border: 'none', cursor: 'pointer', padding: 0,
        display: 'flex', alignItems: 'center', gap: '3px',
        fontSize: '11px', fontWeight: 600,
        textTransform: 'uppercase', letterSpacing: '0.06em', color: '#94a3b8',
      }}
    >
      {label}
      {sortKey === col && (
        <span style={{ color: '#00D4B4' }}>{sortDir === 'asc' ? ' ↑' : ' ↓'}</span>
      )}
    </button>
  )

  const dosPill = (dos: number) => {
    const color = dosColor(dos)
    const bg = dos < 30 ? 'rgba(239,68,68,0.10)' : dos < 60 ? 'rgba(245,158,11,0.10)' : 'rgba(16,185,129,0.10)'
    return (
      <span style={{ background: bg, color, fontSize: '11px', fontWeight: 700, padding: '3px 10px', borderRadius: '999px' }}>
        {fmtNum(dos, 0)}d
      </span>
    )
  }

  const statusBadge = (status: string) => {
    const map: Record<string, { bg: string; color: string }> = {
      CRITICAL:  { bg: 'rgba(239,68,68,0.10)',   color: '#ef4444' },
      'AT RISK': { bg: 'rgba(245,158,11,0.10)',  color: '#f59e0b' },
      HEALTHY:   { bg: 'rgba(16,185,129,0.10)',  color: '#10b981' },
    }
    const s = map[status] ?? map['HEALTHY']
    return (
      <span style={{ background: s.bg, color: s.color, fontSize: '10px', fontWeight: 700, padding: '3px 10px', borderRadius: '999px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
        {status}
      </span>
    )
  }

  const th: CSSProperties = {
    padding: '10px 16px', textAlign: 'left',
    fontSize: '11px', fontWeight: 600, textTransform: 'uppercase',
    letterSpacing: '0.06em', color: '#94a3b8',
    background: '#f8fafc', whiteSpace: 'nowrap', borderBottom: '1px solid #e2e8f0',
  }

  return (
    <div>
      <div style={{ marginBottom: '20px' }}>
        <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#0f172a', margin: 0 }}>Inventory Status</h3>
        <p style={{ fontSize: '12px', color: '#94a3b8', marginTop: '4px' }}>Sorted by stockout risk</p>
      </div>

      <div style={{ overflowX: 'auto', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
          <thead>
            <tr>
              <th style={th}>Product</th>
              <th style={th}>Code</th>
              <th style={th}><SortBtn col="dos" label="DOS" /></th>
              <th style={th}><SortBtn col="current_stock" label="Stock" /></th>
              <th style={th}><SortBtn col="stockout_probability_30d" label="Risk 30d" /></th>
              <th style={th}><SortBtn col="expiry_risk_score" label="Expiry" /></th>
              <th style={th}>Class</th>
              <th style={th}>Status</th>
            </tr>
          </thead>
          <tbody>
            {loading
              ? Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i} style={{ borderTop: '1px solid #f1f5f9' }}>
                    {Array.from({ length: 8 }).map((_, j) => (
                      <td key={j} style={{ padding: '12px 16px' }}>
                        <Skeleton className="h-3 w-full" />
                      </td>
                    ))}
                  </tr>
                ))
              : sorted.map((sku) => {
                  const isSelected = sku.sku_id === selectedSkuId
                  return (
                    <tr
                      key={sku.sku_id}
                      onClick={() => onSelectSku(sku.sku_id)}
                      style={{
                        borderTop: '1px solid #f1f5f9',
                        cursor: 'pointer',
                        backgroundColor: isSelected ? 'rgba(0,212,180,0.06)' : 'transparent',
                        transition: 'background 0.12s',
                      }}
                      onMouseEnter={(e) => {
                        if (!isSelected)
                          (e.currentTarget as HTMLTableRowElement).style.backgroundColor = '#f8fafc'
                      }}
                      onMouseLeave={(e) => {
                        ;(e.currentTarget as HTMLTableRowElement).style.backgroundColor = isSelected
                          ? 'rgba(0,212,180,0.06)'
                          : 'transparent'
                      }}
                    >
                      <td style={{ padding: '12px 16px' }}>
                        <p style={{ fontWeight: 500, color: '#0f172a', margin: 0 }}>
                          {sku.sku_name.split(' (')[0]}
                        </p>
                      </td>
                      <td style={{ padding: '12px 16px', color: '#64748b', fontSize: '12px' }}>
                        {sku.atc_code}
                      </td>
                      <td style={{ padding: '12px 16px' }}>{dosPill(sku.dos)}</td>
                      <td style={{ padding: '12px 16px', color: '#0f172a', fontWeight: 500 }}>
                        {fmtNum(sku.current_stock, 0)}
                      </td>
                      <td style={{ padding: '12px 16px', fontWeight: 600, color: riskColor(sku.stockout_probability_30d) }}>
                        {fmtNum(sku.stockout_probability_30d * 100, 0)}%
                      </td>
                      <td style={{ padding: '12px 16px', color: '#64748b' }}>
                        {fmtNum(sku.expiry_risk_score * 100, 0)}%
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <span style={{
                          background: 'rgba(0,212,180,0.12)', color: '#00D4B4',
                          fontSize: '11px', fontWeight: 700,
                          padding: '2px 8px', borderRadius: '6px',
                        }}>
                          {sku.abc_class}{sku.xyz_class}
                        </span>
                      </td>
                      <td style={{ padding: '12px 16px' }}>{statusBadge(sku.status)}</td>
                    </tr>
                  )
                })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ------------------------------------------------------------------ //
// Safety Stock Calculator                                              //
// ------------------------------------------------------------------ //

const Z_CLIENT: Record<number, number> = {
  80: 0.842, 85: 1.036, 90: 1.282, 91: 1.341, 92: 1.405, 93: 1.476,
  94: 1.555, 95: 1.645, 96: 1.751, 97: 1.881, 98: 2.054, 99: 2.326,
}

interface SafetyStockCalcProps {
  skus: InventorySKU[]
  selectedSkuId: number | null
  onSelectSku: (id: number) => void
}

function SafetyStockCalculator({ skus, selectedSkuId, onSelectSku }: SafetyStockCalcProps) {
  const [serviceLevel, setServiceLevel] = useState(95)
  const [ssData, setSsData] = useState<SafetyStockResult | null>(null)
  const [loading, setLoading] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const fetchSS = useCallback(
    (skuId: number, sl: number) => {
      setLoading(true)
      inventoryApi
        .getSafetyStock(skuId, sl / 100)
        .then((r) => setSsData(r.data))
        .catch(console.error)
        .finally(() => setLoading(false))
    },
    [],
  )

  useEffect(() => {
    if (!selectedSkuId) return
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => fetchSS(selectedSkuId, serviceLevel), 300)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [selectedSkuId, serviceLevel, fetchSS])

  const demandStd = ssData?.demand_std ?? 0
  const chartData = [90, 91, 92, 93, 94, 95, 96, 97, 98, 99].map((sl) => ({
    sl: `${sl}%`,
    units: Math.round((Z_CLIENT[sl] ?? 1.645) * demandStd * Math.sqrt(14)),
    current: sl === serviceLevel,
  }))

  return (
    <div>
      <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#0f172a', marginBottom: '16px', marginTop: 0 }}>
        Safety Stock Calculator
      </h3>

      {/* SKU dropdown */}
      <select
        value={selectedSkuId ?? ''}
        onChange={(e) => onSelectSku(Number(e.target.value))}
        style={{
          width: '100%', border: '1px solid #e2e8f0', borderRadius: '10px',
          padding: '10px 14px', fontSize: '14px', color: '#0f172a',
          background: '#fff', outline: 'none', cursor: 'pointer',
          appearance: 'none',
        }}
      >
        <option value="" disabled>Select a product…</option>
        {skus.map((s) => (
          <option key={s.sku_id} value={s.sku_id}>
            {s.atc_code} — {s.sku_name.split(' (')[0]}
          </option>
        ))}
      </select>

      {/* Service level slider */}
      <div style={{ marginTop: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
          <span style={{ fontSize: '13px', color: '#64748b' }}>Service Level</span>
          <span style={{ fontSize: '22px', fontWeight: 700, color: '#00D4B4', lineHeight: 1 }}>{serviceLevel}%</span>
        </div>
        <input
          type="range"
          min={90}
          max={99}
          value={serviceLevel}
          onChange={(e) => setServiceLevel(Number(e.target.value))}
          style={{ width: '100%', accentColor: '#00D4B4', margin: '8px 0' }}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#94a3b8' }}>
          <span>90%</span><span>99%</span>
        </div>
      </div>

      {/* Result box */}
      {selectedSkuId && (
        <div style={{
          background: '#f0fdf9', border: '1px solid rgba(0,212,180,0.25)',
          borderRadius: '12px', padding: '16px', marginTop: '16px',
        }}>
          <p style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#64748b', marginBottom: '8px' }}>
            Recommended Safety Stock
          </p>
          <p style={{ fontSize: '40px', fontWeight: 700, color: '#00D4B4', lineHeight: 1, marginBottom: '4px' }}>
            {loading ? '…' : fmtNum(ssData?.safety_stock_units, 0)}
          </p>
          <p style={{ fontSize: '12px', color: '#64748b', marginBottom: '12px' }}>units</p>
          <div style={{ display: 'flex', gap: '8px' }}>
            <div style={{ flex: 1, background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '8px 12px' }}>
              <p style={{ fontSize: '10px', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>Lead Time</p>
              <p style={{ fontSize: '16px', fontWeight: 600, color: '#0f172a' }}>{ssData?.lead_time_days ?? 14}d</p>
            </div>
            <div style={{ flex: 1, background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '8px 12px' }}>
              <p style={{ fontSize: '10px', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>Demand Std</p>
              <p style={{ fontSize: '16px', fontWeight: 600, color: '#0f172a' }}>{fmtNum(demandStd, 1)}</p>
            </div>
          </div>
        </div>
      )}

      {/* Service level tradeoff chart */}
      {selectedSkuId && demandStd > 0 && (
        <div style={{ marginTop: '20px' }}>
          <p style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#94a3b8', marginBottom: '10px' }}>
            Service Level Tradeoff
          </p>
          <ResponsiveContainer width="100%" height={140}>
            <LineChart data={chartData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="2 2" stroke="#f1f5f9" />
              <XAxis dataKey="sl" tick={{ fontSize: 9, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 9, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
              <Tooltip
                contentStyle={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 11, boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}
                labelStyle={{ color: '#0f172a' }}
                itemStyle={{ color: '#00D4B4' }}
              />
              <Line
                dataKey="units"
                name="Safety stock"
                stroke="#00D4B4"
                strokeWidth={2}
                dot={(props: { cx: number; cy: number; index: number }) => {
                  const isCurrent = chartData[props.index]?.current
                  return (
                    <circle
                      key={props.index}
                      cx={props.cx}
                      cy={props.cy}
                      r={isCurrent ? 5 : 2.5}
                      fill={isCurrent ? '#FF6B35' : '#00D4B4'}
                      stroke="#fff"
                      strokeWidth={isCurrent ? 2 : 0}
                    />
                  )
                }}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {ssData?.explanation && (
        <p style={{ marginTop: '12px', fontSize: '11px', color: '#94a3b8', lineHeight: 1.6 }}>
          {ssData.explanation}
        </p>
      )}
    </div>
  )
}

// ------------------------------------------------------------------ //
// Stockout Probability Panel                                           //
// ------------------------------------------------------------------ //

interface StockoutPanelProps {
  detail: SKUDetail | null
  loading: boolean
}

function StockoutPanel({ detail, loading }: StockoutPanelProps) {
  const gauges = [
    { label: '30 Days', value: detail?.stockout_probability['30d'] ?? null },
    { label: '60 Days', value: detail?.stockout_probability['60d'] ?? null },
    { label: '90 Days', value: detail?.stockout_probability['90d'] ?? null },
  ]

  return (
    <div>
      <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#0f172a', marginBottom: '16px', marginTop: 0 }}>
        Stockout Probability
      </h3>

      {!detail && !loading && (
        <p style={{ fontSize: '13px', color: '#94a3b8', textAlign: 'center', padding: '20px 0' }}>
          Select a product from the table above
        </p>
      )}

      <div>
        {gauges.map(({ label, value }, idx) => {
          const pct = value !== null ? value * 100 : null
          const color = pct !== null ? riskColor(value!) : '#cbd5e1'
          return (
            <div
              key={label}
              style={{
                paddingTop: idx > 0 ? '18px' : 0,
                paddingBottom: '18px',
                borderBottom: idx < 2 ? '1px solid #f1f5f9' : 'none',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                <span style={{ fontSize: '14px', fontWeight: 500, color: '#64748b' }}>{label}</span>
                {loading || pct === null ? (
                  <Skeleton className="h-10 w-20" />
                ) : (
                  <span style={{ fontSize: '48px', fontWeight: 700, color, lineHeight: 1 }}>
                    {fmtNum(pct, 0)}%
                  </span>
                )}
              </div>
              {/* Progress bar */}
              <div style={{ height: '5px', background: '#f1f5f9', borderRadius: '999px', overflow: 'hidden' }}>
                <div
                  style={{
                    height: '100%',
                    width: pct !== null ? `${Math.min(pct, 100)}%` : '0%',
                    background: color,
                    borderRadius: '999px',
                    transition: 'width 0.6s ease',
                  }}
                />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ------------------------------------------------------------------ //
// Expiry Risk Chart                                                    //
// ------------------------------------------------------------------ //

interface ExpiryChartProps {
  skus: InventorySKU[]
  loading: boolean
}

function ExpiryRiskChart({ skus, loading }: ExpiryChartProps) {
  const ATC_PRICES_CLIENT: Record<string, number> = {
    M01AB: 45, M01AE: 38, N02BE: 12, N02BA: 8, N02AA: 95, R03: 67, N05B: 55, N05C: 48, R06: 35,
  }

  const data = skus
    .filter((s) => s.units_at_risk > 0)
    .map((s) => ({
      name: s.atc_code,
      value: Math.round(s.units_at_risk * (ATC_PRICES_CLIENT[s.atc_code] ?? 20)),
      units: s.units_at_risk,
    }))
    .sort((a, b) => b.value - a.value)

  return (
    <div>
      <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#0f172a', marginBottom: '16px', marginTop: 0 }}>
        Expiry Risk — Value at Risk
      </h3>
      {loading ? (
        <Skeleton className="h-32 w-full" />
      ) : data.length === 0 ? (
        <p style={{ textAlign: 'center', fontSize: '13px', color: '#94a3b8', padding: '20px 0' }}>
          No expiry risk detected
        </p>
      ) : (
        <>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={data} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="2 2" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
              <YAxis
                tick={{ fontSize: 9, fill: '#94a3b8' }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}K`}
              />
              <Tooltip
                contentStyle={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 11, boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}
                labelStyle={{ color: '#0f172a' }}
                formatter={(value: number, _name: string, props: { payload?: { units: number } }) => [
                  `${fmtCurrency(value)} (${fmtNum(props.payload?.units ?? 0, 0)} units)`,
                  'Value at Risk',
                ]}
              />
              <Bar dataKey="value" fill="#FF6B35" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
          <div style={{ marginTop: '8px', textAlign: 'right', fontSize: '12px', color: '#64748b' }}>
            Total at risk:{' '}
            <strong style={{ color: '#FF6B35' }}>
              {fmtCurrency(data.reduce((s, d) => s + d.value, 0))}
            </strong>
          </div>
        </>
      )}
    </div>
  )
}

// ------------------------------------------------------------------ //
// Main page                                                            //
// ------------------------------------------------------------------ //

export default function InventoryIntelligence() {
  const [health, setHealth] = useState<InventoryHealthData | null>(null)
  const [skus, setSkus] = useState<InventorySKU[]>([])
  const [abcxyz, setAbcxyz] = useState<ABCXYZItem[]>([])
  const [detail, setDetail] = useState<SKUDetail | null>(null)
  const [loadingMain, setLoadingMain] = useState(true)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [selectedCell, setSelectedCell] = useState<string | null>(null)
  const [selectedSkuId, setSelectedSkuId] = useState<number | null>(null)

  // Load health + skus + abc-xyz in parallel on mount
  useEffect(() => {
    setLoadingMain(true)
    Promise.all([
      inventoryApi.getHealth(),
      inventoryApi.listSKUs(),
      inventoryApi.getABCXYZ(),
    ])
      .then(([hRes, sRes, azRes]) => {
        setHealth(hRes.data)
        setSkus(sRes.data)
        setAbcxyz(azRes.data)
        if (sRes.data.length > 0) setSelectedSkuId(sRes.data[0].sku_id)
      })
      .catch(console.error)
      .finally(() => setLoadingMain(false))
  }, [])

  // Load SKU detail when selection changes
  useEffect(() => {
    if (!selectedSkuId) return
    setLoadingDetail(true)
    setDetail(null)
    inventoryApi
      .getSKUDetail(selectedSkuId)
      .then((r) => setDetail(r.data))
      .catch(console.error)
      .finally(() => setLoadingDetail(false))
  }, [selectedSkuId])

  const card: CSSProperties = {
    backgroundColor: '#ffffff',
    border: '1px solid #e2e8f0',
    borderRadius: '16px',
    padding: '24px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
  }

  return (
    <div style={{ background: '#f8fafc', minHeight: '100%', padding: '24px' }}>

      {/* ── Section 1: KPI Strip ───────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '16px', marginBottom: '20px' }}>
        {loadingMain
          ? Array.from({ length: 5 }).map((_, i) => (
              <div key={i} style={{ ...card, height: '104px' }}>
                <Skeleton className="h-full w-full" />
              </div>
            ))
          : health
          ? (
            <>
              <HealthCard label="Total SKUs"       value={health.total_skus}          badge="none"  delay={0}    />
              <HealthCard label="Stockout Risk"     value={health.stockout_risk_count} badge={health.stockout_risk_count > 0 ? 'red'   : 'teal'} delay={0.05} />
              <HealthCard label="Expiry Risk"       value={health.expiry_risk_count}   badge={health.expiry_risk_count   > 0 ? 'amber' : 'teal'} delay={0.1}  />
              <HealthCard label="Overstock (>120d)" value={health.overstock_count}     badge={health.overstock_count     > 0 ? 'amber' : 'teal'} delay={0.15} />
              <HealthCard label="Avg DOS"           value={`${health.avg_dos}d`}       badge="teal"  delay={0.2}  />
            </>
          )
          : null}
      </div>

      {/* ── Section 2: Matrix + Table ──────────────────────────────── */}
      <div style={{ display: 'flex', gap: '20px', marginBottom: '20px' }}>
        {/* Left: ABC-XYZ matrix */}
        <div style={{ ...card, flex: 1, minWidth: 0 }}>
          <AnimatePresence>
            {!loadingMain && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}>
                <ABCXYZMatrix items={abcxyz} selectedCell={selectedCell} onCellClick={setSelectedCell} />
              </motion.div>
            )}
          </AnimatePresence>
          {loadingMain && <Skeleton className="h-48 w-full rounded-xl" />}
        </div>

        {/* Right: SKU table */}
        <div style={{ ...card, flex: 1, minWidth: 0 }}>
          <SKUTable
            skus={skus}
            loading={loadingMain}
            selectedCell={selectedCell}
            selectedSkuId={selectedSkuId}
            onSelectSku={setSelectedSkuId}
          />
        </div>
      </div>

      {/* ── Section 3: Calculator + Stockout + Expiry ─────────────── */}
      <div style={{ display: 'flex', gap: '20px' }}>
        <div style={{ ...card, flex: 1, minWidth: 0 }}>
          <SafetyStockCalculator skus={skus} selectedSkuId={selectedSkuId} onSelectSku={setSelectedSkuId} />
        </div>
        <div style={{ ...card, flex: 1, minWidth: 0 }}>
          <StockoutPanel detail={detail} loading={loadingDetail} />
        </div>
        <div style={{ ...card, flex: 1, minWidth: 0 }}>
          <ExpiryRiskChart skus={skus} loading={loadingMain} />
        </div>
      </div>

    </div>
  )
}
