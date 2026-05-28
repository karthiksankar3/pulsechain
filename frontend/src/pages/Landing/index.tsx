import { useNavigate } from 'react-router-dom'

const FEATURES = [
  {
    icon: '🤖',
    title: 'AI Forecasting',
    desc: 'Prophet + XGBoost + Ensemble models with inverse-MAPE weighting for pharma-grade accuracy.',
    color: '#00D4B4',
  },
  {
    icon: '📦',
    title: 'Inventory Intelligence',
    desc: 'Safety stock optimization, expiry risk detection, and ABC-XYZ segmentation.',
    color: '#FF6B35',
  },
  {
    icon: '📡',
    title: 'PharmaPulse Signals',
    desc: 'Real-time Google Trends, Reddit, and news signal aggregation into demand forecasts.',
    color: '#a78bfa',
  },
  {
    icon: '🔀',
    title: 'Scenario Planning',
    desc: '6 pre-built scenarios: epidemic outbreak, drug shortage, competitor launch, regulatory hold, and more.',
    color: '#60a5fa',
  },
  {
    icon: '🗓️',
    title: 'S&OP Console',
    desc: 'Consensus forecasting, version comparison, and SAP-APO compatible export.',
    color: '#f59e0b',
  },
  {
    icon: '⬆️',
    title: 'File Upload',
    desc: 'Bring your own CSV/XLSX data with guided column mapping wizard.',
    color: '#10b981',
  },
]

const DATASETS = [
  { name: 'ATC Pharma Sales', desc: '8 drug categories, 16,848 records' },
  { name: 'Rossmann Sales', desc: 'Multi-store retail dataset' },
  { name: 'Supply Chain Set', desc: 'Pharmaceutical supply chain data' },
]

const TECH = [
  { name: 'Python 3.11', icon: '🐍' },
  { name: 'FastAPI', icon: '⚡' },
  { name: 'Prophet', icon: '📊' },
  { name: 'PostgreSQL', icon: '🐘' },
  { name: 'React 18', icon: '⚛️' },
  { name: 'XGBoost', icon: '🚀' },
]

