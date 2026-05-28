import { type CSSProperties, type ReactNode, useEffect, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  sopApi,
  type AccuracyScorecard,
  type CalendarEntry,
  type ConsensusRow,
  type VersionRow,
} from '../../services/api'

function varianceColor(pct: number) {
  if (pct < 5) return '#10b981'
  if (pct < 15) return '#f59e0b'
  return '#ef4444'
}

function statusStyle(status: string): CSSProperties {
  if (status === 'ALIGNED') return { backgroundColor: 'rgba(16,185,129,0.12)', color: '#10b981' }
  if (status === 'REVIEW NEEDED') return { backgroundColor: 'rgba(245,158,11,0.12)', color: '#f59e0b' }
  return { backgroundColor: 'rgba(239,68,68,0.12)', color: '#ef4444' }
}

const card: CSSProperties = {
  backgroundColor: '#ffffff',
  border: '1px solid #e2e8f0',
  borderRadius: '16px',
  boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
  padding: '24px',
}

function Skeleton() {
  return <div className="animate-pulse bg-slate-100 rounded-xl" style={{ height: 20 }} />
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div style={card}>
      <h2 style={{ fontSize: 15, fontWeight: 600, color: '#0f172a', marginBottom: 20 }}>{title}</h2>
      {children}
    </div>
  )
}

