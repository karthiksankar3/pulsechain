import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Area,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  CartesianGrid,
} from 'recharts'
import {
  forecastApi,
  type ModelAccuracy,
  type PortfolioItem,
  type SKUChartData,
  type SKUResponse,
} from '../../services/api'
import { useForecastStore } from '../../store'

// ------------------------------------------------------------------ //
// Types                                                               //
// ------------------------------------------------------------------ //

interface ChartRow {
  date: string
  actual: number | null
  forecast: number | null
  lower: number | null
  upper: number | null
  band: number | null
}

type TimeRange = '1M' | '2M' | '3M' | '6M' | '1Y' | '2Y'
type ModelKey = 'prophet' | 'arima' | 'xgboost' | 'ensemble'

const TIME_RANGE_DAYS: Record<TimeRange, { historicalDays: number; forecastDays: number }> = {
  '1M': { historicalDays: 30, forecastDays: 30 },
  '2M': { historicalDays: 60, forecastDays: 30 },
  '3M': { historicalDays: 90, forecastDays: 90 },
  '6M': { historicalDays: 180, forecastDays: 90 },
  '1Y': { historicalDays: 365, forecastDays: 90 },
  '2Y': { historicalDays: 730, forecastDays: 90 },
}

function getTimeRanges(availableDays: number): TimeRange[] {
  return (Object.keys(TIME_RANGE_DAYS) as TimeRange[]).filter(
    (r) => TIME_RANGE_DAYS[r].historicalDays <= availableDays,
  )
}

function getDefaultRange(availableDays: number): TimeRange {
  const ranges = getTimeRanges(availableDays)
  if (ranges.length === 0) return '3M'
  const preferred: TimeRange[] = ['1Y', '6M', '3M', '2M', '1M', '2Y']
  return preferred.find((r) => ranges.includes(r)) ?? ranges[ranges.length - 1]
}

const MODELS: { key: ModelKey; label: string }[] = [
  { key: 'prophet', label: 'Prophet' },
  { key: 'arima', label: 'ARIMA' },
  { key: 'xgboost', label: 'XGBoost' },
  { key: 'ensemble', label: 'Ensemble' },
]

// ------------------------------------------------------------------ //
// Helpers                                                             //
// ------------------------------------------------------------------ //

function mapeColor(mape: number | null): string {
  if (mape === null) return '#94a3b8'
  if (mape < 15) return '#10b981'
  if (mape < 25) return '#f59e0b'
  return '#ef4444'
}

function fmtNum(n: number | null | undefined, decimals = 1): string {
  if (n === null || n === undefined) return '—'
  return n.toFixed(decimals)
}

function fmtDate(dateStr: string): string {
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })
}

function buildChartData(data: SKUChartData, range: TimeRange): ChartRow[] {
  const { historicalDays, forecastDays } = TIME_RANGE_DAYS[range]

  const historical: ChartRow[] = data.historical
    .slice(-historicalDays)
    .map((h) => ({ date: h.date, actual: h.actual, forecast: null, lower: null, upper: null, band: null }))

  const forecastRows: ChartRow[] = data.forecast.slice(0, forecastDays).map((f) => ({
    date: f.date,
    actual: null,
    forecast: f.forecast,
    lower: f.lower,
    upper: f.upper,
    band: Math.max(f.upper - f.lower, 0),
  }))

  return [...historical, ...forecastRows]
}

const today = new Date().toISOString().split('T')[0]

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
  letterSpacing: '0.08em', color: '#94a3b8', display: 'block', marginBottom: '6px',
}

// ------------------------------------------------------------------ //
// Tooltip                                                             //
// ------------------------------------------------------------------ //

interface CustomTooltipProps {
  active?: boolean
  payload?: Array<{ name: string; value: number | null; color: string }>
  label?: string
}

function ChartTooltip({ active, payload, label }: CustomTooltipProps) {
  if (!active || !payload?.length || !label) return null
  return (
    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: '8px 12px', fontSize: 11, boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
      <p style={{ fontWeight: 600, color: '#0f172a', marginBottom: 4 }}>{fmtDate(label)}</p>
      {payload.map((p) =>
        p.value !== null ? (
          <p key={p.name} style={{ color: p.color, margin: '2px 0' }}>
            {p.name}: <span style={{ fontWeight: 600 }}>{fmtNum(p.value, 2)}</span>
          </p>
        ) : null,
      )}
    </div>
  )
}

