import { NavLink } from 'react-router-dom'
import { useIsMobile } from '../../hooks/useIsMobile'
import { useUIStore } from '../../store'

const NAV_ITEMS = [
  { label: 'Dashboard',       path: '/dashboard',    icon: '🏠' },
  { label: 'Forecast Engine', path: '/forecast',     icon: '📈' },
  { label: 'Inventory',       path: '/inventory',    icon: '📦' },
  { label: 'Anomaly Detection', path: '/anomaly',     icon: '⚡' },
  { label: 'Supply-Demand Gap', path: '/supply-gap',  icon: '📊' },
  { label: 'MarketPulse',      path: '/pharma-pulse', icon: '🔥' },
  { label: 'Scenarios',       path: '/scenarios',    icon: '🔀' },
  { label: 'Demand Planning', path: '/demand-planning', icon: '🗂️' },
  { label: 'S&OP Console',    path: '/sop',          icon: '📋' },
  { label: 'Upload Data',     path: '/upload',       icon: '⬆️' },
]

export default function Sidebar() {
  const isMobile = useIsMobile()
  const { setSidebarOpen } = useUIStore()

  function handleNavClick() {
    if (isMobile) setSidebarOpen(false)
  }

  return (
    <>
      {/* Logo + close button on mobile */}
      <div style={{ padding: '20px', borderBottom: '1px solid rgba(255,255,255,0.06)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: '18px', fontWeight: 700, color: '#00D4B4', letterSpacing: '-0.02em' }}>PulseChain</div>
          <div style={{ fontSize: '11px', color: '#475569', marginTop: '2px' }}>Demand Planning</div>
        </div>
        {isMobile && (
          <button
            onClick={() => setSidebarOpen(false)}
            aria-label="Close menu"
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: '#94a3b8', fontSize: 20, lineHeight: 1,
              padding: '4px', borderRadius: 6, minHeight: 0,
            }}
          >
            ✕
          </button>
        )}
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: '12px', overflowY: 'auto' }}>
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            onClick={handleNavClick}
            style={({ isActive }) => ({
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '9px 12px',
              borderRadius: '10px',
              marginBottom: '2px',
              fontSize: '13px',
              fontWeight: isActive ? 600 : 400,
              color: isActive ? '#00D4B4' : '#94a3b8',
              backgroundColor: isActive ? 'rgba(0,212,180,0.1)' : 'transparent',
              borderLeft: isActive ? '2px solid #00D4B4' : '2px solid transparent',
              textDecoration: 'none',
              transition: 'all 0.15s',
              minHeight: 0,
            })}
          >
            <span style={{ fontSize: '15px', width: '20px', textAlign: 'center', flexShrink: 0 }}>{item.icon}</span>
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
      <div style={{ padding: '16px 20px', borderTop: '1px solid rgba(255,255,255,0.06)', flexShrink: 0 }}>
        <p style={{ fontSize: '11px', color: '#334155' }}>8 SKUs · 16,848 records</p>
        <p style={{ fontSize: '11px', color: '#1e293b', marginTop: '2px' }}>Data: 2014–2019</p>
      </div>
    </>
  )
}
