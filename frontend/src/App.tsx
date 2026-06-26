import { type CSSProperties, lazy, type ReactNode, Suspense, useState } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import Sidebar from './components/Layout/Sidebar'
import { useIsMobile } from './hooks/useIsMobile'
import { useUIStore } from './store'
import api from './services/api'

// Generate a persistent session ID for this browser on first load
if (!localStorage.getItem('pulsechain_session_id')) {
  localStorage.setItem(
    'pulsechain_session_id',
    'sess_' + Date.now() + Math.random().toString(36).substr(2, 5),
  )
}

const Dashboard = lazy(() => import('./pages/Dashboard'))
const ForecastEngine = lazy(() => import('./pages/ForecastEngine'))
const InventoryIntelligence = lazy(() => import('./pages/InventoryIntelligence'))
const PharmaPulse = lazy(() => import('./pages/PharmaPulse'))
const ScenarioPlanning = lazy(() => import('./pages/ScenarioPlanning'))
const SOPConsole = lazy(() => import('./pages/SOPConsole'))
const Upload = lazy(() => import('./pages/Upload'))
const Landing = lazy(() => import('./pages/Landing'))
const AnomalyDetection = lazy(() => import('./pages/AnomalyDetection'))
const SupplyDemandGap = lazy(() => import('./pages/SupplyDemandGap'))
const DemandPlanning = lazy(() => import('./pages/DemandPlanning'))

// ---- Name Gate -------------------------------------------------------

function NameGate({ onEnter }: { onEnter: (name: string) => void }) {
  const [name, setName] = useState('')
  const [error, setError] = useState('')

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = name.trim()
    if (trimmed.length < 2) {
      setError('Name must be at least 2 characters')
      return
    }
    if (!localStorage.getItem('pulsechain_session_id')) {
      localStorage.setItem(
        'pulsechain_session_id',
        'sess_' + Date.now() + Math.random().toString(36).substr(2, 5),
      )
    }
    localStorage.setItem('pulsechain_user_name', trimmed)
    onEnter(trimmed)
  }

  const inputStyle: CSSProperties = {
    width: '100%', padding: '12px 16px', borderRadius: 12,
    border: `1px solid ${error ? '#ef4444' : '#e2e8f0'}`,
    fontSize: 15, color: '#0f172a', outline: 'none',
    boxSizing: 'border-box', transition: 'border-color 0.15s',
    backgroundColor: '#fff',
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, backgroundColor: '#0A1628',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 9999,
    }}>
      <div style={{
        backgroundColor: '#ffffff', borderRadius: 24, padding: 40,
        maxWidth: 420, width: '100%', margin: '0 24px',
        boxShadow: '0 25px 50px rgba(0,0,0,0.5)',
      }}>
        <span style={{ fontSize: 22, fontWeight: 700, color: '#00D4B4' }}>⚡ PulseChain</span>
        <p style={{ fontSize: 13, color: '#94a3b8', marginTop: 4, marginBottom: 0 }}>
          From Market Signal to Supply Decision
        </p>
        <div style={{ height: 1, backgroundColor: '#e2e8f0', margin: '24px 0' }} />
        <form onSubmit={handleSubmit}>
          <p style={{ fontSize: 15, fontWeight: 600, color: '#334155', marginBottom: 12, marginTop: 0 }}>
            Welcome! What's your name?
          </p>
          <input
            type="text"
            value={name}
            onChange={(e) => { setName(e.target.value); setError('') }}
            placeholder="Enter your name e.g. Karthik"
            autoFocus
            style={inputStyle}
            onFocus={(e) => { if (!error) e.currentTarget.style.borderColor = '#00D4B4' }}
            onBlur={(e) => { if (!error) e.currentTarget.style.borderColor = '#e2e8f0' }}
          />
          {error && (
            <p style={{ fontSize: 12, color: '#ef4444', marginTop: 6, marginBottom: 0 }}>{error}</p>
          )}
          <button
            type="submit"
            style={{
              width: '100%', marginTop: 16, padding: '13px',
              backgroundColor: '#00D4B4', color: '#0A1628',
              fontWeight: 700, fontSize: 15, borderRadius: 12, border: 'none',
              cursor: 'pointer', transition: 'opacity 0.15s',
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.opacity = '0.88' }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.opacity = '1' }}
          >
            Enter PulseChain →
          </button>
        </form>
      </div>
    </div>
  )
}

// ---- App Shell -------------------------------------------------------

