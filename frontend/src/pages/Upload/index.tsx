import { type CSSProperties, useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { uploadApi, type CurrentDatasetInfo, type MapColumnsResponse, type UploadResponse } from '../../services/api'

type Step = 1 | 2 | 3

const REQUIRED_FIELDS = ['date', 'product_name', 'quantity']
const OPTIONAL_FIELDS = ['revenue', 'geography', 'channel']
const ALL_FIELDS = [...REQUIRED_FIELDS, ...OPTIONAL_FIELDS]

const FIELD_LABELS: Record<string, string> = {
  date: 'Date',
  product_name: 'Product Name',
  quantity: 'Quantity',
  revenue: 'Revenue',
  geography: 'Geography / Region',
  channel: 'Sales Channel',
}

const card: CSSProperties = {
  backgroundColor: '#ffffff',
  border: '1px solid #e2e8f0',
  borderRadius: '16px',
  boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
}

// ---- Dataset Banner -------------------------------------------------

function DatasetBanner() {
  const [info, setInfo] = useState<CurrentDatasetInfo | null>(null)
  const [resetting, setResetting] = useState(false)

  useEffect(() => {
    uploadApi.getCurrentDataset().then((r) => setInfo(r.data)).catch(() => {})
  }, [])

  if (!info || info.source === 'demo') return null

  async function handleReset() {
    setResetting(true)
    try {
      await uploadApi.resetToDemo()
      setInfo(null)
    } catch {
      // silently fail — user can retry
    } finally {
      setResetting(false)
    }
  }

  return (
    <div style={{
      marginBottom: 24, padding: '16px 20px', borderRadius: 14,
      backgroundColor: 'rgba(0,212,180,0.06)', border: '1px solid rgba(0,212,180,0.25)',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ fontSize: 20 }}>📁</span>
        <div>
          <p style={{ fontSize: 13, fontWeight: 600, color: '#0f172a', margin: 0, marginBottom: 2 }}>
            Custom dataset active: <span style={{ color: '#00D4B4' }}>{info.filename ?? 'Uploaded file'}</span>
          </p>
          <p style={{ fontSize: 12, color: '#94a3b8', margin: 0 }}>
            {info.sku_count} SKUs · {info.record_count.toLocaleString()} records · {info.date_range_start} to {info.date_range_end}
            {' · '}
            <span style={{ fontFamily: 'monospace', color: '#cbd5e1' }}>
              Session: {(localStorage.getItem('pulsechain_session_id') || 'demo').slice(0, 12)}…
            </span>
          </p>
        </div>
      </div>
      <button
        onClick={handleReset}
        disabled={resetting}
        style={{
          padding: '8px 16px', borderRadius: 10, border: '1px solid rgba(239,68,68,0.3)',
          backgroundColor: 'rgba(239,68,68,0.06)', color: '#ef4444', fontSize: 13, fontWeight: 600,
          cursor: resetting ? 'not-allowed' : 'pointer', opacity: resetting ? 0.6 : 1, whiteSpace: 'nowrap',
        }}
      >
        {resetting ? 'Resetting...' : '↩ Reset to Demo Data'}
      </button>
    </div>
  )
}

// ---- Step bar -------------------------------------------------------

function StepBar({ current }: { current: Step }) {
  const steps = [
    { n: 1 as Step, label: 'Upload File' },
    { n: 2 as Step, label: 'Map Columns' },
    { n: 3 as Step, label: 'Confirm & Import' },
  ]
  return (
    <div style={{ display: 'flex', alignItems: 'center', marginBottom: 36 }}>
      {steps.map((s, i) => (
        <div key={s.n} style={{ display: 'flex', alignItems: 'center', flex: i < steps.length - 1 ? 1 : 'none' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            <div style={{
              width: 36, height: 36, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 14, fontWeight: 700,
              backgroundColor: current > s.n ? 'rgba(0,212,180,0.12)' : current === s.n ? '#00D4B4' : '#f1f5f9',
              color: current > s.n ? '#00D4B4' : current === s.n ? '#0A1628' : '#94a3b8',
              border: current === s.n ? 'none' : current > s.n ? '1px solid rgba(0,212,180,0.3)' : '1px solid #e2e8f0',
            }}>
              {current > s.n ? '✓' : s.n}
            </div>
            <span style={{ fontSize: 12, fontWeight: 500, whiteSpace: 'nowrap', color: current === s.n ? '#00D4B4' : current > s.n ? '#64748b' : '#94a3b8' }}>
              {s.label}
            </span>
          </div>
          {i < steps.length - 1 && (
            <div style={{ flex: 1, height: 1, margin: '0 12px', marginBottom: 20, backgroundColor: current > s.n + 1 ? 'rgba(0,212,180,0.4)' : '#e2e8f0' }} />
          )}
        </div>
      ))}
    </div>
  )
}

// ---- Step 1: Upload File -------------------------------------------

function Step1Upload({ onSuccess }: { onSuccess: (resp: UploadResponse) => void }) {
  const [dragging, setDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<UploadResponse | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleFile = useCallback(async (file: File) => {
    const ext = file.name.split('.').pop()?.toLowerCase()
    if (!ext || !['csv', 'xlsx', 'xls'].includes(ext)) {
      setError('Only CSV and XLSX files are supported')
      return
    }
    if (file.size > 50 * 1024 * 1024) {
      setError('File exceeds 50 MB limit')
      return
    }
    setError(null)
    setUploading(true)
    try {
      const r = await uploadApi.uploadFile(file)
      setResult(r.data)
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } }; message?: string }
      setError(err?.response?.data?.detail ?? 'Upload failed — check the file and try again')
    } finally {
      setUploading(false)
    }
  }, [])

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }, [handleFile])

  function downloadTemplate() {
    uploadApi.downloadTemplate().then((r) => {
      const url = URL.createObjectURL(r.data)
      const a = document.createElement('a')
      a.href = url
      a.download = 'pulsechain_template.csv'
      a.click()
      URL.revokeObjectURL(url)
    })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Drop zone */}
      <div
        onDrop={onDrop}
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onClick={() => inputRef.current?.click()}
        style={{
          border: `2px dashed ${dragging ? '#00D4B4' : '#e2e8f0'}`,
          borderRadius: 20,
          padding: '64px 32px',
          textAlign: 'center',
          cursor: 'pointer',
          backgroundColor: dragging ? 'rgba(0,212,180,0.04)' : '#fafafa',
          transition: 'all 0.15s',
        }}
        onMouseEnter={(e) => { if (!dragging) (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(0,212,180,0.5)' }}
        onMouseLeave={(e) => { if (!dragging) (e.currentTarget as HTMLDivElement).style.borderColor = '#e2e8f0' }}
      >
        <div style={{ fontSize: 48, marginBottom: 16 }}>📂</div>
        <p style={{ fontSize: 20, fontWeight: 600, color: '#0f172a', marginBottom: 8 }}>
          {dragging ? 'Drop your file here' : 'Drag & drop your file here'}
        </p>
        <p style={{ fontSize: 14, color: '#94a3b8' }}>
          or <span style={{ color: '#00D4B4', textDecoration: 'underline' }}>click to browse</span>
        </p>
        <p style={{ fontSize: 12, color: '#cbd5e1', marginTop: 12 }}>Accepted: CSV, XLSX · Max 50 MB</p>
        <input
          ref={inputRef}
          type="file"
          accept=".csv,.xlsx,.xls"
          style={{ display: 'none' }}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
        />
      </div>

      {/* Upload progress */}
      {uploading && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#94a3b8', marginBottom: 6 }}>
            <span>Uploading...</span>
          </div>
          <div style={{ height: 6, borderRadius: 3, backgroundColor: '#f1f5f9', overflow: 'hidden' }}>
            <div className="animate-pulse" style={{ height: '100%', width: '60%', backgroundColor: '#00D4B4', borderRadius: 3 }} />
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={{ padding: '12px 16px', borderRadius: 12, backgroundColor: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#ef4444', fontSize: 13 }}>
          {error}
        </div>
      )}

      {/* Success */}
      {result && (
        <div style={{ borderRadius: 16, padding: 20, backgroundColor: 'rgba(0,212,180,0.06)', border: '1px solid rgba(0,212,180,0.25)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            <span style={{ fontSize: 20 }}>✅</span>
            <p style={{ fontWeight: 600, color: '#0f172a' }}>{result.filename}</p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 16 }}>
            {[
              { label: 'Rows', value: result.row_count.toLocaleString() },
              { label: 'Columns', value: result.detected_columns.length.toString() },
              { label: 'Date Range', value: result.date_range ?? 'N/A' },
            ].map((s) => (
              <div key={s.label} style={{ backgroundColor: 'rgba(0,212,180,0.08)', borderRadius: 12, padding: '12px', textAlign: 'center' }}>
                <p style={{ fontSize: 22, fontWeight: 700, color: '#00D4B4', marginBottom: 4 }}>{s.value}</p>
                <p style={{ fontSize: 12, color: '#94a3b8' }}>{s.label}</p>
              </div>
            ))}
          </div>
          <button
            onClick={() => onSuccess(result)}
            style={{ width: '100%', padding: '12px', borderRadius: 12, border: 'none', background: 'linear-gradient(135deg,#00D4B4,#0099a8)', color: '#0A1628', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}
          >
            Continue to Column Mapping →
          </button>
        </div>
      )}

      {/* Template download */}
      <button
        onClick={downloadTemplate}
        style={{ padding: '12px', borderRadius: 12, border: '1px solid #e2e8f0', backgroundColor: '#fff', color: '#64748b', fontSize: 13, fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
      >
        ⬇ Download CSV Template
      </button>
    </div>
  )
}

// ---- Step 2: Map Columns -------------------------------------------

function Step2Map({ upload, onSuccess, onBack }: { upload: UploadResponse; onSuccess: (mapping: Record<string, string>) => void; onBack: () => void }) {
  const [mapping, setMapping] = useState<Record<string, string>>({})
  const [validating, setValidating] = useState(false)
  const [result, setResult] = useState<MapColumnsResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  function setMap(ourField: string, theirCol: string) {
    setMapping((prev) => ({ ...prev, [ourField]: theirCol }))
    setResult(null)
  }

  async function validate() {
    setValidating(true)
    setError(null)
    try {
      const r = await uploadApi.mapColumns(upload.file_id, mapping)
      setResult(r.data)
      if (r.data.valid) onSuccess(mapping)
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } }; message?: string }
      setError(err?.response?.data?.detail ?? 'Validation failed')
    } finally {
      setValidating(false)
    }
  }

  const selectStyle: CSSProperties = {
    width: '100%', padding: '8px 12px', borderRadius: 10,
    border: '1px solid #e2e8f0', fontSize: 13, color: '#0f172a',
    backgroundColor: '#fff', outline: 'none',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <p style={{ fontSize: 13, color: '#94a3b8' }}>
        Map your file's columns to PulseChain's required fields.
        Detected <strong style={{ color: '#0f172a' }}>{upload.detected_columns.length}</strong> columns in <strong style={{ color: '#0f172a' }}>{upload.filename}</strong>.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {ALL_FIELDS.map((field) => {
          const isRequired = REQUIRED_FIELDS.includes(field)
          const mapped = mapping[field]
          return (
            <div
              key={field}
              style={{
                display: 'flex', alignItems: 'center', gap: 16, padding: '14px 16px', borderRadius: 12,
                backgroundColor: mapped ? 'rgba(0,212,180,0.04)' : '#fafafa',
                border: `1px solid ${mapped ? 'rgba(0,212,180,0.3)' : '#e2e8f0'}`,
              }}
            >
              <div style={{ width: 144, flexShrink: 0 }}>
                <p style={{ fontSize: 13, fontWeight: 500, color: '#0f172a', marginBottom: 2 }}>{FIELD_LABELS[field]}</p>
                <span style={{ fontSize: 11, fontWeight: 600, color: isRequired ? '#ef4444' : '#94a3b8' }}>
                  {isRequired ? '● Required' : '○ Optional'}
                </span>
              </div>
              <div style={{ flex: 1 }}>
                <select value={mapped ?? ''} onChange={(e) => setMap(field, e.target.value)} style={selectStyle}>
                  <option value="">— Select column —</option>
                  {upload.detected_columns.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
              {mapped && <span style={{ color: '#00D4B4', fontSize: 16, flexShrink: 0 }}>✓</span>}
            </div>
          )
        })}
      </div>

      {/* Preview table */}
      {result?.preview && result.preview.length > 0 && (
        <div>
          <p style={{ fontSize: 13, fontWeight: 600, color: '#0f172a', marginBottom: 10 }}>Preview (mapped)</p>
          <div style={{ overflowX: 'auto', borderRadius: 12, border: '1px solid #e2e8f0' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ backgroundColor: '#f8fafc' }}>
                  {Object.keys(result.preview[0]).map((h) => (
                    <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#94a3b8', borderBottom: '1px solid #e2e8f0' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {result.preview.map((row, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    {Object.values(row).map((v, vi) => (
                      <td key={vi} style={{ padding: '10px 14px', fontFamily: 'monospace', color: '#64748b' }}>{String(v)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Validation errors */}
      {result && !result.valid && (
        <div style={{ padding: '14px 16px', borderRadius: 12, backgroundColor: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
          <p style={{ fontSize: 13, fontWeight: 600, color: '#ef4444', marginBottom: 8 }}>Validation errors:</p>
          {result.errors.map((e, i) => (
            <p key={i} style={{ fontSize: 12, color: '#ef4444' }}>• {e}</p>
          ))}
        </div>
      )}

      {error && (
        <div style={{ padding: '12px 16px', borderRadius: 12, backgroundColor: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#ef4444', fontSize: 13 }}>
          {error}
        </div>
      )}

      <div style={{ display: 'flex', gap: 12 }}>
        <button
          onClick={onBack}
          style={{ padding: '12px 20px', borderRadius: 12, border: '1px solid #e2e8f0', backgroundColor: '#fff', color: '#64748b', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}
        >
          ← Back
        </button>
        <button
          onClick={validate}
          disabled={validating}
          style={{ flex: 1, padding: '12px', borderRadius: 12, border: 'none', background: 'linear-gradient(135deg,#00D4B4,#0099a8)', color: '#0A1628', fontSize: 14, fontWeight: 700, cursor: validating ? 'not-allowed' : 'pointer', opacity: validating ? 0.6 : 1 }}
        >
          {validating ? 'Validating...' : 'Validate & Continue →'}
        </button>
      </div>
    </div>
  )
}

// ---- Step 3: Confirm & Import ---------------------------------------

function Step3Confirm({ upload, mapping, onBack }: { upload: UploadResponse; mapping: Record<string, string>; onBack: () => void }) {
  const navigate = useNavigate()
  const [orgName, setOrgName] = useState('')
  const [importing, setImporting] = useState(false)
  const [progress, setProgress] = useState(0)
  const [done, setDone] = useState<{ skus_created: number; records_inserted: number; date_range: string } | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function doImport() {
    if (!orgName.trim()) return
    setImporting(true)
    setError(null)
    const interval = setInterval(() => setProgress((p) => Math.min(p + 8, 90)), 200)
    try {
      const r = await uploadApi.ingest(upload.file_id, mapping, orgName)
      clearInterval(interval)
      setProgress(100)
      setDone(r.data)
    } catch (e: unknown) {
      clearInterval(interval)
      const err = e as { response?: { data?: { detail?: string } }; message?: string }
      setError(err?.response?.data?.detail ?? 'Import failed')
    } finally {
      setImporting(false)
    }
  }

  useEffect(() => {
    if (!done) return
    const t = setTimeout(() => navigate('/forecast'), 2000)
    return () => clearTimeout(t)
  }, [done, navigate])

  if (done) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24, padding: '32px 0', textAlign: 'center' }}>
        <div style={{ fontSize: 64 }}>🎉</div>
        <h2 style={{ fontSize: 28, fontWeight: 700, color: '#0f172a', margin: 0 }}>Import Complete!</h2>
        <div style={{ display: 'flex', gap: 20 }}>
          {[
            { label: 'SKUs Created', value: done.skus_created },
            { label: 'Records Imported', value: done.records_inserted.toLocaleString() },
          ].map((s) => (
            <div key={s.label} style={{ borderRadius: 16, padding: '20px 32px', textAlign: 'center', backgroundColor: 'rgba(0,212,180,0.06)', border: '1px solid rgba(0,212,180,0.25)', minWidth: 140 }}>
              <p style={{ fontSize: 36, fontWeight: 700, color: '#00D4B4', margin: 0, marginBottom: 6 }}>{s.value}</p>
              <p style={{ fontSize: 13, color: '#94a3b8' }}>{s.label}</p>
            </div>
          ))}
        </div>
        <p style={{ fontSize: 13, color: '#94a3b8' }}>Date range: {done.date_range}</p>
        <p style={{ fontSize: 12, color: '#94a3b8' }}>Redirecting to Forecast Engine in 2 seconds…</p>
        <button
          onClick={() => navigate('/forecast')}
          style={{ padding: '12px 32px', borderRadius: 12, border: 'none', background: 'linear-gradient(135deg,#00D4B4,#0099a8)', color: '#0A1628', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}
        >
          Go to Forecast Engine →
        </button>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Summary */}
      <div style={{ backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 14, padding: 20 }}>
        <p style={{ fontSize: 14, fontWeight: 600, color: '#0f172a', marginBottom: 16 }}>Import Summary</p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          {[
            { label: 'Rows to import', value: upload.row_count.toLocaleString() },
            { label: 'Columns mapped', value: Object.keys(mapping).length.toString() },
            { label: 'Date range', value: upload.date_range ?? 'N/A' },
            { label: 'Source file', value: upload.filename },
          ].map((s) => (
            <div key={s.label}>
              <p style={{ fontSize: 11, color: '#94a3b8', marginBottom: 4, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{s.label}</p>
              <p style={{ fontSize: 14, fontWeight: 500, color: '#0f172a' }}>{s.value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Org name */}
      <div>
        <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#0f172a', marginBottom: 8 }}>
          Organization Name <span style={{ color: '#ef4444' }}>*</span>
        </label>
        <input
          value={orgName}
          onChange={(e) => setOrgName(e.target.value)}
          placeholder="e.g. Acme Corp"
          style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 14, color: '#0f172a', outline: 'none', boxSizing: 'border-box', backgroundColor: '#fff' }}
        />
      </div>

      {/* Progress bar */}
      {importing && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#94a3b8', marginBottom: 6 }}>
            <span>Importing data...</span>
            <span>{progress}%</span>
          </div>
          <div style={{ height: 8, borderRadius: 4, backgroundColor: '#f1f5f9', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${progress}%`, backgroundColor: '#00D4B4', borderRadius: 4, transition: 'width 0.3s ease' }} />
          </div>
        </div>
      )}

      {error && (
        <div style={{ padding: '12px 16px', borderRadius: 12, backgroundColor: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#ef4444', fontSize: 13 }}>
          {error}
        </div>
      )}

      <div style={{ display: 'flex', gap: 12 }}>
        <button
          onClick={onBack}
          disabled={importing}
          style={{ padding: '12px 20px', borderRadius: 12, border: '1px solid #e2e8f0', backgroundColor: '#fff', color: '#64748b', fontSize: 13, fontWeight: 500, cursor: importing ? 'not-allowed' : 'pointer', opacity: importing ? 0.5 : 1 }}
        >
          ← Back
        </button>
        <button
          onClick={doImport}
          disabled={importing || !orgName.trim()}
          style={{ flex: 1, padding: '12px', borderRadius: 12, border: 'none', background: 'linear-gradient(135deg,#00D4B4,#0099a8)', color: '#0A1628', fontSize: 14, fontWeight: 700, cursor: (importing || !orgName.trim()) ? 'not-allowed' : 'pointer', opacity: (importing || !orgName.trim()) ? 0.5 : 1 }}
        >
          {importing ? 'Importing...' : 'Import Data'}
        </button>
      </div>
    </div>
  )
}

// ---- Main page ------------------------------------------------------

export default function Upload() {
  const [step, setStep] = useState<Step>(1)
  const [upload, setUpload] = useState<UploadResponse | null>(null)
  const [mapping, setMapping] = useState<Record<string, string>>({})

  return (
    <div style={{ background: '#f8fafc', minHeight: '100%', padding: 24 }}>
      <div style={{ maxWidth: 720, margin: '0 auto' }}>

        {/* Header */}
        <div style={{ marginBottom: 32 }}>
          <h1 style={{ fontSize: 28, fontWeight: 700, color: '#0f172a', margin: 0 }}>Upload Data</h1>
          <p style={{ fontSize: 14, color: '#94a3b8', marginTop: 6 }}>Import your CSV or XLSX sales data into PulseChain</p>
        </div>

        {/* Current dataset banner */}
        <DatasetBanner />

        {/* Step bar */}
        <StepBar current={step} />

        {/* Step content */}
        <div style={{ ...card, padding: 28 }}>
          {step === 1 && (
            <Step1Upload onSuccess={(resp) => { setUpload(resp); setStep(2) }} />
          )}
          {step === 2 && upload && (
            <Step2Map upload={upload} onSuccess={(m) => { setMapping(m); setStep(3) }} onBack={() => setStep(1)} />
          )}
          {step === 3 && upload && (
            <Step3Confirm upload={upload} mapping={mapping} onBack={() => setStep(2)} />
          )}
        </div>
      </div>
    </div>
  )
}
