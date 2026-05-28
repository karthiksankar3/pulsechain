import { useState } from 'react'
import api from '../../services/api'

interface NavbarProps {
  title?: string
}

export default function Navbar({ title }: NavbarProps) {
  const userName = localStorage.getItem('pulsechain_user_name') || 'User'
  const [resetting, setResetting] = useState(false)
  const [toast, setToast] = useState('')

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

  return (
    <>
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
      <header
        className="flex h-14 shrink-0 items-center justify-between border-b border-white/[0.08] px-6"
        style={{ background: '#0A1628' }}
      >
        <h1 className="text-base font-semibold text-white">{title ?? 'PulseChain'}</h1>
        <div className="flex items-center gap-3">
          <button
            onClick={handleReset}
            disabled={resetting}
            className="mr-3 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-400 transition-colors hover:border-red-300 hover:bg-red-50 disabled:opacity-60"
          >
            {resetting ? 'Resetting…' : '↩ Reset Data'}
          </button>
          <span className="text-sm text-slate-400">{userName}</span>
          <div
            className="flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold"
            style={{ background: '#00D4B4', color: '#0A1628' }}
          >
            {userName.charAt(0).toUpperCase()}
          </div>
        </div>
      </header>
    </>
  )
}
