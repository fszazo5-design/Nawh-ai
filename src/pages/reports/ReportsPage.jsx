import { BarChart3 } from 'lucide-react'

export default function ReportsPage() {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-10 flex flex-col items-center justify-center gap-3">
      <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center">
        <BarChart3 size={28} className="text-slate-400" />
      </div>
      <p className="text-slate-500 font-medium">التقارير قيد التطوير</p>
      <p className="text-sm text-slate-400">سيتم إضافة تقارير مفصلة قريباً</p>
    </div>
  )
}
