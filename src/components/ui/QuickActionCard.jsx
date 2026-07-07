import { NavLink } from 'react-router-dom'

export default function QuickActionCard({ to, icon: Icon, label, description, colorClass, bgClass }) {
  return (
    <NavLink
      to={to}
      className={`group relative overflow-hidden rounded-2xl p-5 shadow-sm border border-white/40 ${bgClass} flex flex-col items-center justify-center gap-2 text-center transition-all duration-200 hover:shadow-lg hover:-translate-y-1 active:scale-95 cursor-pointer min-h-[110px]`}
    >
      <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${colorClass} shadow-lg shadow-current/20 group-hover:scale-110 transition-transform duration-200`}>
        <Icon size={28} className="text-white" strokeWidth={1.8} />
      </div>
      <div>
        <p className="text-sm font-bold text-white leading-tight">{label}</p>
        {description && <p className="text-xs text-white/70 mt-0.5">{description}</p>}
      </div>
    </NavLink>
  )
}
