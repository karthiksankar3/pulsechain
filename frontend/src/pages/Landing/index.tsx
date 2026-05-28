import { type CSSProperties, useState } from 'react'
import { useNavigate } from 'react-router-dom'

const FEATURES = [
  { icon: '🤖', title: 'AI Forecasting', desc: 'Prophet + XGBoost + Ensemble models with inverse-MAPE weighting for pharma-grade accuracy.' },
  { icon: '📦', title: 'Inventory Intelligence', desc: 'Safety stock optimization, expiry risk detection, and ABC-XYZ segmentation.' },
  { icon: '🔥', title: 'PharmaPulse Signals', desc: 'Google Trends, Reddit, and news signal aggregation into demand forecasts.' },
  { icon: '🔀', title: 'Scenario Planning', desc: '6 pre-built scenarios: epidemic outbreak, tender win, competitor launch, and more.' },
  { icon: '📋', title: 'S&OP Console', desc: 'Consensus forecasting, version comparison, and SAP-APO compatible export.' },
  { icon: '⬆️', title: 'File Upload', desc: 'Bring your own CSV/XLSX data with guided column mapping wizard.' },
]

const STATS = [
  { number: '16,848', label: 'Sales Records' },
  { number: '8', label: 'ATC Drug SKUs' },
  { number: '6', label: 'Years of Data' },
]

const TECH_BADGES = [
  'Python 3.11', 'FastAPI', 'Prophet', 'XGBoost',
  'PostgreSQL', 'React', 'Tailwind CSS', 'Docker', 'Railway',
]

function FeatureCard({ icon, title, desc }: { icon: string; title: string; desc: string }) {
  const [hovered, setHovered] = useState(false)
  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        backgroundColor: '#ffffff',
        border: `1px solid ${hovered ? 'rgba(0,212,180,0.4)' : '#e2e8f0'}`,
        borderRadius: 20,
        padding: 28,
        boxShadow: hovered ? '0 4px 16px rgba(0,212,180,0.10)' : '0 1px 3px rgba(0,0,0,0.06)',
        transition: 'all 0.2s',
      }}
    >
      <div style={{ width: 48, height: 48, borderRadius: 14, backgroundColor: '#f0fdf9', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, marginBottom: 20 }}>
        {icon}
      </div>
      <h3 style={{ fontSize: 17, fontWeight: 700, color: '#0f172a', marginBottom: 8 }}>{title}</h3>
      <p style={{ fontSize: 14, color: '#64748b', lineHeight: 1.65 }}>{desc}</p>
    </div>
  )
}

// ---- Name Gate Modal ------------------------------------------------

function NameGateModal({ onEnter }: { onEnter: (name: string) => void }) {
  const [name, setName] = useState('')
  const [error, setError] = useState('')

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = name.trim()
    if (trimmed.length < 2) {
      setError('Name must be at least 2 characters')
      return
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
    /* Backdrop */
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      backgroundColor: 'rgba(10,22,40,0.85)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      backdropFilter: 'blur(4px)',
    }}>
      <div style={{
        backgroundColor: '#ffffff', borderRadius: 24, padding: 40,
        maxWidth: 420, width: '100%', margin: '0 24px',
        boxShadow: '0 25px 50px rgba(0,0,0,0.5)',
      }}>
        {/* Logo */}
        <span style={{ fontSize: 22, fontWeight: 700, color: '#00D4B4' }}>⚡ PulseChain</span>
        <p style={{ fontSize: 13, color: '#94a3b8', marginTop: 4, marginBottom: 0 }}>
          From Market Signal to Supply Decision
        </p>

        {/* Divider */}
        <div style={{ height: 1, backgroundColor: '#e2e8f0', margin: '24px 0' }} />

        {/* Form */}
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

// ---- Landing Page ---------------------------------------------------