// ------------------------------------------------------------------ //
// Metric card                                                          //
// ------------------------------------------------------------------ //

interface MetricCardProps {
  label: string
  value: number | null
  unit?: string
  colorFn?: (v: number | null) => string
  showArrow?: boolean
  subtext?: string
}

function MetricCard({ label, value, unit = '%', colorFn = mapeColor, showArrow = false, subtext }: MetricCardProps) {
  const color = colorFn(value)
  const arrow = value !== null && showArrow
    ? value > 0 ? ' ↑' : value < 0 ? ' ↓' : ' →'
    : ''

  return (
    <div style={{ ...card, padding: '20px' }}>
      <p style={labelStyle}>{label}</p>
      <p style={{ fontSize: '42px', fontWeight: 700, lineHeight: 1, marginTop: '8px', color }}>
        {fmtNum(value)}{unit}{arrow}
      </p>
      {subtext && <p style={{ fontSize: '12px', color: '#94a3b8', marginTop: '6px' }}>{subtext}</p>}
    </div>
  )
}

// ------------------------------------------------------------------ //
// Main page                                                            //
// ------------------------------------------------------------------ //

export default function ForecastEngine() {
  const { selectedSkuId, selectedModel, timeRange, setSelectedSkuId, setSelectedModel, setTimeRange } =
    useForecastStore()

  const [skus, setSkus] = useState<SKUResponse[]>([])
  const [chartData, setChartData] = useState<SKUChartData | null>(null)
  const [accuracy, setAccuracy] = useState<ModelAccuracy[] | null>(null)
  const [portfolio, setPortfolio] = useState<PortfolioItem[]>([])

  const [loadingSkus, setLoadingSkus] = useState(true)
  const [loadingChart, setLoadingChart] = useState(false)
  const [loadingAccuracy, setLoadingAccuracy] = useState(false)
  const [running, setRunning] = useState(false)

  const abortRef = useRef<AbortController | null>(null)
  const prevSkuIdRef = useRef<number | null>(null)
  const resetRangeRef = useRef(false)

  useEffect(() => {
    setLoadingSkus(true)
    Promise.all([forecastApi.listSkus(), forecastApi.getPortfolio()])
      .then(([skuRes, portRes]) => {
        setSkus(skuRes.data)
        setPortfolio(portRes.data)
        if (!selectedSkuId && skuRes.data.length > 0) {
          setSelectedSkuId(skuRes.data[0].id)
        }
      })
      .catch(console.error)
      .finally(() => setLoadingSkus(false))
  }, [])

  useEffect(() => {
    if (!selectedSkuId) return
    if (prevSkuIdRef.current !== selectedSkuId) {
      resetRangeRef.current = true
    }
    prevSkuIdRef.current = selectedSkuId
    abortRef.current?.abort()
    abortRef.current = new AbortController()
    setLoadingChart(true)
    setChartData(null)
    forecastApi
      .getLatest(selectedSkuId, selectedModel, 90)
      .then((res) => {
        setChartData(res.data)
        if (resetRangeRef.current) {
          setTimeRange(getDefaultRange(res.data.historical.length))
          resetRangeRef.current = false
        }
      })
      .catch((err) => { if (err.name !== 'CanceledError') console.error(err) })
      .finally(() => setLoadingChart(false))
    setLoadingAccuracy(true)
    setAccuracy(null)
    forecastApi
      .getAccuracy(selectedSkuId)
      .then((res) => setAccuracy(res.data.models))
      .catch(console.error)
      .finally(() => setLoadingAccuracy(false))
  }, [selectedSkuId, selectedModel])

  function handleRunForecast() {
    if (!selectedSkuId) return
    setRunning(true)
    forecastApi
      .runForecast(selectedSkuId, selectedModel, 90)
      .then(() => forecastApi.getLatest(selectedSkuId, selectedModel, 90))
      .then((res) => setChartData(res.data))
      .catch(console.error)
      .finally(() => setRunning(false))
  }

  const selectedSku = skus.find((s) => s.id === selectedSkuId) ?? null
  const availableDays = chartData ? chartData.historical.length : 365
  const availableRanges = getTimeRanges(availableDays)
  const rows = chartData ? buildChartData(chartData, timeRange) : []
  const current = accuracy?.find((m) => m.model_name === selectedModel) ?? null
  const best = accuracy?.length ? accuracy.reduce((a, b) => (a.mape < b.mape ? a : b), accuracy[0]) : null

  const tabActive: CSSProperties = {
    backgroundColor: '#00D4B4', color: '#fff', fontWeight: 600,
    padding: '7px 16px', borderRadius: '8px', border: 'none', cursor: 'pointer', fontSize: '13px',
  }
  const tabInactive: CSSProperties = {
    backgroundColor: '#f1f5f9', color: '#64748b', fontWeight: 500,
    padding: '7px 16px', borderRadius: '8px', border: 'none', cursor: 'pointer', fontSize: '13px',
    transition: 'background 0.15s',
  }
  const th: CSSProperties = {
    padding: '10px 16px', textAlign: 'left', fontSize: '11px', fontWeight: 600,
    textTransform: 'uppercase', letterSpacing: '0.06em', color: '#94a3b8',
    background: '#f8fafc', borderBottom: '1px solid #e2e8f0', whiteSpace: 'nowrap',
  }

  return (
    <div style={{ background: '#f8fafc', minHeight: '100%', padding: '24px' }}>

      {/* ── ROW 1: Controls bar ───────────────────────────────────── */}
      <div style={{ ...card, padding: '20px', display: 'flex', alignItems: 'center', gap: '24px', marginBottom: '20px', flexWrap: 'wrap' }}>
        {/* Drug selector */}
        <div>
          <span style={labelStyle}>Product / SKU</span>
          <select
            value={selectedSkuId ?? ''}
            onChange={(e) => setSelectedSkuId(Number(e.target.value))}
            disabled={loadingSkus}
            style={{
              border: '1px solid #e2e8f0', borderRadius: '10px',
              padding: '10px 16px', fontSize: '14px', color: '#0f172a',
              background: '#fff', outline: 'none', cursor: 'pointer',
              minWidth: '280px', appearance: 'none',
            }}
          >
            {loadingSkus
              ? <option>Loading…</option>
              : skus.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name.split(' (')[0]} ({s.atc_code})
                  </option>
                ))}
          </select>
        </div>

        <div style={{ width: 1, height: 40, background: '#e2e8f0', flexShrink: 0 }} />

        {/* Model tabs */}
        <div>
          <span style={labelStyle}>Model</span>
          <div style={{ display: 'flex', gap: '4px' }}>
            {MODELS.map((m) => (
              <button
                key={m.key}
                onClick={() => setSelectedModel(m.key)}
                style={selectedModel === m.key ? tabActive : tabInactive}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        <div style={{ width: 1, height: 40, background: '#e2e8f0', flexShrink: 0 }} />

        {/* Time range tabs */}
        <div>
          <span style={labelStyle}>Time Range</span>
          <div style={{ display: 'flex', gap: '4px' }}>
            {availableRanges.map((r) => (
              <button
                key={r}
                onClick={() => setTimeRange(r)}
                style={timeRange === r ? tabActive : tabInactive}
              >
                {r}
              </button>
            ))}
          </div>
        </div>

        {/* Run button pushed to right */}
        <div style={{ marginLeft: 'auto' }}>
          <button
            onClick={handleRunForecast}
            disabled={running || !selectedSku}
            style={{
              backgroundColor: '#00D4B4', color: '#0A1628', fontWeight: 700,
              padding: '10px 24px', borderRadius: '12px', border: 'none',
              cursor: running || !selectedSku ? 'not-allowed' : 'pointer',
              opacity: running || !selectedSku ? 0.5 : 1,
              fontSize: '14px', display: 'flex', alignItems: 'center', gap: 8,
              transition: 'opacity 0.15s',
            }}
          >
            {running && (
              <span style={{ width: 14, height: 14, borderRadius: '50%', border: '2px solid #0A1628', borderTopColor: 'transparent', display: 'inline-block', animation: 'spin 0.7s linear infinite' }} />
            )}
            {running ? 'Running…' : 'Run Forecast'}
          </button>
        </div>
      </div>

      {/* ── ROW 2: Main chart ─────────────────────────────────────── */}
      <div style={{ ...card, padding: '24px', marginBottom: '20px' }}>
        {/* Card header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '20px' }}>
          <div>
            {selectedSku ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '20px', fontWeight: 700, color: '#0f172a' }}>
                  {selectedSku.name.split(' (')[0]}
                </span>
                <span style={{
                  fontSize: '11px', fontWeight: 600, padding: '3px 10px',
                  background: '#f1f5f9', color: '#64748b', borderRadius: '6px',
                }}>
                  {selectedSku.atc_code}
                </span>
              </div>
            ) : (
              <p style={{ color: '#94a3b8', fontSize: '14px' }}>Select a product to view forecast</p>
            )}
            <p style={{ fontSize: '12px', color: '#94a3b8', marginTop: '4px' }}>
              Historical actuals + 90-day forecast with confidence band
            </p>
          </div>
          {chartData?.mape != null && (
            <div style={{ textAlign: 'right' }}>
              <p style={{ fontSize: '12px', color: '#94a3b8' }}>Holdout MAPE</p>
              <p style={{ fontSize: '22px', fontWeight: 700, color: mapeColor(chartData.mape) }}>
                {fmtNum(chartData.mape)}%
              </p>
            </div>
          )}
        </div>

        {/* Chart */}
        {loadingChart ? (
          <div className="animate-pulse bg-slate-100 rounded-xl" style={{ height: 380, width: '100%' }} />
        ) : !selectedSku ? (
          <div style={{ height: 380, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12 }}>
            <div style={{ fontSize: 48, opacity: 0.2 }}>📈</div>
            <p style={{ color: '#94a3b8', fontSize: 14 }}>Select a product above to load the forecast</p>
          </div>
        ) : rows.length === 0 ? (
          <div style={{ height: 380, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <p style={{ color: '#94a3b8', fontSize: 14 }}>No data available</p>
          </div>
        ) : (
          <AnimatePresence mode="wait">
            <motion.div
              key={`${chartData?.sku_id}-${selectedModel}-${timeRange}`}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
            >
              <ResponsiveContainer width="100%" height={380}>
                <ComposedChart data={rows} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
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
                    width={48}
                  />
                  <Tooltip content={<ChartTooltip />} />
                  <Area dataKey="lower" name="Lower bound" stackId="conf" stroke="none" fill="transparent" isAnimationActive={false} legendType="none" />
                  <Area dataKey="band" name="Confidence" stackId="conf" stroke="none" fill="rgba(255,107,53,0.12)" isAnimationActive={false} legendType="none" />
                  <Area dataKey="actual" name="Actual" stroke="#00D4B4" strokeWidth={2} fill="rgba(0,212,180,0.08)" dot={false} activeDot={{ r: 4, fill: '#00D4B4' }} isAnimationActive animationDuration={600} />
                  <Line dataKey="forecast" name="Forecast" stroke="#1e293b" strokeWidth={2} strokeDasharray="6 3" dot={false} activeDot={{ r: 4, fill: '#1e293b' }} isAnimationActive animationDuration={600} />
                  <ReferenceLine
                    x={today}
                    stroke="rgba(255,107,53,0.6)"
                    strokeDasharray="4 4"
                    label={{ value: 'Today', position: 'top', fill: '#FF6B35', fontSize: 10 }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </motion.div>
          </AnimatePresence>
        )}

        {/* Legend */}
        <div style={{ display: 'flex', gap: '20px', marginTop: '16px', paddingTop: '12px', borderTop: '1px solid #f1f5f9' }}>
          {[
            { color: '#00D4B4', dash: false, label: 'Actuals' },
            { color: '#1e293b', dash: true, label: 'Forecast' },
            { color: 'rgba(255,107,53,0.4)', dash: false, label: 'Confidence Band', area: true },
          ].map((l) => (
            <span key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#64748b' }}>
              {l.area ? (
                <span style={{ width: 16, height: 10, background: l.color, borderRadius: 2, display: 'inline-block' }} />
              ) : (
                <span style={{ width: 20, height: 2, background: l.dash ? `repeating-linear-gradient(to right, ${l.color} 0, ${l.color} 5px, transparent 5px, transparent 9px)` : l.color, display: 'inline-block', borderRadius: 1 }} />
              )}
              {l.label}
            </span>
          ))}
        </div>
      </div>

      {/* ── ROW 3: 4 KPI metric cards ─────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '20px', marginBottom: '20px' }}>
        {loadingAccuracy ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} style={{ ...card, padding: '20px', height: '100px' }}>
              <div className="animate-pulse bg-slate-100 rounded-lg" style={{ height: '100%' }} />
            </div>
          ))
        ) : (
          <>
            <MetricCard
              label="MAPE"
              value={current?.mape ?? null}
              colorFn={mapeColor}
              subtext="Mean Absolute % Error"
            />
            <MetricCard
              label="WMAPE"
              value={current?.wmape ?? null}
              colorFn={mapeColor}
              subtext="Weighted MAPE"
            />
            <MetricCard
              label="Bias"
              value={current?.bias ?? null}
              unit=""
              showArrow
              colorFn={(v) => v === null ? '#94a3b8' : v > 0 ? '#ef4444' : v < 0 ? '#3b82f6' : '#94a3b8'}
              subtext="Systematic over/under forecast"
            />
            <MetricCard
              label="RMSE"
              value={current?.rmse ?? null}
              unit=""
              colorFn={() => '#0f172a'}
              subtext="Root Mean Square Error"
            />
          </>
        )}
      </div>

      {/* ── ROW 4: Model comparison + Portfolio ────────────────────── */}
      <div style={{ display: 'flex', gap: '20px' }}>
        {/* Model comparison */}
        <div style={{ ...card, flex: 1, minWidth: 0, padding: '24px' }}>
          <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#0f172a', marginBottom: '16px', marginTop: 0 }}>
            Model Comparison
          </h3>
          <div style={{ overflowX: 'auto', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr>
                  <th style={th}>Model</th>
                  <th style={{ ...th, textAlign: 'right' }}>MAPE</th>
                  <th style={{ ...th, textAlign: 'right' }}>Bias</th>
                  <th style={{ ...th, textAlign: 'center' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {loadingAccuracy
                  ? Array.from({ length: 4 }).map((_, i) => (
                      <tr key={i} style={{ borderTop: '1px solid #f1f5f9' }}>
                        <td colSpan={4} style={{ padding: '12px 16px' }}>
                          <div className="animate-pulse bg-slate-100 rounded" style={{ height: 12 }} />
                        </td>
                      </tr>
                    ))
                  : accuracy?.map((m) => {
                      const isBest = best?.model_name === m.model_name
                      const isSelected = m.model_name === selectedModel
                      return (
                        <tr
                          key={m.model_name}
                          style={{
                            borderTop: '1px solid #f1f5f9',
                            backgroundColor: isSelected ? 'rgba(0,212,180,0.06)' : isBest ? '#f0fdf9' : 'transparent',
                            borderLeft: isBest ? '3px solid #00D4B4' : '3px solid transparent',
                          }}
                        >
                          <td style={{ padding: '12px 16px', fontWeight: 500, color: '#0f172a', textTransform: 'capitalize' }}>
                            {m.model_name}
                            {isBest && (
                              <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: '999px', background: 'rgba(0,212,180,0.15)', color: '#00D4B4' }}>
                                BEST
                              </span>
                            )}
                          </td>
                          <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 600, color: mapeColor(m.mape) }}>
                            {fmtNum(m.mape)}%
                          </td>
                          <td style={{ padding: '12px 16px', textAlign: 'right', color: '#64748b' }}>
                            {m.bias > 0 ? '+' : ''}{fmtNum(m.bias, 1)}
                          </td>
                          <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                            {isBest && (
                              <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 10px', borderRadius: '999px', background: 'rgba(0,212,180,0.12)', color: '#00D4B4', textTransform: 'uppercase' }}>
                                Recommended
                              </span>
                            )}
                          </td>
                        </tr>
                      )
                    })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Portfolio overview */}
        <div style={{ ...card, flex: 1, minWidth: 0, padding: '24px' }}>
          <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#0f172a', marginBottom: '4px', marginTop: 0 }}>
            Portfolio Overview
          </h3>
          <p style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '16px' }}>28-day demand forecast per SKU</p>
          <div>
            {portfolio.map((item, idx) => (
              <div
                key={item.id}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '12px 0',
                  borderBottom: idx < portfolio.length - 1 ? '1px solid #f1f5f9' : 'none',
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <p style={{ fontSize: '13px', fontWeight: 500, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 200 }}>
                    {item.name.split(' (')[0]}
                  </p>
                  <p style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>{item.atc_code}</p>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <p style={{ fontSize: '15px', fontWeight: 700, color: '#0f172a' }}>
                    {item.latest_forecast_28days !== null ? fmtNum(item.latest_forecast_28days, 0) : '—'}
                  </p>
                  <p style={{
                    fontSize: '12px', fontWeight: 600,
                    color: item.trend_direction === 'up' ? '#10b981' : item.trend_direction === 'down' ? '#ef4444' : '#94a3b8',
                  }}>
                    {item.trend_direction === 'up' ? '↑ Up' : item.trend_direction === 'down' ? '↓ Down' : '→ Stable'}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

    </div>
  )
}
