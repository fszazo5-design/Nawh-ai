import { Menu, Bell, Search, User } from 'lucide-react'

export default function Header({ onMenuToggle, pageTitle }) {
  return (
    <header className="sticky top-0 z-20 bg-white/90 backdrop-blur-md border-b border-slate-200 px-4 py-3 flex items-center justify-between gap-3 shadow-sm">
      {/* Left: menu + title */}
      <div className="flex items-center gap-3">
        <button
          onClick={onMenuToggle}
          className="lg:hidden w-9 h-9 rounded-xl flex items-center justify-center text-slate-600 hover:bg-slate-100 active:bg-slate-200 transition-colors"
        >
          <Menu size={20} />
        </button>
        <h1 className="text-base font-bold text-slate-800 truncate">{pageTitle}</h1>
      </div>

      {/* Right: actions */}
      <div className="flex items-center gap-2">
        <button className="w-9 h-9 rounded-xl flex items-center justify-center text-slate-500 hover:bg-slate-100 active:bg-slate-200 transition-colors">
          <Search size={18} />
        </button>
        <button className="relative w-9 h-9 rounded-xl flex items-center justify-center text-slate-500 hover:bg-slate-100 active:bg-slate-200 transition-colors">
          <Bell size={18} />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full" />
        </button>
        <button className="w-9 h-9 rounded-xl flex items-center justify-center bg-blue-600 text-white hover:bg-blue-700 active:bg-blue-800 transition-colors">
          <User size={17} />
        </button>
      </div>
    </header>
  )
}
