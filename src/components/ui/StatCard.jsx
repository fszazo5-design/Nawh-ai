export default function StatCard({ title, value, subtitle, icon: Icon, colorClass, trend }) {
  return (
    <div className={`relative overflow-hidden rounded-2xl p-5 shadow-sm border border-white/60 bg-white flex flex-col gap-3 transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 active:scale-95`}>
      <div className="flex items-start justify-between">
        <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${colorClass}`}>
          <Icon size={24} className="text-white" strokeWidth={1.8} />
        </div>
        {trend !== undefined && (
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${trend >= 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-500'}`}>
            {trend >= 0 ? '+' : ''}{trend}%
          </span>
        )}
      </div>
      <div>
        <p className="text-2xl font-bold text-slate-800 leading-tight">{value}</p>
        <p className="text-sm font-medium text-slate-500 mt-0.5">{title}</p>
        {subtitle && <p className="text-xs text-slate-400 mt-1">{subtitle}</p>}
      </div>
    </div>
  )
}
