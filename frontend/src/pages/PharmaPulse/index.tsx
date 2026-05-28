import { type CSSProperties, useEffect, useState } from 'react'
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  socialApi,
  type DrugSentiment,
  type ForecastAdjustment,
  type NewsHeadline,
  type OutbreakSignal,
  type TherapySignal,
  type TickerItem,
} from '../../services/api'

function scoreColor(score: number): string {
  if (score >= 70) return '#ef4444'
  if (score >= 50) return '#f59e0b'
  if (score >= 30) return '#00d4b4'
  return '#94a3b8'
}

function scoreBg(score: number): string {
  if (score >= 70) return 'rgba(239,68,68,0.10)'
  if (score >= 50) return 'rgba(245,158,11,0.10)'
  if (score >= 30) return 'rgba(0,212,180,0.08)'
  return 'rgba(100,116,139,0.08)'
}

function directionArrow(dir: string): string {
  if (dir === 'up') return '↑'
  if (dir === 'down') return '↓'
  return '→'
}

function signalTypeBadgeStyle(type: string): { backgroundColor: string; color: string } {
  switch (type) {
    case 'outbreak': return { backgroundColor: 'rgba(239,68,68,0.10)', color: '#ef4444' }
    case 'shortage':  return { backgroundColor: 'rgba(245,158,11,0.10)', color: '#f59e0b' }
    case 'launch':    return { backgroundColor: 'rgba(0,212,180,0.10)', color: '#00d4b4' }
    case 'policy':    return { backgroundColor: 'rgba(99,102,241,0.10)', color: '#6366f1' }
    default:          return { backgroundColor: 'rgba(100,116,139,0.10)', color: '#94a3b8' }
  }
}

function confidenceColor(c: string): string {
  if (c === 'high') return '#00d4b4'
  if (c === 'medium') return '#f59e0b'
  return '#94a3b8'
}

function fmtAdj(n: number): string {
  return (n >= 0 ? '+' : '') + n.toFixed(1) + '%'
}

const card: CSSProperties = {
  backgroundColor: '#ffffff',
  border: '1px solid #e2e8f0',
  borderRadius: '16px',
  boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
}

const TICKER_COLORS: Record<string, string> = {
  positive: '#00d4b4',
  negative: '#ef4444',
  neutral: '#94a3b8',
}

function TickerBar({ items }: { items: TickerItem[] }) {
  const doubled = [...items, ...items]
  return (
    <div style={{ ...card, padding: '12px 20px', marginBottom: 20, overflow: 'hidden' }}>
      <div className="animate-ticker" style={{ display: 'inline-flex', whiteSpace: 'nowrap' }}>
        {doubled.map((item, i) => (
          <span key={i} style={{ marginRight: 32, fontSize: 12, fontWeight: 500, color: TICKER_COLORS[item.sentiment] ?? '#94a3b8', flexShrink: 0 }}>
            {item.type === 'trend' ? '📈' : item.type === 'reddit' ? '💬' : '📰'}{' '}
            {item.text}
            <span style={{ marginLeft: 16, color: '#e2e8f0' }}>•</span>
          </span>
        ))}
      </div>
    </div>
  )
}

function SignalCard({ sig }: { sig: TherapySignal }) {
  const color = scoreColor(sig.final_score)
  const bg = scoreBg(sig.final_score)
  return (
    <div style={{ ...card, padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#94a3b8' }}>
          {sig.therapy_area}
        </span>
        <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 999, backgroundColor: bg, color }}>
          {directionArrow(sig.trend_direction)} {sig.trend_direction}
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6 }}>
        <span style={{ fontSize: 48, fontWeight: 700, lineHeight: 1, color }}>{sig.final_score.toFixed(0)}</span>
        <span style={{ fontSize: 13, color: '#94a3b8', marginBottom: 4 }}>/100</span>
      </div>

      <div style={{ fontSize: 12, color: '#94a3b8' }}>
        Top term: <span style={{ color: '#0f172a', fontWeight: 500 }}>{sig.top_term}</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 4 }}>
        {[{ label: 'Trends', value: sig.trends_score }, { label: 'Reddit', value: sig.reddit_score }, { label: 'News', value: sig.news_score }].map(({ label, value }) => (
          <div key={label} style={{ textAlign: 'center', backgroundColor: '#f8fafc', borderRadius: 8, padding: '6px 4px' }}>
            <div style={{ fontSize: 10, color: '#94a3b8', marginBottom: 2 }}>{label}</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>{value.toFixed(0)}</div>
          </div>
        ))}
      </div>

      {sig.forecast_adjustment_pct !== 0 && (
        <div style={{ borderRadius: 8, padding: '6px 10px', textAlign: 'center', fontSize: 12, fontWeight: 700, backgroundColor: sig.forecast_adjustment_pct > 0 ? 'rgba(0,212,180,0.10)' : 'rgba(239,68,68,0.10)', color: sig.forecast_adjustment_pct > 0 ? '#00d4b4' : '#ef4444' }}>
          Forecast adj: {fmtAdj(sig.forecast_adjustment_pct)}
        </div>
      )}
    </div>
  )
}

