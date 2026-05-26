import { NavLink } from 'react-router-dom'

interface NavItem {
  label: string
  path: string
  icon?: string
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', path: '/dashboard' },
  { label: 'Forecast Engine', path: '/forecast' },
  { label: 'Inventory Intelligence', path: '/inventory' },
  { label: 'PharmaPulse', path: '/pharma-pulse' },
  { label: 'Scenario Planning', path: '/scenarios' },
  { label: 'SOP Console', path: '/sop' },
]

export default function Sidebar() {
  return (
    <aside
      className="flex h-full w-60 flex-col bg-navy-900 px-4 py-6"
      style={{ backgroundColor: 'var(--color-navy)' }}
    >
      <div className="mb-8">
        <span className="text-xl font-bold" style={{ color: 'var(--color-teal)' }}>
          PulseChain
        </span>
      </div>
      <nav className="flex flex-col gap-1">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) =>
              `rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-teal-500/20 text-teal-500'
                  : 'text-slate-400 hover:bg-white/5 hover:text-white'
              }`
            }
          >
            {item.label}
          </NavLink>
        ))}
      </nav>
    </aside>
  )
}