function AppShell({ title, children }: { title: string; children: ReactNode }) {
  const [userName, setUserName] = useState(() => localStorage.getItem('pulsechain_user_name') || '')
  const [resetting, setResetting] = useState(false)
  const [toast, setToast] = useState('')
  const isMobile = useIsMobile()
  const { sidebarOpen, setSidebarOpen } = useUIStore()

  async function handleReset() {
    if (!window.confirm('Reset to demo pharma data? This will remove your uploaded data.')) return
    setResetting(true)
    try {
      await api.post('/upload/reset-demo')
      setToast('Reset complete')
      setTimeout(() => { setToast(''); window.location.reload() }, 1500)
    } catch {
      setToast('Reset failed')
      setTimeout(() => setToast(''), 2000)
    } finally {
      setResetting(false)
    }
  }

  if (!userName) {
    return <NameGate onEnter={setUserName} />
  }

  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      height: '100vh', width: '100vw', overflow: 'hidden', backgroundColor: '#0A1628',
    }}>
      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', top: 16, right: 16, zIndex: 9999,
          padding: '10px 20px', borderRadius: 10, fontSize: 13, fontWeight: 600,
          backgroundColor: toast === 'Reset complete' ? '#00D4B4' : '#ef4444',
          color: toast === 'Reset complete' ? '#0A1628' : '#fff',
          boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
        }}>
          {toast}
        </div>
      )}

      {/* Navbar */}
      <div style={{
        height: '56px', minHeight: '56px', flexShrink: 0,
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        backgroundColor: '#070f1e',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: isMobile ? '0 12px' : '0 24px', zIndex: 10,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 8 : 0 }}>
          {/* Hamburger — mobile only */}
          {isMobile && (
            <button
              onClick={() => setSidebarOpen(true)}
              aria-label="Open menu"
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                display: 'flex', flexDirection: 'column', gap: 5,
                padding: '6px', borderRadius: 8, minHeight: 0,
              }}
            >
              <span style={{ display: 'block', width: 20, height: 2, backgroundColor: '#94a3b8', borderRadius: 1 }} />
              <span style={{ display: 'block', width: 20, height: 2, backgroundColor: '#94a3b8', borderRadius: 1 }} />
              <span style={{ display: 'block', width: 20, height: 2, backgroundColor: '#94a3b8', borderRadius: 1 }} />
            </button>
          )}
          <span style={{ fontSize: isMobile ? '13px' : '15px', fontWeight: 600, color: 'white' }}>{title}</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 8 : 12 }}>
          {/* Reset Data */}
          <button
            onClick={handleReset}
            disabled={resetting}
            style={{
              padding: isMobile ? '6px 8px' : '6px 12px', borderRadius: 8,
              border: '1px solid rgba(239,68,68,0.3)',
              backgroundColor: 'rgba(239,68,68,0.06)',
              color: '#f87171', fontSize: 12, fontWeight: 600,
              cursor: resetting ? 'not-allowed' : 'pointer',
              opacity: resetting ? 0.6 : 1, marginRight: 4,
              transition: 'all 0.15s', minHeight: 0,
              display: 'flex', alignItems: 'center', gap: 4,
            }}
            onMouseEnter={(e) => {
              if (!resetting) {
                const b = e.currentTarget as HTMLButtonElement
                b.style.backgroundColor = 'rgba(239,68,68,0.12)'
                b.style.borderColor = 'rgba(239,68,68,0.5)'
              }
            }}
            onMouseLeave={(e) => {
              const b = e.currentTarget as HTMLButtonElement
              b.style.backgroundColor = 'rgba(239,68,68,0.06)'
              b.style.borderColor = 'rgba(239,68,68,0.3)'
            }}
          >
            <span>↩</span>
            {!isMobile && <span>{resetting ? 'Resetting…' : 'Reset Data'}</span>}
          </button>

          {/* User name + avatar */}
          {!isMobile && <span style={{ fontSize: '13px', color: '#64748b' }}>{userName}</span>}
          <div style={{
            width: isMobile ? '28px' : '32px',
            height: isMobile ? '28px' : '32px',
            borderRadius: '50%',
            backgroundColor: '#00D4B4', display: 'flex',
            alignItems: 'center', justifyContent: 'center',
            fontSize: isMobile ? '11px' : '13px', fontWeight: 700, color: '#0A1628',
          }}>
            {userName.charAt(0).toUpperCase()}
          </div>
        </div>
      </div>

      {/* Sidebar + content */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden', position: 'relative' }}>

        {/* Mobile backdrop */}
        {isMobile && sidebarOpen && (
          <div
            onClick={() => setSidebarOpen(false)}
            style={{
              position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)',
              zIndex: 40, top: '56px',
            }}
          />
        )}

        {/* Sidebar */}
        <div
          className="sidebar-mobile"
          style={
            isMobile
              ? {
                  position: 'fixed', top: '56px', left: 0, bottom: 0,
                  width: '240px', maxWidth: '85vw', zIndex: 50,
                  backgroundColor: '#070f1e', borderRight: '1px solid rgba(255,255,255,0.06)',
                  display: 'flex', flexDirection: 'column', overflowY: 'auto',
                  transform: sidebarOpen ? 'translateX(0)' : 'translateX(-100%)',
                }
              : {
                  width: '240px', minWidth: '240px', height: '100%',
                  backgroundColor: '#070f1e', borderRight: '1px solid rgba(255,255,255,0.06)',
                  display: 'flex', flexDirection: 'column', overflowY: 'auto',
                }
          }
        >
          <Sidebar />
        </div>

        {/* Main content */}
        <div style={{
          flex: 1, overflowY: 'auto', overflowX: 'hidden', backgroundColor: '#0A1628',
        }}>
          {children}
        </div>
      </div>
    </div>
  )
}

// ---- App ------------------------------------------------------------

function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={
        <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#0A1628', color: '#00D4B4' }}>
          Loading...
        </div>
      }>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/dashboard" element={<AppShell title="Dashboard"><Dashboard /></AppShell>} />
          <Route path="/forecast" element={<AppShell title="Forecast Engine"><ForecastEngine /></AppShell>} />
          <Route path="/inventory" element={<AppShell title="Inventory Intelligence"><InventoryIntelligence /></AppShell>} />
          <Route path="/pharma-pulse" element={<AppShell title="MarketPulse"><PharmaPulse /></AppShell>} />
          <Route path="/scenarios" element={<AppShell title="Scenario Planning"><ScenarioPlanning /></AppShell>} />
          <Route path="/sop" element={<AppShell title="S&OP Console"><SOPConsole /></AppShell>} />
          <Route path="/upload" element={<AppShell title="Upload Data"><Upload /></AppShell>} />
          <Route path="/anomaly" element={<AppShell title="Anomaly Detection"><AnomalyDetection /></AppShell>} />
          <Route path="/supply-gap" element={<AppShell title="Supply-Demand Gap"><SupplyDemandGap /></AppShell>} />
          <Route path="/demand-planning" element={<AppShell title="Demand Planning"><DemandPlanning /></AppShell>} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}

export default App