export default function Landing() {
  const navigate = useNavigate()

  return (
    <div
      className="min-h-screen overflow-x-hidden"
      style={{ backgroundColor: '#0A1628', color: '#fff', fontFamily: 'Sora, DM Sans, sans-serif' }}
    >
      {/* Navbar */}
      <header
        className="sticky top-0 z-50 flex items-center justify-between px-8 py-4"
        style={{ backgroundColor: 'rgba(10,22,40,0.9)', backdropFilter: 'blur(12px)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}
      >
        <div className="flex items-center gap-3">
          <span className="text-xl font-bold" style={{ color: '#00D4B4' }}>PulseChain</span>
          <span className="rounded-full px-2.5 py-0.5 text-xs font-medium" style={{ backgroundColor: 'rgba(0,212,180,0.12)', color: '#00D4B4', border: '1px solid rgba(0,212,180,0.25)' }}>
            Beta
          </span>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/dashboard')}
            className="rounded-lg px-4 py-2 text-sm font-medium transition-all hover:opacity-80"
            style={{ color: '#94a3b8' }}
          >
            Log in
          </button>
          <button
            onClick={() => navigate('/dashboard')}
            className="rounded-lg px-4 py-2 text-sm font-semibold transition-all hover:opacity-90"
            style={{ background: 'linear-gradient(135deg, #00D4B4, #0099a8)', color: '#0A1628' }}
          >
            Get Started
          </button>
        </div>
      </header>

      {/* Hero */}
      <section className="relative flex flex-col items-center px-8 pb-24 pt-24 text-center">
        {/* ECG / pulse animation background */}
        <svg
          className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.06]"
          xmlns="http://www.w3.org/2000/svg"
          preserveAspectRatio="none"
          aria-hidden
        >
          <path
            d="M0,200 L200,200 L250,100 L300,300 L350,150 L400,200 L600,200 L650,80 L700,320 L750,180 L800,200 L1400,200"
            fill="none"
            stroke="#00D4B4"
            strokeWidth="3"
          >
            <animateTransform
              attributeName="transform"
              type="translate"
              from="0 0"
              to="-800 0"
              dur="6s"
              repeatCount="indefinite"
            />
          </path>
        </svg>

        <div className="relative max-w-3xl">
          <div
            className="mb-4 inline-block rounded-full px-4 py-1.5 text-xs font-semibold uppercase tracking-wider"
            style={{ backgroundColor: 'rgba(0,212,180,0.1)', color: '#00D4B4', border: '1px solid rgba(0,212,180,0.25)' }}
          >
            Pharma Demand Planning Platform
          </div>

          <h1 className="text-5xl font-bold leading-tight tracking-tight text-white" style={{ letterSpacing: '-0.02em' }}>
            From Market Signal to<br />
            <span style={{ color: '#00D4B4' }}>Supply Decision</span>
          </h1>

          <p className="mt-6 text-xl leading-relaxed" style={{ color: 'rgba(148,163,184,0.85)' }}>
            AI-powered demand forecasting, inventory intelligence, and S&amp;OP automation
            built specifically for pharmaceutical supply chains.
          </p>

          <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
            <button
              onClick={() => navigate('/dashboard')}
              className="rounded-xl px-8 py-3.5 text-base font-semibold shadow-lg transition-all hover:scale-105 hover:opacity-90"
              style={{ background: 'linear-gradient(135deg, #00D4B4, #0099a8)', color: '#0A1628' }}
            >
              Get Started — Free
            </button>
            <button
              onClick={() => navigate('/forecast')}
              className="rounded-xl border px-8 py-3.5 text-base font-semibold transition-all hover:bg-white/5"
              style={{ borderColor: 'rgba(255,255,255,0.2)', color: '#fff' }}
            >
              View Demo
            </button>
          </div>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-6 text-sm" style={{ color: 'rgba(148,163,184,0.6)' }}>
            {['8 Drug SKUs included', '16,848 sales records', 'No credit card required'].map((t) => (
              <span key={t} className="flex items-center gap-1.5">
                <span style={{ color: '#00D4B4' }}>✓</span> {t}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="px-8 pb-24">
        <div className="mx-auto max-w-5xl">
          <h2 className="mb-2 text-center text-3xl font-bold text-white">Everything you need to plan smarter</h2>
          <p className="mb-12 text-center" style={{ color: 'rgba(148,163,184,0.7)' }}>
            Six integrated modules — from AI forecasting to SAP export
          </p>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <div
                key={f.title}
                className="bg-white/[0.04] border border-white/[0.08] rounded-2xl p-6 hover:border-[#00D4B4]/30 transition-colors"
              >
                <div className="text-3xl mb-4">{f.icon}</div>
                <h3 className="text-base font-semibold text-white mb-2">{f.title}</h3>
                <p className="text-sm text-slate-400 leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Datasets */}
      <section className="border-t border-b px-8 py-16" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
        <div className="mx-auto max-w-5xl">
          <h2 className="mb-2 text-center text-2xl font-bold text-white">Powered by real pharma data</h2>
          <p className="mb-10 text-center" style={{ color: 'rgba(148,163,184,0.65)' }}>
            Pre-loaded with industry datasets — or bring your own
          </p>
          <div className="flex flex-wrap items-center justify-center gap-4">
            {DATASETS.map((d) => (
              <div
                key={d.name}
                className="rounded-xl px-6 py-4 text-center"
                style={{ backgroundColor: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', minWidth: 180 }}
              >
                <p className="font-semibold text-white">{d.name}</p>
                <p className="mt-0.5 text-xs" style={{ color: 'rgba(148,163,184,0.6)' }}>{d.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Tech Stack */}
      <section className="px-8 py-16">
        <div className="mx-auto max-w-5xl">
          <h2 className="mb-2 text-center text-2xl font-bold text-white">Built with enterprise-grade technology</h2>
          <p className="mb-10 text-center" style={{ color: 'rgba(148,163,184,0.65)' }}>
            Production-ready stack with ML pipelines and real-time data
          </p>
          <div className="flex flex-wrap items-center justify-center gap-4">
            {TECH.map((t) => (
              <div
                key={t.name}
                className="flex items-center gap-2.5 rounded-xl px-5 py-3"
                style={{ backgroundColor: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
              >
                <span className="text-xl">{t.icon}</span>
                <span className="text-sm font-medium text-white">{t.name}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section
        className="px-8 py-20 text-center"
        style={{
          background: 'linear-gradient(135deg, rgba(0,212,180,0.08) 0%, rgba(255,107,53,0.05) 100%)',
          borderTop: '1px solid rgba(255,255,255,0.06)',
        }}
      >
        <div className="mx-auto max-w-2xl">
          <h2 className="mb-4 text-3xl font-bold text-white">
            Ready to transform your demand planning?
          </h2>
          <p className="mb-8 text-lg" style={{ color: 'rgba(148,163,184,0.75)' }}>
            Start with 8 pre-loaded pharma SKUs or upload your own data.
          </p>
          <button
            onClick={() => navigate('/dashboard')}
            className="rounded-xl px-10 py-4 text-lg font-bold shadow-xl transition-all hover:scale-105 hover:opacity-90"
            style={{ background: 'linear-gradient(135deg, #00D4B4, #0099a8)', color: '#0A1628' }}
          >
            Start Free →
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer
        className="px-8 py-8 text-center text-sm"
        style={{ borderTop: '1px solid rgba(255,255,255,0.06)', color: 'rgba(148,163,184,0.45)' }}
      >
        PulseChain © {new Date().getFullYear()} · Pharma Demand Planning Platform
      </footer>
    </div>
  )
}
