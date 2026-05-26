interface NavbarProps {
  title?: string
}

export default function Navbar({ title }: NavbarProps) {
  return (
    <header className="flex h-14 items-center justify-between border-b border-white/10 bg-navy-900/80 px-6 backdrop-blur">
      <h1 className="text-base font-semibold text-white">{title ?? 'PulseChain'}</h1>
      <div className="flex items-center gap-4">
        <span className="text-sm text-slate-400">User</span>
      </div>
    </header>
  )
}
