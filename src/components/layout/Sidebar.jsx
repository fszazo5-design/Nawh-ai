import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard, ShoppingCart, Package, ShoppingBag,
  TrendingUp, DollarSign, Settings, ChevronLeft, Zap,
  Users, Truck, LogOut
} from 'lucide-react'
import { useAuth } from '../../context/AuthContext.jsx'

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'الرئيسية' },
  { to: '/invoices', icon: ShoppingCart, label: 'الفواتير' },
  { to: '/products', icon: Package, label: 'المنتجات' },
  { to: '/customers', icon: Users, label: 'العملاء' },
  { to: '/suppliers', icon: Truck, label: 'الموردين' },
  { to: '/purchases', icon: ShoppingBag, label: 'المشتريات' },
  { to: '/expenses', icon: DollarSign, label: 'المصروفات' },
  { to: '/reports', icon: TrendingUp, label: 'التقارير' },
  { to: '/settings', icon: Settings, label: 'الإعدادات' },
]

export default function Sidebar({ isOpen, onClose }) {
  const { user, logout } = useAuth()

  async function handleLogout() {
    await logout()
  }

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30 lg:hidden backdrop-blur-sm"
          onClick={onClose}
        />
      )}

      {/* Sidebar panel */}
      <aside
        className={`
          fixed top-0 right-0 h-full w-64 bg-gradient-to-b from-blue-900 to-blue-950
          z-40 flex flex-col shadow-2xl
          transition-transform duration-300 ease-in-out
          ${isOpen ? 'translate-x-0' : 'translate-x-full'}
          lg:translate-x-0 lg:static lg:z-auto lg:h-screen lg:shadow-none
        `}
      >
        {/* Logo */}
        <div className="flex items-center justify-between px-5 py-5 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-blue-500 rounded-xl flex items-center justify-center shadow-lg">
              <Zap size={20} className="text-white" />
            </div>
            <div>
              <p className="text-white font-bold text-base leading-none">نواة AI</p>
              <p className="text-blue-300 text-xs mt-0.5">نظام نقاط البيع</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="lg:hidden w-8 h-8 rounded-lg flex items-center justify-center text-blue-300 hover:bg-white/10 transition-colors"
          >
            <ChevronLeft size={18} />
          </button>
        </div>

        {/* Nav items */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto scroll-smooth">
          {navItems.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              onClick={onClose}
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-150 font-medium text-sm
                ${isActive
                  ? 'bg-white/15 text-white shadow-sm'
                  : 'text-blue-200 hover:bg-white/8 hover:text-white'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${isActive ? 'bg-blue-500' : 'bg-white/5'}`}>
                    <Icon size={17} strokeWidth={1.8} />
                  </div>
                  <span>{label}</span>
                </>
              )}
            </NavLink>
          ))}
        </nav>

        {/* User info & Logout */}
        <div className="px-3 py-3 border-t border-white/10">
          {user && (
            <div className="px-3 py-2 mb-2">
              <p className="text-white text-sm font-medium truncate">{user.full_name || user.email}</p>
              <p className="text-blue-300 text-xs capitalize">{user.role === 'admin' ? 'مدير' : user.role === 'manager' ? 'مشرف' : 'مستخدم'}</p>
            </div>
          )}
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 px-4 py-2.5 w-full rounded-lg text-blue-200 hover:bg-white/10 hover:text-white transition-colors text-sm"
          >
            <LogOut size={17} />
            <span>تسجيل الخروج</span>
          </button>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-white/10">
          <p className="text-blue-400 text-xs text-center">v2.0.0 — نواة AI ERP</p>
        </div>
      </aside>
    </>
  )
}
