export default function Badge({ children, variant = 'default', size = 'sm' }) {
  const variants = {
    default: 'bg-slate-100 text-slate-600',
    success: 'bg-emerald-50 text-emerald-700',
    warning: 'bg-amber-50 text-amber-700',
    danger: 'bg-red-50 text-red-600',
    info: 'bg-blue-50 text-blue-700',
    primary: 'bg-blue-600 text-white',
  }
  const sizes = { sm: 'text-xs px-2 py-0.5', md: 'text-sm px-3 py-1' }

  return (
    <span className={`inline-flex items-center font-semibold rounded-full ${variants[variant]} ${sizes[size]}`}>
      {children}
    </span>
  )
}
