import { useEffect, useState } from 'react'
import {
  ShoppingCart, TrendingUp, Package, DollarSign,
  ShoppingBag, BarChart3, Plus, FileText, Boxes, Receipt,
  Users, Truck
} from 'lucide-react'
import StatCard from '../../components/ui/StatCard.jsx'
import QuickActionCard from '../../components/ui/QuickActionCard.jsx'
import Badge from '../../components/ui/Badge.jsx'
import LoadingSpinner from '../../components/ui/LoadingSpinner.jsx'
import { dashboard } from '../../services/neonService.js'
import { formatCurrency, formatDate } from '../../lib/utils.js'

const quickActions = [
  {
    to: '/invoices',
    icon: Plus,
    label: 'فاتورة جديدة',
    description: 'إنشاء فاتورة بيع',
    colorClass: 'bg-blue-500',
    bgClass: 'bg-gradient-to-br from-blue-600 to-blue-800',
  },
  {
    to: '/products',
    icon: Boxes,
    label: 'إضافة منتج',
    description: 'منتج أو خدمة',
    colorClass: 'bg-emerald-500',
    bgClass: 'bg-gradient-to-br from-emerald-600 to-emerald-800',
  },
  {
    to: '/customers',
    icon: Users,
    label: 'إضافة عميل',
    description: 'عميل جديد',
    colorClass: 'bg-cyan-500',
    bgClass: 'bg-gradient-to-br from-cyan-600 to-cyan-800',
  },
  {
    to: '/suppliers',
    icon: Truck,
    label: 'إضافة مورد',
    description: 'مورد جديد',
    colorClass: 'bg-teal-500',
    bgClass: 'bg-gradient-to-br from-teal-600 to-teal-800',
  },
  {
    to: '/purchases',
    icon: ShoppingBag,
    label: 'طلب شراء',
    description: 'تسجيل مشتريات',
    colorClass: 'bg-amber-500',
    bgClass: 'bg-gradient-to-br from-amber-600 to-amber-700',
  },
  {
    to: '/expenses',
    icon: Receipt,
    label: 'مصروف جديد',
    description: 'تسجيل مصروف',
    colorClass: 'bg-rose-500',
    bgClass: 'bg-gradient-to-br from-rose-600 to-rose-800',
  },
]

export default function DashboardPage() {
  const [stats, setStats] = useState(null)
  const [recentInvoices, setRecentInvoices] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      try {
        const [statsData, invoicesData] = await Promise.all([
          dashboard.getStats(),
          dashboard.getRecentInvoices(5)
        ])
        setStats(statsData)
        setRecentInvoices(invoicesData)
      } catch {
        setStats({ todaySales: 0, todayCount: 0, totalRevenue: 0, netProfit: 0, productCount: 0, totalExpenses: 0 })
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  if (loading) return <LoadingSpinner size="lg" className="h-64" />

  return (
    <div className="space-y-6">
      {/* Greeting */}
      <div>
        <h2 className="text-xl font-bold text-slate-800">مرحباً بك في نواة AI</h2>
        <p className="text-sm text-slate-500 mt-0.5">
          {new Intl.DateTimeFormat('ar-SA', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }).format(new Date())}
        </p>
      </div>

      {/* KPI Stats Grid */}
      <section>
        <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">ملخص اليوم</h3>
        <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard
            title="مبيعات اليوم"
            value={formatCurrency(stats.todaySales)}
            subtitle={`${stats.todayCount} فاتورة`}
            icon={ShoppingCart}
            colorClass="bg-blue-500"
            trend={12}
          />
          <StatCard
            title="إجمالي الإيرادات"
            value={formatCurrency(stats.totalRevenue)}
            subtitle="الإجمالي التراكمي"
            icon={TrendingUp}
            colorClass="bg-emerald-500"
            trend={8}
          />
          <StatCard
            title="صافي الربح"
            value={formatCurrency(stats.netProfit)}
            subtitle="بعد المصروفات"
            icon={DollarSign}
            colorClass={stats.netProfit >= 0 ? 'bg-emerald-500' : 'bg-rose-500'}
            trend={stats.netProfit >= 0 ? 5 : -3}
          />
          <StatCard
            title="المنتجات"
            value={stats.productCount}
            subtitle="منتج نشط"
            icon={Package}
            colorClass="bg-amber-500"
          />
        </div>
      </section>

      {/* Quick Actions */}
      <section>
        <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">إجراءات سريعة</h3>
        <div className="grid grid-cols-3 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {quickActions.map((action) => (
            <QuickActionCard key={action.to} {...action} />
          ))}
        </div>
      </section>

      {/* Recent Invoices */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">آخر الفواتير</h3>
          <a href="/invoices" className="text-xs text-blue-600 font-medium hover:text-blue-700 transition-colors">
            عرض الكل
          </a>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          {recentInvoices.length === 0 ? (
            <div className="py-10 text-center text-slate-400 text-sm">
              لا توجد فواتير بعد
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {recentInvoices.map((inv, idx) => (
                <li key={idx} className="flex items-center justify-between px-4 py-3 hover:bg-slate-50 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
                      <FileText size={15} className="text-blue-500" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-700">{formatCurrency(inv.total_amount)}</p>
                      <p className="text-xs text-slate-400">{formatDate(inv.created_at)}</p>
                    </div>
                  </div>
                  <Badge variant={inv.status === 'paid' ? 'success' : inv.status === 'pending' ? 'warning' : 'danger'}>
                    {inv.status === 'paid' ? 'مدفوعة' : inv.status === 'pending' ? 'معلقة' : 'ملغاة'}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  )
}