function SOPCalendar({ entries, loading }: { entries: CalendarEntry[]; loading: boolean }) {
  if (loading) {
    return (
      <div style={{ display: 'flex', gap: 12 }}>
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="animate-pulse bg-slate-100 rounded-2xl" style={{ flex: 1, height: 88 }} />
        ))}
      </div>
    )
  }

  const activeCycle = entries.find((e) => e.status === 'active')?.cycle ?? 1
  const cycleEntries = entries.filter((e) => e.cycle === activeCycle)

  return (
    <div style={{ display: 'flex', gap: 12, overflowX: 'auto' }}>
      {cycleEntries.map((entry, i) => {
        const isActive = entry.status === 'active'
        const isCompleted = entry.status === 'completed'
        return (
          <div
            key={i}
            style={{
              flex: 1, minWidth: 140, borderRadius: 16, padding: '16px',
              border: isActive ? '2px solid #00D4B4' : '1px solid #e2e8f0',
              backgroundColor: isActive ? '#f0fdf9' : '#fff',
              opacity: isCompleted ? 0.6 : 1,
              transition: 'all 0.15s',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <div style={{
                width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                backgroundColor: isActive ? '#00D4B4' : isCompleted ? '#10b981' : '#e2e8f0',
              }} />
              <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#94a3b8', fontWeight: 600 }}>
                {entry.status}
              </span>
            </div>
            <p style={{ fontSize: 13, fontWeight: 600, color: isActive ? '#00D4B4' : '#0f172a', lineHeight: 1.3, marginBottom: 6 }}>
              {entry.phase}
            </p>
            <p style={{ fontSize: 12, color: '#94a3b8' }}>
              {new Date(entry.week_of).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </p>
          </div>
        )
      })}
    </div>
  )
}

function ConsensusTable({ rows, loading, onExport }: { rows: ConsensusRow[]; loading: boolean; onExport: () => void }) {
  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} />)}
      </div>
    )
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <p style={{ fontSize: 13, color: '#94a3b8' }}>{rows.length} SKUs in consensus</p>
        <button
          onClick={onExport}
          style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', borderRadius: 10, border: '1px solid rgba(0,212,180,0.3)', backgroundColor: 'rgba(0,212,180,0.08)', color: '#00D4B4', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
        >
          ⬇ Export Excel
        </button>
      </div>
      <div style={{ overflowX: 'auto', borderRadius: 12, border: '1px solid #e2e8f0' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ backgroundColor: '#f8fafc' }}>
              {['Drug', 'ATC', 'Statistical', 'Field', 'Consensus', 'Variance %', 'Status'].map((h) => (
                <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#94a3b8', borderBottom: '1px solid #e2e8f0', whiteSpace: 'nowrap' }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={row.sku_id} style={{ borderBottom: '1px solid #f1f5f9', backgroundColor: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                <td style={{ padding: '12px 16px', fontWeight: 500, color: '#0f172a' }}>{row.drug_name}</td>
                <td style={{ padding: '12px 16px', color: '#94a3b8' }}>{row.atc_code}</td>
                <td style={{ padding: '12px 16px', textAlign: 'right', fontFamily: 'monospace', color: '#64748b' }}>{row.statistical_forecast.toLocaleString()}</td>
                <td style={{ padding: '12px 16px', textAlign: 'right', fontFamily: 'monospace', color: '#64748b' }}>{row.field_forecast.toLocaleString()}</td>
                <td style={{ padding: '12px 16px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 600, color: '#0f172a' }}>{row.consensus_forecast.toLocaleString()}</td>
                <td style={{ padding: '12px 16px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 700, color: varianceColor(row.variance_pct) }}>{row.variance_pct.toFixed(1)}%</td>
                <td style={{ padding: '12px 16px' }}>
                  <span style={{ ...statusStyle(row.status), padding: '3px 10px', borderRadius: 999, fontSize: 11, fontWeight: 700 }}>
                    {row.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function AccuracySection({ data, loading }: { data: AccuracyScorecard | null; loading: boolean }) {
  if (loading || !data) {
    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16, marginBottom: 20 }}>
        {[1, 2, 3].map((i) => (
          <div key={i} className="animate-pulse bg-slate-100 rounded-xl" style={{ height: 96 }} />
        ))}
      </div>
    )
  }

  const cards = [
    { label: 'Overall MAPE', value: data.overall_mape != null ? `${data.overall_mape.toFixed(1)}%` : 'N/A', sub: 'Average forecast error', color: data.overall_mape != null && data.overall_mape < 15 ? '#10b981' : '#f59e0b' },
    { label: 'Best Model', value: data.best_model.charAt(0).toUpperCase() + data.best_model.slice(1), sub: 'Lowest avg MAPE', color: '#00D4B4' },
    { label: 'Most Improved SKU', value: data.most_improved_sku ?? 'N/A', sub: 'Biggest accuracy gain', color: '#FF6B35' },
  ]

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16, marginBottom: 20 }}>
        {cards.map((c) => (
          <div key={c.label} style={{ backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12, padding: 16 }}>
            <p style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#94a3b8', marginBottom: 8 }}>{c.label}</p>
            <p style={{ fontSize: 28, fontWeight: 700, color: c.color, marginBottom: 4 }}>{c.value}</p>
            <p style={{ fontSize: 12, color: '#94a3b8' }}>{c.sub}</p>
          </div>
        ))}
      </div>

      {data.sku_mapes.length > 0 && (
        <div style={{ backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12, padding: 16 }}>
          <p style={{ fontSize: 13, fontWeight: 600, color: '#0f172a', marginBottom: 12 }}>MAPE by SKU</p>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={data.sku_mapes} layout="vertical" margin={{ left: 8, right: 16, top: 4, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
              <XAxis type="number" tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="sku_name" width={110} tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: 8 }}
                labelStyle={{ color: '#0f172a', fontWeight: 600 }}
                formatter={(v: number) => [`${v.toFixed(1)}%`, 'MAPE']}
              />
              <Bar dataKey="avg_mape" radius={[0, 4, 4, 0]}>
                {data.sku_mapes.map((entry, i) => (
                  <Cell key={i} fill={entry.avg_mape < 10 ? '#10b981' : entry.avg_mape < 20 ? '#f59e0b' : '#ef4444'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}

function VersionTable({ rows, loading }: { rows: VersionRow[]; loading: boolean }) {
  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {[1, 2, 3, 4].map((i) => <Skeleton key={i} />)}
      </div>
    )
  }

  return (
    <div style={{ overflowX: 'auto', borderRadius: 12, border: '1px solid #e2e8f0' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ backgroundColor: '#f8fafc' }}>
            {['SKU', 'Version 1', 'Version 2', 'Version 3', 'Trend'].map((h) => (
              <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#94a3b8', borderBottom: '1px solid #e2e8f0' }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={row.sku_id} style={{ borderBottom: '1px solid #f1f5f9', backgroundColor: i % 2 === 0 ? '#fff' : '#fafafa' }}>
              <td style={{ padding: '12px 16px', fontWeight: 500, color: '#0f172a' }}>{row.sku_name}</td>
              {row.versions.map((v, vi) => (
                <td key={vi} style={{ padding: '12px 16px', textAlign: 'right', fontFamily: 'monospace', color: '#64748b' }}>
                  {v.mape != null ? `${v.mape.toFixed(1)}%` : '—'}
                </td>
              ))}
              <td style={{ padding: '12px 16px', fontWeight: 600, color: row.accuracy_trend === 'improving' ? '#10b981' : row.accuracy_trend === 'worsening' ? '#ef4444' : '#94a3b8' }}>
                {row.accuracy_trend === 'improving' ? '↑ Improving' : row.accuracy_trend === 'worsening' ? '↓ Worsening' : '→ Stable'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function SAPExport({ onExport }: { onExport: () => void }) {
  const previewRows = [
    { material_number: 'M01AB01', plant: 'PL01', storage_location: 'SL01', period: '202601', quantity: 1200, unit: 'EA' },
    { material_number: 'M01AB02', plant: 'PL01', storage_location: 'SL01', period: '202601', quantity: 980, unit: 'EA' },
    { material_number: 'N02BA01', plant: 'PL01', storage_location: 'SL01', period: '202601', quantity: 2100, unit: 'EA' },
    { material_number: 'R03AC02', plant: 'PL01', storage_location: 'SL01', period: '202601', quantity: 750, unit: 'EA' },
    { material_number: 'C10AA01', plant: 'PL01', storage_location: 'SL01', period: '202601', quantity: 560, unit: 'EA' },
  ]

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <p style={{ fontSize: 13, color: '#94a3b8' }}>SAP-APO compatible format — preview of first 5 rows</p>
        <button
          onClick={onExport}
          style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 20px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg,#00D4B4,#0099a8)', color: '#0A1628', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
        >
          ⬇ Export SAP-APO Format
        </button>
      </div>
      <div style={{ overflowX: 'auto', borderRadius: 12, border: '1px solid #e2e8f0' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ backgroundColor: '#f8fafc' }}>
              {Object.keys(previewRows[0]).map((h) => (
                <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#94a3b8', borderBottom: '1px solid #e2e8f0' }}>
                  {h.replace('_', ' ')}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {previewRows.map((row, i) => (
              <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                {Object.values(row).map((v, vi) => (
                  <td key={vi} style={{ padding: '10px 16px', fontFamily: 'monospace', color: '#64748b' }}>{v}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default function SOPConsole() {
  const [calendar, setCalendar] = useState<CalendarEntry[]>([])
  const [consensus, setConsensus] = useState<ConsensusRow[]>([])
  const [accuracy, setAccuracy] = useState<AccuracyScorecard | null>(null)
  const [versions, setVersions] = useState<VersionRow[]>([])
  const [loading, setLoading] = useState({ calendar: true, consensus: true, accuracy: true, versions: true })
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    sopApi.getCalendar()
      .then((r) => setCalendar(r.data))
      .catch(() => setError('Failed to load S&OP calendar'))
      .finally(() => setLoading((p) => ({ ...p, calendar: false })))

    sopApi.getConsensus()
      .then((r) => setConsensus(r.data))
      .catch(() => {})
      .finally(() => setLoading((p) => ({ ...p, consensus: false })))

    sopApi.getAccuracy()
      .then((r) => setAccuracy(r.data))
      .catch(() => {})
      .finally(() => setLoading((p) => ({ ...p, accuracy: false })))

    sopApi.getVersions()
      .then((r) => setVersions(r.data))
      .catch(() => {})
      .finally(() => setLoading((p) => ({ ...p, versions: false })))
  }, [])

  function handleExportConsensus() {
    const headers = ['drug_name', 'atc_code', 'therapy_area', 'statistical_forecast', 'field_forecast', 'consensus_forecast', 'variance_pct', 'status']
    const rows = consensus.map((r) =>
      [r.drug_name, r.atc_code, r.therapy_area, r.statistical_forecast, r.field_forecast, r.consensus_forecast, r.variance_pct, r.status].join(',')
    )
    const csv = [headers.join(','), ...rows].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'consensus_forecast.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  function handleSAPExport() {
    sopApi.exportSap().then((r) => {
      const url = URL.createObjectURL(r.data)
      const a = document.createElement('a')
      a.href = url
      a.download = 'pulsechain_sap_export.csv'
      a.click()
      URL.revokeObjectURL(url)
    })
  }

  return (
    <div style={{ background: '#f8fafc', minHeight: '100%', padding: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Header */}
      <div>
        <h1 style={{ fontSize: 28, fontWeight: 700, color: '#0f172a', margin: 0 }}>S&OP Console</h1>
        <p style={{ fontSize: 14, color: '#94a3b8', marginTop: 6 }}>Sales & Operations Planning — consensus forecasting and export</p>
      </div>

      {error && (
        <div style={{ padding: '12px 16px', borderRadius: 10, backgroundColor: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#ef4444', fontSize: 13 }}>
          {error}
        </div>
      )}

      <Section title="S&OP Cycle Calendar">
        <SOPCalendar entries={calendar} loading={loading.calendar} />
      </Section>

      <Section title="Consensus Forecast">
        <ConsensusTable rows={consensus} loading={loading.consensus} onExport={handleExportConsensus} />
      </Section>

      <Section title="Forecast Accuracy Scorecard">
        <AccuracySection data={accuracy} loading={loading.accuracy} />
      </Section>

      <Section title="Forecast Version Comparison">
        <VersionTable rows={versions} loading={loading.versions} />
      </Section>

      <Section title="SAP Export">
        <SAPExport onExport={handleSAPExport} />
      </Section>
    </div>
  )
}
