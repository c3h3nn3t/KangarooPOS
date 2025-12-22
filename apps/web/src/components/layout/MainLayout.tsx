import { Outlet, NavLink } from 'react-router-dom'
import { clsx } from 'clsx'

const navItems = [
  { path: '/pos', label: 'POS', icon: '💳' },
  { path: '/orders', label: 'Siparisler', icon: '📋' },
  { path: '/kds', label: 'Mutfak', icon: '🍳' },
  { path: '/reports', label: 'Raporlar', icon: '📊' },
  { path: '/settings', label: 'Ayarlar', icon: '⚙️' },
]

export function MainLayout() {
  return (
    <div className="flex h-screen bg-gray-100">
      {/* Sidebar */}
      <aside className="w-20 bg-gray-900 flex flex-col items-center py-4">
        <div className="mb-8">
          <div className="w-12 h-12 bg-primary-500 rounded-xl flex items-center justify-center text-white font-bold text-xl">
            K
          </div>
        </div>
        <nav className="flex-1 flex flex-col gap-2">
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                clsx(
                  'w-14 h-14 rounded-xl flex flex-col items-center justify-center text-xs gap-1 transition-colors',
                  isActive
                    ? 'bg-primary-600 text-white'
                    : 'text-gray-400 hover:bg-gray-800 hover:text-white'
                )
              }
            >
              <span className="text-lg">{item.icon}</span>
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto">
          <button className="w-14 h-14 rounded-xl flex flex-col items-center justify-center text-xs gap-1 text-gray-400 hover:bg-gray-800 hover:text-white transition-colors">
            <span className="text-lg">👤</span>
            <span>Cikis</span>
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-hidden">
        <Outlet />
      </main>
    </div>
  )
}
