import { useEffect, useState, type CSSProperties } from 'react'
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  forecastApi,
  scenarioApi,
  type ScenarioResult,
  type ScenarioTemplate,
  type SKUResponse,
} from '../../services/api'

function fmtQty(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return n.toFixed(0)
}

function deltaColor(pct: number): string {
  if (pct > 5) return '#10b981'
  if (pct < -5) return '#ef4444'
  return '#94a3b8'
}

const card: CSSProperties = {
  backgroundColor: '#ffffff',
  border: '1px solid #e2e8f0',
  borderRadius: '16px',
  boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
}

interface ChartPoint {
  date: string
  baseline: number | null
  scenario: number | null
}

function ScenarioChart({ result, loading }: { result: ScenarioResult | null; loading: boolean }) {
  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
        <div style={{ width: 32, height: 32, borderRadius: '50%', border: '3px solid #e2e8f0', borderTopColor: '#00D4B4', animation: 'spin 0.8s linear infinite' }} />
      </div>
    )
  }

  if (!result) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 12 }}>
        <div style={{ fontSize: 48, opacity: 0.2 }}>📊</div>
        <p style={{ fontSize: 14, color: '#94a3b8', textAlign: 'center' }}>
          Select a SKU and scenario, then click Run Scenario
        </p>
      </div>
    )
  }

  const baseMap: Record<string, number> = {}
  result.baseline_forecast.forEach((p) => { baseMap[p.date] = p.quantity })

  const data: ChartPoint[] = result.scenario_forecast.map((p) => ({
    date: p.date.slice(5),
    baseline: baseMap[p.date] ?? null,
    scenario: p.quantity,
  }))

  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={data} margin={{ top: 8, right: 16, bottom: 4, left: -8 }}>
        <defs>
          <linearGradient id="gradBaseline" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#00D4B4" stopOpacity={0.15} />
            <stop offset="95%" stopColor="#00D4B4" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
        <XAxis dataKey="date" tick={{ fill: '#94a3b8', fontSize: 10 }} axisLine={false} tickLine={false} interval={13} />
        <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} axisLine={false} tickLine={false} />
        <Tooltip
          contentStyle={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}
          labelStyle={{ color: '#0f172a', fontWeight: 600 }}
          formatter={(val: number, name: string) => [fmtQty(val), name.charAt(0).toUpperCase() + name.slice(1)]}
        />
        <Area type="monotone" dataKey="baseline" fill="url(#gradBaseline)" stroke="#00D4B4" strokeWidth={2} dot={false} name="Baseline" />
        <Line type="monotone" dataKey="scenario" stroke="#FF6B35" strokeWidth={2} strokeDasharray="5 3" dot={false} name="Scenario" />
      </ComposedChart>
    </ResponsiveContainer>
  )
}