export default function Landing() {
  const navigate = useNavigate()
  const [showGate, setShowGate] = useState(false)
  const [pendingPath, setPendingPath] = useState('/dashboard')

  function goTo(path: string) {
    const stored = localStorage.getItem('pulsechain_user_name')
    if (stored && stored.trim().length >= 2) {
      navigate(path)
    } else {
      setPendingPath(path)
      setShowGate(true)
    }
  }

  function handleNameEntered() {
    setShowGate(false)
    navigate(pendingPath)
  }

  const navBtnOutline: CSSProperties = {
    padding: '8px 20px', borderRadius: 12, border: '1px solid #e2e8f0',
    backgroundColor: '#fff', color: '#0f172a', fontSize: 14, fontWeight: 600,
    cursor: 'pointer', transition: 'all 0.15s',
  }

  const navBtnFill: CSSProperties = {
    padding: '8px 20px', borderRadius: 12, border: 'none',
    backgroundColor: '#00D4B4', color: '#0A1628', fontSize: 14, fontWeight: 700,
    cursor: 'pointer', transition: 'all 0.15s',
  }

  return (
    <div style={{ backgroundColor: '#f8fafc', minHeight: '100vh', overflowX: 'hidden', fontFamily: "'DM Sans', 'Sora', sans-serif" }}>

      {/* Name gate modal */}
      {showGate && <NameGateModal onEnter={handleNameEntered} />}

      {/* Navbar */}
      <header style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 50,
        height: 60, backgroundColor: '#ffffff', borderBottom: '1px solid #e2e8f0',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 40px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 20, fontWeight: 700, color: '#00D4B4', letterSpacing: '-0.02em' }}>PulseChain</span>
          <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 999, backgroundColor: 'rgba(0,212,180,0.10)', color: '#00D4B4', border: '1px solid rgba(0,212,180,0.25)' }}>
            Beta
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={() => goTo('/dashboard')} style={navBtnOutline}>Log in</button>
          <button onClick={() => goTo('/dashboard')} style={navBtnFill}>Get Started</button>
        </div>
      </header>

      {/* Hero */}
      <section style={{
        minHeight: '100vh', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', textAlign: 'center',
        paddingTop: 80, paddingBottom: 80, paddingLeft: 40, paddingRight: 40,
        background: 'radial-gradient(ellipse 80% 50% at 50% 40%, rgba(0,212,180,0.07) 0%, transparent 70%), #ffffff',
      }}>
        <div style={{ maxWidth: 720 }}>
          {/* Eyebrow */}
          <p style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.12em', color: '#00D4B4', marginBottom: 20 }}>
            Pharma Demand Planning Platform
          </p>

          {/* Headline */}
          <h1 style={{ fontSize: 64, fontWeight: 800, lineHeight: 1.1, color: '#0f172a', margin: 0, letterSpacing: '-0.03em' }}>
            From Market Signal to
          </h1>
          <h1 style={{ fontSize: 64, fontWeight: 800, lineHeight: 1.1, color: '#00D4B4', margin: 0, marginBottom: 20, letterSpacing: '-0.03em' }}>
            Supply Decision
          </h1>

          {/* Subheading */}
          <p style={{ fontSize: 18, color: '#64748b', maxWidth: 600, margin: '0 auto', lineHeight: 1.7 }}>
            AI-powered demand forecasting, inventory intelligence, and S&OP automation built specifically for pharmaceutical supply chains.
          </p>

          {/* CTA buttons */}
          <div style={{ display: 'flex', gap: 16, justifyContent: 'center', marginTop: 40, flexWrap: 'wrap' }}>
            <button
              onClick={() => goTo('/dashboard')}
              style={{ backgroundColor: '#00D4B4', color: '#0A1628', fontWeight: 700, fontSize: 16, padding: '16px 32px', borderRadius: 16, border: 'none', cursor: 'pointer', boxShadow: '0 8px 24px rgba(0,212,180,0.25)', transition: 'all 0.15s' }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.opacity = '0.9' }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.opacity = '1' }}
            >
              Get Started — Free
            </button>
            <button
              onClick={() => goTo('/forecast')}
              style={{ backgroundColor: '#fff', color: '#0f172a', fontWeight: 600, fontSize: 16, padding: '16px 32px', borderRadius: 16, border: '2px solid #e2e8f0', cursor: 'pointer', transition: 'all 0.15s' }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#00D4B4' }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#e2e8f0' }}
            >
              View Demo
            </button>
          </div>

          {/* Trust line */}
          <div style={{ display: 'flex', gap: 24, justifyContent: 'center', marginTop: 24, flexWrap: 'wrap' }}>
            {['8 Drug SKUs included', '16,848 sales records', 'No credit card required'].map((t) => (
              <span key={t} style={{ fontSize: 13, color: '#94a3b8', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ color: '#00D4B4', fontWeight: 700 }}>✓</span> {t}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section style={{ backgroundColor: '#f8fafc', padding: '80px 40px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <p style={{ fontSize: 13, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.10em', color: '#00D4B4', textAlign: 'center', marginBottom: 12 }}>
            Everything you need to plan smarter
          </p>
          <h2 style={{ fontSize: 40, fontWeight: 800, color: '#0f172a', textAlign: 'center', margin: 0, marginBottom: 8, letterSpacing: '-0.02em' }}>
            Six integrated modules
          </h2>
          <p style={{ fontSize: 16, color: '#64748b', textAlign: 'center', marginBottom: 48, marginTop: 0 }}>
            From AI forecasting to SAP export
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 24 }}>
            {FEATURES.map((f) => (
              <FeatureCard key={f.title} {...f} />
            ))}
          </div>
        </div>
      </section>

      {/* Data section */}
      <section style={{ backgroundColor: '#ffffff', padding: '60px 40px' }}>
        <div style={{ maxWidth: 700, margin: '0 auto', textAlign: 'center' }}>
          <h2 style={{ fontSize: 32, fontWeight: 700, color: '#0f172a', margin: 0, marginBottom: 12, letterSpacing: '-0.02em' }}>
            Powered by real pharma data
          </h2>
          <p style={{ fontSize: 15, color: '#64748b', marginBottom: 40 }}>
            Pre-loaded with industry datasets — or bring your own
          </p>
          <div style={{ display: 'flex', gap: 20, justifyContent: 'center', flexWrap: 'wrap' }}>
            {STATS.map((s) => (
              <div key={s.label} style={{ flex: 1, minWidth: 160, backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: 20, padding: '24px 20px', textAlign: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
                <p style={{ fontSize: 40, fontWeight: 700, color: '#00D4B4', margin: 0, marginBottom: 8, letterSpacing: '-0.02em' }}>{s.number}</p>
                <p style={{ fontSize: 13, color: '#64748b', margin: 0 }}>{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Tech stack */}
      <section style={{ backgroundColor: '#f8fafc', padding: '60px 40px' }}>
        <div style={{ maxWidth: 900, margin: '0 auto', textAlign: 'center' }}>
          <h2 style={{ fontSize: 28, fontWeight: 700, color: '#0f172a', margin: 0, marginBottom: 40, letterSpacing: '-0.02em' }}>
            Built with enterprise-grade technology
          </h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 12 }}>
            {TECH_BADGES.map((t) => (
              <div key={t} style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '10px 20px', fontSize: 14, fontWeight: 600, color: '#0f172a', boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}>
                {t}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA section */}
      <section style={{ background: 'linear-gradient(135deg, #0A1628 0%, #0d2040 100%)', padding: '80px 40px', textAlign: 'center' }}>
        <div style={{ maxWidth: 640, margin: '0 auto' }}>
          <h2 style={{ fontSize: 40, fontWeight: 700, color: '#ffffff', margin: 0, marginBottom: 12, letterSpacing: '-0.02em' }}>
            Ready to transform your demand planning?
          </h2>
          <p style={{ fontSize: 16, color: 'rgba(255,255,255,0.6)', margin: 0, marginBottom: 32 }}>
            Start with 8 pre-loaded pharma SKUs or upload your own data.
          </p>
          <button
            onClick={() => goTo('/dashboard')}
            style={{ backgroundColor: '#00D4B4', color: '#0A1628', fontWeight: 700, fontSize: 16, padding: '16px 40px', borderRadius: 16, border: 'none', cursor: 'pointer', transition: 'all 0.15s' }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.opacity = '0.9' }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.opacity = '1' }}
          >
            Start Free — No credit card required
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer style={{ backgroundColor: '#ffffff', borderTop: '1px solid #e2e8f0', padding: '24px 40px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 16, fontWeight: 700, color: '#00D4B4' }}>PulseChain</span>
          <span style={{ fontSize: 12, color: '#94a3b8' }}>© {new Date().getFullYear()} All rights reserved</span>
        </div>
        <a
          href="https://github.com/karthiksankar3/pulsechain"
          target="_blank"
          rel="noopener noreferrer"
          style={{ fontSize: 14, color: '#64748b', textDecoration: 'none', transition: 'color 0.15s' }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLAnchorElement).style.color = '#00D4B4' }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLAnchorElement).style.color = '#64748b' }}
        >
          github.com/karthiksankar3/pulsechain
        </a>
      </footer>

    </div>
  )
}
