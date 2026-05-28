import { lazy, ReactNode, Suspense } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import Sidebar from './components/Layout/Sidebar'

const Dashboard = lazy(() => import('./pages/Dashboard'))
const ForecastEngine = lazy(() => import('./pages/ForecastEngine'))
const InventoryIntelligence = lazy(() => import('./pages/InventoryIntelligence'))
const PharmaPulse = lazy(() => import('./pages/PharmaPulse'))
const ScenarioPlanning = lazy(() => import('./pages/ScenarioPlanning'))
const SOPConsole = lazy(() => import('./pages/SOPConsole'))
const Upload = lazy(() => import('./pages/Upload'))
const Landing = lazy(() => import('./pages/Landing'))

function AppShell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100vh',
      width: '100vw',
      overflow: 'hidden',
      backgroundColor: '#0A1628'
    }}>
      <div style={{
        height: '56px',
        minHeight: '56px',
        flexShrink: 0,
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        backgroundColor: '#070f1e',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 24px',
        zIndex: 10
      }}>
        <span style={{ fontSize: '15px', fontWeight: 600, color: 'white' }}>{title}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '13px', color: '#64748b' }}>Karthik</span>
          <div style={{
            width: '32px', height: '32px', borderRadius: '50%',
            backgroundColor: '#00D4B4', display: 'flex',
            alignItems: 'center', justifyContent: 'center',
            fontSize: '13px', fontWeight: 700, color: '#0A1628'
          }}>K</div>
        </div>
      </div>
      <div style={{
        display: 'flex',
        flex: 1,
        overflow: 'hidden'
      }}>
        <div style={{
          width: '240px',
          minWidth: '240px',
          height: '100%',
          backgroundColor: '#070f1e',
          borderRight: '1px solid rgba(255,255,255,0.06)',
          display: 'flex',
          flexDirection: 'column',
          overflowY: 'auto'
        }}>
          <Sidebar />
        </div>
        <div style={{
          flex: 1,
          overflowY: 'auto',
          overflowX: 'hidden',
          backgroundColor: '#0A1628'
        }}>
          {children}
        </div>
      </div>
    </div>
  )
}

function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<div style={{height:'100vh',display:'flex',alignItems:'center',justifyContent:'center',backgroundColor:'#0A1628',color:'#00D4B4'}}>Loading...</div>}>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/dashboard" element={<AppShell title="Dashboard"><Dashboard /></AppShell>} />
          <Route path="/forecast" element={<AppShell title="Forecast Engine"><ForecastEngine /></AppShell>} />
          <Route path="/inventory" element={<AppShell title="Inventory Intelligence"><InventoryIntelligence /></AppShell>} />
          <Route path="/pharma-pulse" element={<AppShell title="PharmaPulse"><PharmaPulse /></AppShell>} />
          <Route path="/scenarios" element={<AppShell title="Scenario Planning"><ScenarioPlanning /></AppShell>} />
          <Route path="/sop" element={<AppShell title="S&OP Console"><SOPConsole /></AppShell>} />
          <Route path="/upload" element={<AppShell title="Upload Data"><Upload /></AppShell>} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}

export default App
