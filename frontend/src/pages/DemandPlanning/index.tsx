import { useEffect, useState, type CSSProperties } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { demandPlanningApi } from '../../services/api'

// ------------------------------------------------------------------ //
// Types
// ------------------------------------------------------------------ //

interface MonthBucket {
  period_month: string
  system_forecast: number
  override_value: number | null
  final_value: number
  status: 'draft' | 'submitted' | 'approved'
  reason: string | null
  version: number
}

interface SKUPlan {
  id: number
  name: string
  atc_code: string
  therapy_area: string | null
  months: MonthBucket[]
}

interface Summary {
  total_plans: number
  draft_count: number
  submitted_count: number
  approved_count: number
  skus_needing_review: number
  total_override_variance_pct: number
}

interface HistoryRow {
  action: string
  old_value: number | null
  new_value: number | null
  reason: string | null
  changed_by: string
  created_at: string
}

// ------------------------------------------------------------------ //
// Design tokens
// ------------------------------------------------------------------ //

const TEAL = '#00D4B4'
const NAVY = '#0A1628'
const AMBER = '#f59e0b'
const RED = '#ef4444'
const GREEN = '#10b981'

const card: CSSProperties = {
  backgroundColor: '#ffffff',
  border: '1px solid #e2e8f0',
  borderRadius: '16px',
  boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
}

// ------------------------------------------------------------------ //
// Helpers
// ------------------------------------------------------------------ //

function fmtNum(n: number | null | undefined): string {
  if (n == null) return '—'
  return n.toLocaleString('en-IN', { maximumFractionDigits: 0 })
}

function fmtMonth(iso: string): string {
  const d = new Date(iso + 'T00:00:00')
  return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

function actionLabel(action: string): string {
  switch (action) {
    case 'override': return 'Override applied'
    case 'submit': return 'Submitted for approval'
    case 'approve': return 'Approved'
    case 'reject': return 'Rejected — sent back'
    case 'reset': return 'Reset to system forecast'
    default: return action
  }
}

function actionColor(action: string): string {
  switch (action) {
    case 'approve': return GREEN
    case 'reject': return RED
    case 'submit': return AMBER
    case 'reset': return '#94a3b8'
    default: return TEAL
  }
}

// ------------------------------------------------------------------ //
// Toast
// ------------------------------------------------------------------ //

function Toast({ message, onDone }: { message: string; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 2800)
    return () => clearTimeout(t)
  }, [onDone])
  return (
    <motion.div
      initial={{ opacity: 0, y: -16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -16 }}
      style={{
        position: 'fixed', top: 72, right: 20, zIndex: 9999,
        backgroundColor: TEAL, color: NAVY,
        padding: '10px 20px', borderRadius: 10,
        fontWeight: 700, fontSize: 13,
        boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
      }}
    >
      {message}
    </motion.div>
  )
}

// ------------------------------------------------------------------ //
// Summary KPI bar
// ------------------------------------------------------------------ //

