interface NavbarProps {
  title?: string
}

export default function Navbar({ title }: NavbarProps) {
  return (
    <header
      className="flex h-14 shrink-0 items-center justify-between border-b border-white/[0.08] px-6"
      style={{ background: '#0A1628' }}
    >
      <h1 className="text-base font-semibold text-white">{title ?? 'PulseChain'}</h1>
      <div className="flex items-center gap-3">
        <span className="text-sm text-slate-400">Karthik</span>
        <div
          className="flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold"
          style={{ background: '#00D4B4', color: '#0A1628' }}
        >
          K
        </div>
      </div>
    </header>
  )
}
