import { useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import Sidebar from './Sidebar.jsx'
import Header from './Header.jsx'

const pageTitles = {
  '/': 'لوحة التحكم',
  '/invoices': 'الفواتير',
  '/products': 'المنتجات',
  '/customers': 'العملاء',
  '/suppliers': 'الموردين',
  '/purchases': 'المشتريات',
  '/expenses': 'المصروفات',
  '/reports': 'التقارير',
  '/settings': 'الإعدادات',
}

export default function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const { pathname } = useLocation()

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden" dir="rtl">
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Header
          onMenuToggle={() => setSidebarOpen(true)}
          pageTitle={pageTitles[pathname] ?? 'نواة AI'}
        />
        <main className="flex-1 overflow-y-auto scroll-smooth p-4 sm:p-5 lg:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