function SummaryBar({ summary }: { summary: Summary }) {
  const items = [
    { label: 'Total Plans', value: summary.total_plans, color: '#64748b' },
    { label: 'Draft', value: summary.draft_count, color: '#94a3b8' },
    { label: 'Pending Approval', value: summary.submitted_count, color: AMBER },
    { label: 'Approved', value: summary.approved_count, color: GREEN },
  ]
  return (
    <div style={{ display: 'flex', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
      {items.map((item) => (
        <div key={item.label} style={{ ...card, padding: '16px 20px', flex: '1 1 140px', minWidth: 130 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>
            {item.label}
          </div>
          <div style={{ fontSize: 28, fontWeight: 800, color: item.color }}>
            {item.value}
          </div>
        </div>
      ))}
      {summary.skus_needing_review > 0 && (
        <div style={{ ...card, padding: '16px 20px', flex: '1 1 200px', minWidth: 180, borderLeft: `3px solid ${AMBER}` }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>
            SKUs Needing Review
          </div>
          <div style={{ fontSize: 28, fontWeight: 800, color: AMBER }}>
            {summary.skus_needing_review}
          </div>
          {summary.total_override_variance_pct > 0 && (
            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>
              Avg override variance: {summary.total_override_variance_pct.toFixed(1)}%
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ------------------------------------------------------------------ //
// Status badge
// ------------------------------------------------------------------ //

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { bg: string; color: string; label: string }> = {
    draft: { bg: '#f1f5f9', color: '#64748b', label: 'Draft' },
    submitted: { bg: 'rgba(245,158,11,0.1)', color: AMBER, label: 'Pending' },
    approved: { bg: 'rgba(16,185,129,0.1)', color: GREEN, label: 'Approved' },
  }
  const s = map[status] ?? map.draft
  return (
    <span style={{
      display: 'inline-block', padding: '2px 8px', borderRadius: 99,
      fontSize: 11, fontWeight: 700, backgroundColor: s.bg, color: s.color,
    }}>
      {s.label}
    </span>
  )
}

// ------------------------------------------------------------------ //
// Reject dialog (inline input)
// ------------------------------------------------------------------ //

function RejectPrompt({
  onConfirm,
  onCancel,
}: {
  onConfirm: (reason: string) => void
  onCancel: () => void
}) {
  const [reason, setReason] = useState('')
  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginTop: 4 }}>
      <input
        autoFocus
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Rejection reason…"
        style={{
          flex: '1 1 160px', padding: '5px 10px', borderRadius: 8, fontSize: 12,
          border: `1px solid ${RED}`, outline: 'none', color: '#0f172a',
        }}
        onKeyDown={(e) => { if (e.key === 'Enter' && reason.trim()) onConfirm(reason.trim()) }}
      />
      <button
        onClick={() => reason.trim() && onConfirm(reason.trim())}
        style={{
          padding: '5px 12px', borderRadius: 8, fontSize: 12, fontWeight: 700,
          backgroundColor: RED, color: '#fff', border: 'none', cursor: 'pointer',
        }}
      >
        Reject
      </button>
      <button
        onClick={onCancel}
        style={{
          padding: '5px 10px', borderRadius: 8, fontSize: 12, fontWeight: 600,
          backgroundColor: 'transparent', color: '#94a3b8', border: '1px solid #e2e8f0', cursor: 'pointer',
        }}
      >
        Cancel
      </button>
    </div>
  )
}

// ------------------------------------------------------------------ //
// History drawer
// ------------------------------------------------------------------ //

function HistoryDrawer({
  skuId,
  periodMonth,
  onClose,
}: {
  skuId: number
  periodMonth: string
  onClose: () => void
}) {
  const [rows, setRows] = useState<HistoryRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    demandPlanningApi.getHistory(skuId, periodMonth)
      .then((r) => setRows(r.data))
      .catch(() => setRows([]))
      .finally(() => setLoading(false))
  }, [skuId, periodMonth])

  return (
    <motion.div
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: 'auto', opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      transition={{ duration: 0.2 }}
      style={{ overflow: 'hidden' }}
    >
      <div style={{ padding: '16px 0 4px', borderTop: '1px solid #f1f5f9', marginTop: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: NAVY }}>Audit Trail — {fmtMonth(periodMonth)}</span>
          <button onClick={onClose} style={{ fontSize: 12, color: '#94a3b8', background: 'none', border: 'none', cursor: 'pointer' }}>
            Close ✕
          </button>
        </div>
        {loading ? (
          <div style={{ fontSize: 12, color: '#94a3b8' }}>Loading…</div>
        ) : rows.length === 0 ? (
          <div style={{ fontSize: 12, color: '#94a3b8' }}>No history yet for this month.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {rows.map((row, i) => (
              <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                <div style={{
                  width: 8, height: 8, borderRadius: '50%', marginTop: 4, flexShrink: 0,
                  backgroundColor: actionColor(row.action),
                }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#334155' }}>
                    {actionLabel(row.action)}
                    {row.old_value != null && row.new_value != null && (
                      <span style={{ fontWeight: 400, color: '#94a3b8', marginLeft: 6 }}>
                        {fmtNum(row.old_value)} → {fmtNum(row.new_value)}
                      </span>
                    )}
                  </div>
                  {row.reason && (
                    <div style={{ fontSize: 11, color: '#64748b', marginTop: 1 }}>"{row.reason}"</div>
                  )}
                  <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 1 }}>
                    {row.changed_by} · {timeAgo(row.created_at)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  )
}

// ------------------------------------------------------------------ //
// Month action row
// ------------------------------------------------------------------ //

function MonthActions({
  bucket,
  localReason,
  onReasonChange,
  onSubmit,
  onApprove,
  onReject,
  onReset,
}: {
  bucket: MonthBucket
  localReason: string
  onReasonChange: (v: string) => void
  onSubmit: () => void
  onApprove: () => void
  onReject: (reason: string) => void
  onReset: () => void
}) {
  const [rejectOpen, setRejectOpen] = useState(false)
  const [confirmReset, setConfirmReset] = useState(false)

  if (bucket.status === 'draft' && bucket.override_value != null) {
    return (
      <div style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <input
          value={localReason}
          onChange={(e) => onReasonChange(e.target.value)}
          placeholder="Why this change? e.g. Tender win confirmed"
          style={{
            flex: '1 1 200px', padding: '6px 10px', borderRadius: 8, fontSize: 12,
            border: '1px solid #e2e8f0', outline: 'none', color: '#0f172a',
          }}
          onFocus={(e) => { e.currentTarget.style.borderColor = TEAL }}
          onBlur={(e) => { e.currentTarget.style.borderColor = '#e2e8f0' }}
        />
        <button
          onClick={onSubmit}
          style={{
            padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700,
            backgroundColor: 'transparent', color: AMBER,
            border: `1.5px solid ${AMBER}`, cursor: 'pointer', whiteSpace: 'nowrap',
          }}
        >
          Submit for Approval
        </button>
      </div>
    )
  }

  if (bucket.status === 'submitted') {
    return (
      <div style={{ marginTop: 8 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{
            padding: '4px 10px', borderRadius: 99, fontSize: 11, fontWeight: 700,
            backgroundColor: 'rgba(245,158,11,0.1)', color: AMBER,
          }}>
            ⏳ Pending Approval
          </span>
          <button
            onClick={onApprove}
            style={{
              padding: '5px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700,
              backgroundColor: TEAL, color: NAVY, border: 'none', cursor: 'pointer',
            }}
          >
            ✓ Approve
          </button>
          <button
            onClick={() => setRejectOpen((v) => !v)}
            style={{
              padding: '5px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700,
              backgroundColor: 'transparent', color: RED, border: `1.5px solid ${RED}`, cursor: 'pointer',
            }}
          >
            ✕ Reject
          </button>
        </div>
        {rejectOpen && (
          <RejectPrompt
            onConfirm={(r) => { setRejectOpen(false); onReject(r) }}
            onCancel={() => setRejectOpen(false)}
          />
        )}
      </div>
    )
  }

  if (bucket.status === 'approved') {
    return (
      <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{
          padding: '4px 10px', borderRadius: 99, fontSize: 11, fontWeight: 700,
          backgroundColor: 'rgba(16,185,129,0.1)', color: GREEN,
        }}>
          ✓ Approved
        </span>
        {confirmReset ? (
          <span style={{ fontSize: 11, color: '#64748b' }}>
            Reset this plan?{' '}
            <button
              onClick={() => { setConfirmReset(false); onReset() }}
              style={{ background: 'none', border: 'none', color: RED, cursor: 'pointer', fontSize: 11, fontWeight: 700 }}
            >
              Yes
            </button>
            {' / '}
            <button
              onClick={() => setConfirmReset(false)}
              style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: 11 }}
            >
              No
            </button>
          </span>
        ) : (
          <button
            onClick={() => setConfirmReset(true)}
            style={{
              background: 'none', border: 'none', color: '#94a3b8',
              fontSize: 11, cursor: 'pointer', textDecoration: 'underline',
            }}
          >
            Reset
          </button>
        )}
      </div>
    )
  }

  return null
}

// ------------------------------------------------------------------ //
// SKU card
// ------------------------------------------------------------------ //

function SKUCard({
  sku,
  onRefresh,
  onToast,
}: {
  sku: SKUPlan
  onRefresh: () => void
  onToast: (msg: string) => void
}) {
  const [overrides, setOverrides] = useState<Record<string, string>>({})
  const [reasons, setReasons] = useState<Record<string, string>>({})
  const [historyMonth, setHistoryMonth] = useState<string | null>(null)

  // Determine the most recently touched month for history (first non-draft or last month)
  const mostTouchedMonth = sku.months.find((m) => m.status !== 'draft')?.period_month
    ?? sku.months[sku.months.length - 1]?.period_month

  function countByStatus(s: string) {
    return sku.months.filter((m) => m.status === s).length
  }

  function statusSummary() {
    const d = countByStatus('draft')
    const p = countByStatus('submitted')
    const a = countByStatus('approved')
    const parts: string[] = []
    if (d > 0) parts.push(`${d} Draft`)
    if (p > 0) parts.push(`${p} Pending`)
    if (a > 0) parts.push(`${a} Approved`)
    return parts.join(' · ')
  }

  async function handleOverrideSave(bucket: MonthBucket) {
    const raw = overrides[bucket.period_month]
    const val = parseFloat(raw)
    if (isNaN(val)) return
    try {
      await demandPlanningApi.override(
        sku.id,
        bucket.period_month,
        val,
        reasons[bucket.period_month] ?? '',
      )
      onToast('Override saved')
      onRefresh()
    } catch (e: any) {
      onToast(e?.response?.data?.detail ?? 'Override failed')
    }
  }

  async function handleSubmit(bucket: MonthBucket) {
    try {
      await demandPlanningApi.submit(sku.id, bucket.period_month)
      onToast('Submitted for approval')
      onRefresh()
    } catch (e: any) {
      onToast(e?.response?.data?.detail ?? 'Submit failed')
    }
  }

  async function handleApprove(bucket: MonthBucket) {
    try {
      await demandPlanningApi.approve(sku.id, bucket.period_month)
      onToast('Plan approved ✓')
      onRefresh()
    } catch (e: any) {
      onToast(e?.response?.data?.detail ?? 'Approve failed')
    }
  }

  async function handleReject(bucket: MonthBucket, reason: string) {
    try {
      await demandPlanningApi.reject(sku.id, bucket.period_month, reason)
      onToast('Plan rejected — sent back for revision')
      onRefresh()
    } catch (e: any) {
      onToast(e?.response?.data?.detail ?? 'Reject failed')
    }
  }

  async function handleReset(bucket: MonthBucket) {
    try {
      await demandPlanningApi.reset(sku.id, bucket.period_month)
      onToast('Plan reset to system forecast')
      onRefresh()
    } catch (e: any) {
      onToast(e?.response?.data?.detail ?? 'Reset failed')
    }
  }

  const hasAnyAction = sku.months.some(
    (m) => (m.status === 'draft' && m.override_value != null) || m.status === 'submitted' || m.status === 'approved',
  )

  return (
    <div style={{ ...card, padding: '20px 24px', marginBottom: 20 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 16, fontWeight: 800, color: NAVY }}>{sku.name}</span>
            <span style={{
              padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700,
              backgroundColor: 'rgba(10,22,40,0.08)', color: NAVY,
            }}>
              {sku.atc_code}
            </span>
          </div>
          {sku.therapy_area && (
            <div style={{ fontSize: 12, color: '#64748b', marginTop: 3 }}>{sku.therapy_area}</div>
          )}
        </div>
        <div style={{ fontSize: 12, color: '#94a3b8', textAlign: 'right' }}>
          {statusSummary()}
        </div>
      </div>

      {/* Planning table */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 520 }}>
          <thead>
            <tr>
              <td style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', paddingBottom: 6, paddingRight: 12, width: 70 }}></td>
              {sku.months.map((m) => (
                <td key={m.period_month} style={{ fontSize: 11, fontWeight: 700, color: '#334155', paddingBottom: 6, textAlign: 'center', paddingRight: 8 }}>
                  {fmtMonth(m.period_month)}
                </td>
              ))}
            </tr>
          </thead>
          <tbody>
            {/* System row */}
            <tr>
              <td style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, paddingRight: 12, paddingBottom: 8 }}>System</td>
              {sku.months.map((m) => (
                <td key={m.period_month} style={{ fontSize: 13, color: '#94a3b8', textAlign: 'center', paddingBottom: 8, paddingRight: 8 }}>
                  {fmtNum(m.system_forecast)}
                </td>
              ))}
            </tr>

            {/* Override row */}
            <tr>
              <td style={{ fontSize: 11, color: '#64748b', fontWeight: 600, paddingRight: 12, paddingBottom: 8 }}>Override</td>
              {sku.months.map((m) => {
                const inputVal = overrides[m.period_month] ?? (m.override_value != null ? String(m.override_value) : '')
                if (m.status === 'approved') {
                  return (
                    <td key={m.period_month} style={{ textAlign: 'center', paddingBottom: 8, paddingRight: 8 }}>
                      <span style={{ fontSize: 13, color: '#94a3b8' }}>{m.override_value != null ? fmtNum(m.override_value) : '—'}</span>
                      <span style={{ fontSize: 10, marginLeft: 4, color: GREEN }}>✓</span>
                    </td>
                  )
                }
                if (m.status === 'submitted') {
                  return (
                    <td key={m.period_month} style={{ textAlign: 'center', paddingBottom: 8, paddingRight: 8 }}>
                      <span style={{ fontSize: 13, color: '#cbd5e1' }}>{m.override_value != null ? fmtNum(m.override_value) : '—'}</span>
                      <span style={{
                        display: 'block', fontSize: 10, color: AMBER, fontWeight: 700, marginTop: 1,
                      }}>Pending</span>
                    </td>
                  )
                }
                return (
                  <td key={m.period_month} style={{ textAlign: 'center', paddingBottom: 8, paddingRight: 8 }}>
                    <input
                      type="number"
                      value={inputVal}
                      onChange={(e) => setOverrides((prev) => ({ ...prev, [m.period_month]: e.target.value }))}
                      onBlur={() => {
                        const raw = overrides[m.period_month]
                        if (raw != null && raw.trim() !== '' && !isNaN(parseFloat(raw))) {
                          handleOverrideSave(m)
                        }
                      }}
                      placeholder="—"
                      style={{
                        width: 72, padding: '4px 6px', borderRadius: 6, fontSize: 12,
                        border: '1px solid #e2e8f0', textAlign: 'center', outline: 'none', color: '#0f172a',
                      }}
                      onFocus={(e) => { e.currentTarget.style.borderColor = TEAL }}
                      onBlurCapture={(e) => { e.currentTarget.style.borderColor = '#e2e8f0' }}
                    />
                  </td>
                )
              })}
            </tr>

            {/* Final row */}
            <tr>
              <td style={{ fontSize: 11, color: '#334155', fontWeight: 700, paddingRight: 12, paddingBottom: 4 }}>Final</td>
              {sku.months.map((m) => {
                const isOverridden = m.override_value != null
                return (
                  <td key={m.period_month} style={{ textAlign: 'center', paddingBottom: 4, paddingRight: 8 }}>
                    <span style={{ fontSize: 14, fontWeight: 800, color: isOverridden ? TEAL : '#334155' }}>
                      {fmtNum(m.final_value)}
                    </span>
                    <span style={{ display: 'block', marginTop: 2 }}>
                      <StatusBadge status={m.status} />
                    </span>
                  </td>
                )
              })}
            </tr>
          </tbody>
        </table>
      </div>

      {/* Per-month action rows */}
      {hasAnyAction && (
        <div style={{ marginTop: 12, display: 'flex', flexWrap: 'wrap', gap: 12 }}>
          {sku.months.map((m) => {
            const showDraftAction = m.status === 'draft' && m.override_value != null
            const showSubmitted = m.status === 'submitted'
            const showApproved = m.status === 'approved'
            if (!showDraftAction && !showSubmitted && !showApproved) return null
            return (
              <div key={m.period_month} style={{
                border: '1px solid #f1f5f9', borderRadius: 10, padding: '10px 14px',
                flex: '1 1 220px', minWidth: 200,
              }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#334155', marginBottom: 4 }}>
                  {fmtMonth(m.period_month)}
                </div>
                <MonthActions
                  bucket={m}
                  localReason={reasons[m.period_month] ?? ''}
                  onReasonChange={(v) => setReasons((prev) => ({ ...prev, [m.period_month]: v }))}
                  onSubmit={() => handleSubmit(m)}
                  onApprove={() => handleApprove(m)}
                  onReject={(r) => handleReject(m, r)}
                  onReset={() => handleReset(m)}
                />
              </div>
            )
          })}
        </div>
      )}

      {/* Footer: history toggle */}
      <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid #f8fafc' }}>
        <button
          onClick={() => {
            if (historyMonth) {
              setHistoryMonth(null)
            } else {
              setHistoryMonth(mostTouchedMonth ?? sku.months[0]?.period_month ?? null)
            }
          }}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            fontSize: 13, color: TEAL, fontWeight: 600, padding: 0,
          }}
        >
          {historyMonth ? '▲ Hide History' : '▼ View History'}
        </button>

        <AnimatePresence>
          {historyMonth && (
            <HistoryDrawer
              key={historyMonth}
              skuId={sku.id}
              periodMonth={historyMonth}
              onClose={() => setHistoryMonth(null)}
            />
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

// ------------------------------------------------------------------ //
// Page
// ------------------------------------------------------------------ //

export default function DemandPlanning() {
  const [summary, setSummary] = useState<Summary | null>(null)
  const [skus, setSkus] = useState<SKUPlan[]>([])
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState<string | null>(null)

  async function load() {
    try {
      const [sumRes, skusRes] = await Promise.all([
        demandPlanningApi.getSummary(),
        demandPlanningApi.getSkus(),
      ])
      setSummary(sumRes.data)
      setSkus(skusRes.data)
    } catch (e) {
      console.error('DemandPlanning load error', e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  return (
    <div style={{ padding: 24, backgroundColor: '#f8fafc', minHeight: '100%', overflowY: 'auto' }}>
      <AnimatePresence>
        {toast && <Toast message={toast} onDone={() => setToast(null)} />}
      </AnimatePresence>

      {/* Page title */}
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: NAVY, margin: 0 }}>Demand Planning</h1>
        <p style={{ fontSize: 13, color: '#64748b', marginTop: 4, marginBottom: 0 }}>
          Monthly planning workspace — draft, override, submit and approve forecasts across all SKUs.
        </p>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', color: '#94a3b8', padding: '60px 0', fontSize: 14 }}>
          Loading plans…
        </div>
      ) : (
        <>
          {summary && <SummaryBar summary={summary} />}

          {skus.length === 0 ? (
            <div style={{ textAlign: 'center', color: '#94a3b8', padding: '60px 0', fontSize: 14 }}>
              No SKUs found. Upload data to get started.
            </div>
          ) : (
            skus.map((sku) => (
              <SKUCard
                key={sku.id}
                sku={sku}
                onRefresh={load}
                onToast={setToast}
              />
            ))
          )}
        </>
      )}
    </div>
  )
}