const LINE_PALETTE = ['#00d4b4', '#6366f1', '#f59e0b', '#ef4444', '#a78bfa']

function TrendChart({ signals }: { signals: TherapySignal[] }) {
  if (!signals.length) return null

  const dateMap: Record<string, Record<string, number>> = {}
  signals.forEach((sig) => {
    sig.weekly_chart.forEach(({ date, score }) => {
      if (!dateMap[date]) dateMap[date] = {}
      dateMap[date][sig.therapy_area] = score
    })
  })

  const data = Object.entries(dateMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, vals]) => ({ date: date.slice(5), ...vals }))

  return (
    <div style={{ ...card, padding: 20 }}>
      <p style={{ fontSize: 14, fontWeight: 600, color: '#0f172a', marginBottom: 16 }}>Weekly Signal Score — All Therapy Areas</p>
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={data} margin={{ top: 4, right: 8, bottom: 4, left: -20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
          <XAxis dataKey="date" tick={{ fill: '#94a3b8', fontSize: 10 }} axisLine={false} tickLine={false} />
          <YAxis domain={[0, 100]} tick={{ fill: '#94a3b8', fontSize: 10 }} axisLine={false} tickLine={false} />
          <Tooltip
            contentStyle={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}
            labelStyle={{ color: '#0f172a', fontWeight: 600 }}
          />
          <Legend wrapperStyle={{ fontSize: 11 }} formatter={(v) => <span style={{ color: '#64748b' }}>{v}</span>} />
          {signals.map((sig, i) => (
            <Line key={sig.therapy_area} type="monotone" dataKey={sig.therapy_area} stroke={LINE_PALETTE[i % LINE_PALETTE.length]} strokeWidth={2} dot={false} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

const INDIA_STATES = [
  { code: 'DL', name: 'Delhi', col: 3, row: 2 },
  { code: 'UP', name: 'UP', col: 4, row: 2 },
  { code: 'RJ', name: 'Rajasthan', col: 2, row: 3 },
  { code: 'GJ', name: 'Gujarat', col: 1, row: 4 },
  { code: 'MH', name: 'Maharashtra', col: 2, row: 5 },
  { code: 'WB', name: 'West Bengal', col: 6, row: 3 },
  { code: 'KA', name: 'Karnataka', col: 3, row: 7 },
  { code: 'TN', name: 'Tamil Nadu', col: 3, row: 8 },
]

function IndiaHeatmap({ signals }: { signals: TherapySignal[] }) {
  const topScore = signals.length ? Math.max(...signals.map((s) => s.final_score)) : 50
  const stateScores: Record<string, number> = {}
  INDIA_STATES.forEach(({ code }, idx) => {
    stateScores[code] = Math.min(100, Math.max(10, topScore + ((idx * 13) % 30) - 10))
  })

  const CELL = 56, GAP = 4

  return (
    <div style={{ ...card, padding: 20 }}>
      <p style={{ fontSize: 14, fontWeight: 600, color: '#0f172a', marginBottom: 12 }}>Regional Signal Intensity — India</p>
      <div style={{ position: 'relative', height: 9 * (CELL + GAP) }}>
        {INDIA_STATES.map(({ code, name, col, row }) => {
          const score = stateScores[code] ?? 50
          const color = scoreColor(score)
          const bg = scoreBg(score)
          return (
            <div
              key={code}
              title={name}
              style={{
                position: 'absolute',
                left: (col - 1) * (CELL + GAP), top: (row - 1) * (CELL + GAP),
                width: CELL, height: CELL,
                backgroundColor: bg, border: `1px solid ${color}66`, borderRadius: 10,
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2,
              }}
            >
              <span style={{ fontSize: 11, fontWeight: 700, color }}>{code}</span>
              <span style={{ fontSize: 10, color: '#94a3b8' }}>{score.toFixed(0)}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function NewsFeed({ headlines }: { headlines: NewsHeadline[] }) {
  return (
    <div style={{ ...card, padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <p style={{ fontSize: 14, fontWeight: 600, color: '#0f172a' }}>News Intelligence</p>
      {headlines.length === 0 && <p style={{ fontSize: 12, color: '#94a3b8' }}>No headlines available.</p>}
      {headlines.map((h, i) => {
        const badge = signalTypeBadgeStyle(h.signal_type)
        return (
          <div key={i} style={{ paddingBottom: 12, borderBottom: i < headlines.length - 1 ? '1px solid #f1f5f9' : 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 999, textTransform: 'uppercase', letterSpacing: '0.04em', ...badge }}>
                {h.signal_type}
              </span>
              <span style={{ fontSize: 11, color: '#94a3b8' }}>{h.time_ago}</span>
              <span style={{ fontSize: 11, color: '#94a3b8', marginLeft: 'auto' }}>{h.source}</span>
            </div>
            <p style={{ fontSize: 13, color: '#0f172a', lineHeight: 1.5 }}>{h.title}</p>
            {h.description && (
              <p style={{ fontSize: 11, color: '#94a3b8', lineHeight: 1.5 }}>{h.description}</p>
            )}
          </div>
        )
      })}
    </div>
  )
}

function RedditFeed({ outbreak, sentiment }: { outbreak: OutbreakSignal[]; sentiment: DrugSentiment[] }) {
  return (
    <div style={{ ...card, padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <p style={{ fontSize: 14, fontWeight: 600, color: '#0f172a' }}>Reddit Insights</p>

      {outbreak.length > 0 && (
        <div>
          <p style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#94a3b8', marginBottom: 10 }}>Outbreak Signals</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {outbreak.slice(0, 4).map((sig) => (
              <div key={sig.term} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ fontSize: 13, color: '#0f172a', fontWeight: 500, textTransform: 'capitalize' }}>{sig.term}</span>
                  {sig.sample_posts[0] && (
                    <p style={{ fontSize: 11, color: '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sig.sample_posts[0]}</p>
                  )}
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: sig.signal_strength > 0.5 ? '#ef4444' : '#f59e0b' }}>
                    {(sig.signal_strength * 100).toFixed(0)}%
                  </div>
                  <div style={{ fontSize: 11, color: '#94a3b8' }}>{sig.mention_count} posts</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {sentiment.length > 0 && (
        <div>
          <p style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#94a3b8', marginBottom: 10 }}>Drug Sentiment</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {sentiment.slice(0, 3).map((drug) => (
              <div key={drug.drug_name}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ fontSize: 13, color: '#0f172a', fontWeight: 500, textTransform: 'capitalize' }}>{drug.drug_name}</span>
                  <span style={{ fontSize: 11, color: '#94a3b8' }}>{drug.total_mentions} mentions</span>
                </div>
                <div style={{ height: 6, borderRadius: 3, overflow: 'hidden', display: 'flex' }}>
                  <div style={{ width: `${drug.positive_pct}%`, backgroundColor: '#00d4b4' }} />
                  <div style={{ width: `${drug.neutral_pct}%`, backgroundColor: '#e2e8f0' }} />
                  <div style={{ width: `${drug.negative_pct}%`, backgroundColor: '#ef4444' }} />
                </div>
                <div style={{ display: 'flex', gap: 12, marginTop: 4, fontSize: 11 }}>
                  <span style={{ color: '#00d4b4' }}>+{drug.positive_pct.toFixed(0)}%</span>
                  <span style={{ color: '#94a3b8' }}>{drug.neutral_pct.toFixed(0)}% neutral</span>
                  <span style={{ color: '#ef4444' }}>-{drug.negative_pct.toFixed(0)}%</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function ForecastAdjTable({ adjustments }: { adjustments: ForecastAdjustment[] }) {
  return (
    <div style={{ ...card, padding: 24 }}>
      <p style={{ fontSize: 15, fontWeight: 600, color: '#0f172a', marginBottom: 16 }}>Signal-Driven Forecast Adjustments</p>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ backgroundColor: '#f8fafc' }}>
              {['SKU', 'ATC', 'Therapy Area', 'Signal', 'Adjustment', 'Confidence', 'Reasoning'].map((h) => (
                <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#94a3b8', borderBottom: '1px solid #e2e8f0', whiteSpace: 'nowrap' }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {adjustments.map((a, i) => (
              <tr key={a.sku_id} style={{ borderBottom: '1px solid #f1f5f9', backgroundColor: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                <td style={{ padding: '12px 16px', fontWeight: 500, color: '#0f172a', whiteSpace: 'nowrap' }}>{a.sku_name}</td>
                <td style={{ padding: '12px 16px', fontFamily: 'monospace', fontSize: 11, color: '#94a3b8' }}>{a.atc_code}</td>
                <td style={{ padding: '12px 16px', color: '#64748b' }}>{a.therapy_area}</td>
                <td style={{ padding: '12px 16px' }}>
                  <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 700, backgroundColor: scoreBg(a.signal_score), color: scoreColor(a.signal_score) }}>
                    {a.signal_score.toFixed(0)}/100
                  </span>
                </td>
                <td style={{ padding: '12px 16px', fontWeight: 700, color: a.adjustment_pct > 0 ? '#00d4b4' : a.adjustment_pct < 0 ? '#ef4444' : '#94a3b8' }}>
                  {fmtAdj(a.adjustment_pct)}
                </td>
                <td style={{ padding: '12px 16px', fontWeight: 600, textTransform: 'capitalize', color: confidenceColor(a.confidence) }}>
                  {a.confidence}
                </td>
                <td style={{ padding: '12px 16px', color: '#94a3b8', maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={a.reasoning}>
                  {a.reasoning}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

interface PageState {
  loading: boolean
  ticker: TickerItem[]
  signals: TherapySignal[]
  headlines: NewsHeadline[]
  outbreak: OutbreakSignal[]
  sentiment: DrugSentiment[]
  adjustments: ForecastAdjustment[]
  error: string | null
}

export default function PharmaPulse() {
  const [state, setState] = useState<PageState>({
    loading: true, ticker: [], signals: [], headlines: [], outbreak: [], sentiment: [], adjustments: [], error: null,
  })

  useEffect(() => {
    Promise.allSettled([
      socialApi.getTicker(),
      socialApi.getSignals(),
      socialApi.getNews(),
      socialApi.getReddit(),
      socialApi.getForecastAdjustments(),
    ]).then(([tickerRes, signalsRes, newsRes, redditRes, adjRes]) => {
      setState({
        loading: false,
        ticker: tickerRes.status === 'fulfilled' ? tickerRes.value.data : [],
        signals: signalsRes.status === 'fulfilled' ? signalsRes.value.data : [],
        headlines: newsRes.status === 'fulfilled' ? newsRes.value.data.top_headlines : [],
        outbreak: redditRes.status === 'fulfilled' ? redditRes.value.data.outbreak_signals : [],
        sentiment: redditRes.status === 'fulfilled' ? redditRes.value.data.drug_sentiments : [],
        adjustments: adjRes.status === 'fulfilled' ? adjRes.value.data : [],
        error: null,
      })
    })
  }, [])

  if (state.loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
        <div style={{ width: 36, height: 36, borderRadius: '50%', border: '3px solid #e2e8f0', borderTopColor: '#00D4B4', animation: 'spin 0.8s linear infinite' }} />
      </div>
    )
  }

  return (
    <div style={{ background: '#f8fafc', minHeight: '100%', padding: 24 }}>

      {/* Ticker */}
      <TickerBar items={state.ticker} />

      {/* Signal cards */}
      <div style={{ marginBottom: 20 }}>
        <p style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#94a3b8', marginBottom: 12 }}>Demand Signal Index</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 16 }}>
          {state.signals.map((sig) => (
            <SignalCard key={sig.therapy_area} sig={sig} />
          ))}
        </div>
      </div>

      {/* Chart + Heatmap */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 20, marginBottom: 20 }}>
        <TrendChart signals={state.signals} />
        <IndiaHeatmap signals={state.signals} />
      </div>

      {/* News + Reddit */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
        <NewsFeed headlines={state.headlines} />
        <RedditFeed outbreak={state.outbreak} sentiment={state.sentiment} />
      </div>

      {/* Forecast adjustments */}
      <ForecastAdjTable adjustments={state.adjustments} />
    </div>
  )
}