function CompareTable({ scenarios }: { scenarios: ScenarioResult[] }) {
  if (scenarios.length === 0) return null

  return (
    <div style={{ ...card, padding: '24px' }}>
      <p style={{ fontSize: 15, fontWeight: 600, color: '#0f172a', marginBottom: 16 }}>Scenario Comparison</p>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ backgroundColor: '#f8fafc' }}>
              {['Scenario', 'SKU', 'Impact %', 'Delta Units', 'Delta %'].map((h) => (
                <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#94a3b8', borderBottom: '1px solid #e2e8f0' }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {scenarios.map((s, i) => {
              const col = deltaColor(s.delta_pct)
              return (
                <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '12px 16px', color: '#64748b', textTransform: 'capitalize' }}>
                    {s.scenario_type.replace(/_/g, ' ')}
                  </td>
                  <td style={{ padding: '12px 16px', color: '#0f172a', fontWeight: 500 }}>{s.sku_name}</td>
                  <td style={{ padding: '12px 16px', color: col, fontWeight: 600 }}>
                    {s.impact_pct >= 0 ? '+' : ''}{s.impact_pct.toFixed(1)}%
                  </td>
                  <td style={{ padding: '12px 16px', color: col, fontWeight: 600, fontFamily: 'monospace' }}>
                    {s.delta_units >= 0 ? '+' : ''}{fmtQty(s.delta_units)}
                  </td>
                  <td style={{ padding: '12px 16px', color: col, fontWeight: 700 }}>
                    {s.delta_pct >= 0 ? '+' : ''}{s.delta_pct.toFixed(1)}%
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

const ICON_MAP: Record<string, string> = { up: '↑', down: '↓', neutral: '→' }

export default function ScenarioPlanning() {
  const [skus, setSkus] = useState<SKUResponse[]>([])
  const [templates, setTemplates] = useState<Record<string, ScenarioTemplate>>({})
  const [selectedSku, setSelectedSku] = useState<number | null>(null)
  const [selectedScenario, setSelectedScenario] = useState('')
  const [customImpact, setCustomImpact] = useState<number>(0)
  const [useCustom, setUseCustom] = useState(false)
  const [runLoading, setRunLoading] = useState(false)
  const [currentResult, setCurrentResult] = useState<ScenarioResult | null>(null)
  const [savedScenarios, setSavedScenarios] = useState<ScenarioResult[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([forecastApi.listSkus(), scenarioApi.getTemplates()]).then(([skusRes, templatesRes]) => {
      const skuList = skusRes.data
      setSkus(skuList)
      setTemplates(templatesRes.data)
      if (skuList.length > 0) setSelectedSku(skuList[0].id)
      const firstKey = Object.keys(templatesRes.data)[0]
      if (firstKey) setSelectedScenario(firstKey)
    })
  }, [])

  async function runScenario() {
    if (!selectedSku || !selectedScenario) return
    setRunLoading(true)
    setError(null)
    try {
      const res = await scenarioApi.runScenario(selectedSku, selectedScenario, useCustom ? customImpact : null)
      setCurrentResult(res.data)
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } }; message?: string }
      setError(err?.response?.data?.detail ?? err?.message ?? 'Run failed')
    } finally {
      setRunLoading(false)
    }
  }

  function addToCompare() {
    if (!currentResult) return
    if (savedScenarios.length >= 5) {
      setSavedScenarios((prev) => [...prev.slice(1), currentResult])
    } else {
      setSavedScenarios((prev) => [...prev, currentResult])
    }
  }

  const selectedTemplate = selectedScenario ? templates[selectedScenario] : null

  const selectStyle: CSSProperties = {
    padding: '8px 12px', borderRadius: 10, border: '1px solid #e2e8f0',
    fontSize: 13, color: '#0f172a', backgroundColor: '#fff', outline: 'none', cursor: 'pointer',
  }

  return (
    <div style={{ background: '#f8fafc', minHeight: '100%', padding: 24 }}>

      {/* Config bar */}
      <div style={{ ...card, padding: '20px 24px', marginBottom: 20, display: 'flex', alignItems: 'flex-end', gap: 20, flexWrap: 'wrap' }}>
        {/* SKU */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 180 }}>
          <label style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#94a3b8' }}>SKU</label>
          <select style={selectStyle} value={selectedSku ?? ''} onChange={(e) => setSelectedSku(Number(e.target.value))}>
            {skus.map((s) => (
              <option key={s.id} value={s.id}>{s.name} ({s.atc_code})</option>
            ))}
          </select>
        </div>

        {/* Scenario type */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 180 }}>
          <label style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#94a3b8' }}>Scenario</label>
          <select style={selectStyle} value={selectedScenario} onChange={(e) => { setSelectedScenario(e.target.value); setUseCustom(false) }}>
            {Object.entries(templates).map(([key, tmpl]) => (
              <option key={key} value={key}>{ICON_MAP[tmpl.icon] ?? '•'} {key.replace(/_/g, ' ')}</option>
            ))}
          </select>
        </div>

        {/* Default impact info */}
        {selectedTemplate && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#94a3b8' }}>Default Impact</span>
            <span style={{ fontSize: 20, fontWeight: 700, color: selectedTemplate.demand_impact >= 0 ? '#10b981' : '#ef4444' }}>
              {selectedTemplate.demand_impact >= 0 ? '+' : ''}{(selectedTemplate.demand_impact * 100).toFixed(0)}%
            </span>
          </div>
        )}

        {/* Custom impact slider */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 200 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#94a3b8', cursor: 'pointer' }}>
            <input type="checkbox" checked={useCustom} onChange={(e) => setUseCustom(e.target.checked)} />
            Custom Impact
          </label>
          {useCustom && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <input
                type="range" min={-100} max={500} step={5} value={customImpact}
                onChange={(e) => setCustomImpact(Number(e.target.value))}
                style={{ accentColor: '#00D4B4', width: '100%' }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#94a3b8' }}>
                <span>-100%</span>
                <span style={{ fontWeight: 700, color: customImpact >= 0 ? '#10b981' : '#ef4444' }}>
                  {customImpact >= 0 ? '+' : ''}{customImpact}%
                </span>
                <span>+500%</span>
              </div>
            </div>
          )}
        </div>

        {/* Run button */}
        <div style={{ marginLeft: 'auto', display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-end' }}>
          <button
            onClick={runScenario}
            disabled={runLoading || !selectedSku || !selectedScenario}
            style={{
              padding: '10px 24px', borderRadius: 10, border: 'none', cursor: runLoading ? 'not-allowed' : 'pointer',
              backgroundColor: '#00D4B4', color: '#0A1628', fontWeight: 700, fontSize: 14,
              opacity: (runLoading || !selectedSku || !selectedScenario) ? 0.5 : 1,
              whiteSpace: 'nowrap',
            }}
          >
            {runLoading ? 'Running…' : 'Run Scenario'}
          </button>
          {currentResult && (
            <button
              onClick={addToCompare}
              style={{ fontSize: 12, color: '#64748b', background: 'none', border: '1px solid #e2e8f0', borderRadius: 8, padding: '4px 12px', cursor: 'pointer' }}
            >
              + Add to Compare ({savedScenarios.length}/5)
            </button>
          )}
        </div>
      </div>

      {error && (
        <div style={{ marginBottom: 16, padding: '12px 16px', borderRadius: 10, backgroundColor: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#ef4444', fontSize: 13 }}>
          {error}
        </div>
      )}

      {/* Chart */}
      <div style={{ ...card, padding: 24, marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <p style={{ fontSize: 15, fontWeight: 600, color: '#0f172a' }}>Baseline vs Scenario Forecast</p>
          {currentResult && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 20, fontSize: 12, color: '#94a3b8' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ display: 'inline-block', width: 16, height: 2, backgroundColor: '#00D4B4', borderRadius: 2 }} />
                Baseline
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ display: 'inline-block', width: 16, height: 2, background: 'repeating-linear-gradient(to right,#FF6B35 0,#FF6B35 5px,transparent 5px,transparent 8px)' }} />
                Scenario
              </span>
            </div>
          )}
        </div>

        {currentResult && (
          <div style={{ display: 'flex', gap: 32, marginBottom: 16 }}>
            {[
              { label: 'Delta Units', value: (currentResult.delta_units >= 0 ? '+' : '') + fmtQty(currentResult.delta_units), color: deltaColor(currentResult.delta_pct) },
              { label: 'Delta %', value: (currentResult.delta_pct >= 0 ? '+' : '') + currentResult.delta_pct.toFixed(1) + '%', color: deltaColor(currentResult.delta_pct) },
              { label: 'Scenario', value: currentResult.scenario_type.replace(/_/g, ' '), color: '#64748b' },
            ].map((m) => (
              <div key={m.label}>
                <p style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#94a3b8', marginBottom: 4 }}>{m.label}</p>
                <p style={{ fontSize: 22, fontWeight: 700, color: m.color, textTransform: 'capitalize' }}>{m.value}</p>
              </div>
            ))}
          </div>
        )}

        <div style={{ height: 380 }}>
          <ScenarioChart result={currentResult} loading={runLoading} />
        </div>
      </div>

      {/* Comparison table */}
      {savedScenarios.length > 0 && (
        <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'flex-end' }}>
          <button onClick={() => setSavedScenarios([])} style={{ fontSize: 12, color: '#94a3b8', background: 'none', border: 'none', cursor: 'pointer' }}>
            Clear comparison
          </button>
        </div>
      )}
      <CompareTable scenarios={savedScenarios} />
    </div>
  )
}
