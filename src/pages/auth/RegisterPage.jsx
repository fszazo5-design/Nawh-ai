import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext.jsx'
import { Zap, Mail, Lock, User, Eye, EyeOff, AlertCircle, Loader2, CheckCircle } from 'lucide-react'

// استيراد مكتبة كابتشور (Preferences) لحفظ البيانات على أندرويد
import { Preferences } from '@capacitor/preferences'

export default function RegisterPage() {
  const navigate = useNavigate()
  const { register } = useAuth()
  const [form, setForm] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    full_name: ''
  })
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  function handleChange(field, value) {
    setForm(prev => ({ ...prev, [field]: value }))
    if (error) setError('')
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')

    // Validation
    if (!form.email || !form.password || !form.full_name) {
      setError('جميع الحقول مطلوبة')
      return
    }

    if (form.password.length < 6) {
      setError('كلمة المرور يجب أن تكون 6 أحرف على الأقل')
      return
    }

    if (form.password !== form.confirmPassword) {
      setError('كلمتا المرور غير متطابقتين')
      return
    }

    setLoading(true)

    try {
      const result = await register({
        email: form.email,
        password: form.password,
        full_name: form.full_name
      })

      if (result.success) {
        // === التعديل المخصص لـ أندرويد (كابتشور) ===
        // حفظ التوكن، اسم السكيما، وبيانات المستخدم الجديد في مساحة تخزين الأندرويد
        if (result.token) {
          await Preferences.set({ key: 'token', value: result.token });
        }
        if (result.schemaName) {
          await Preferences.set({ key: 'schemaName', value: result.schemaName });
        }
        if (result.user) {
          await Preferences.set({ key: 'userData', value: JSON.stringify(result.user) });
        }

        setSuccess(true)
        setTimeout(() => {
          navigate('/')
        }, 2000)
      } else {
        setError(result.message || 'حدث خطأ في إنشاء الحساب')
      }
    } catch (err) {
      console.error('Register Android Preferences Error:', err)
      setError('حدث خطأ في النظام')
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-900 via-blue-800 to-blue-900 flex items-center justify-center p-4" dir="rtl">
        <div className="bg-white rounded-2xl shadow-xl p-8 text-center max-w-md w-full">
          <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle size={32} className="text-emerald-600" />
          </div>
          <h2 className="text-xl font-bold text-slate-800 mb-2">تم إنشاء الحساب بنجاح!</h2>
          <p className="text-slate-500 text-sm">جاري تحويلك للوحة التحكم...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-900 via-blue-800 to-blue-900 flex items-center justify-center p-4" dir="rtl">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-500 rounded-2xl shadow-lg mb-4">
            <Zap size={32} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white">نواة AI</h1>
          <p className="text-blue-300 text-sm mt-1">إنشاء حساب جديد</p>
        </div>

        {/* Register Form */}
        <div className="bg-white rounded-2xl shadow-xl p-6 sm:p-8">
          <h2 className="text-xl font-bold text-slate-800 text-center mb-6">تسجيل جديد</h2>

          {error && (
            <div className="mb-4 p-3 bg-rose-50 border border-rose-200 rounded-lg flex items-center gap-2 text-rose-700 text-sm">
              <AlertCircle size={18} />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                الاسم الكامل
              </label>
              <div className="relative">
                <User size={18} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  required
                  value={form.full_name}
                  onChange={(e) => handleChange('full_name', e.target.value)}
                  className="w-full pr-10 pl-4 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
                  placeholder="أدخل اسمك"
                  disabled={loading}
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                البريد الإلكتروني
              </label>
              <div className="relative">
                <Mail size={18} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="email"
                  required
                  value={form.email}
                  onChange={(e) => handleChange('email', e.target.value)}
                  className="w-full pr-10 pl-4 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
                  placeholder="email@example.com"
                  disabled={loading}
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                كلمة المرور
              </label>
              <div className="relative">
                <Lock size={18} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={form.password}
                  onChange={(e) => handleChange('password', e.target.value)}
                  className="w-full pr-10 pl-10 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
                  placeholder="••••••••"
                  disabled={loading}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              <p className="text-xs text-slate-400 mt-1">6 أحرف على الأقل</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                تأكيد كلمة المرور
              </label>
              <div className="relative">
                <Lock size={18} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={form.confirmPassword}
                  onChange={(e) => handleChange('confirmPassword', e.target.value)}
                  className="w-full pr-10 pl-4 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
                  placeholder="••••••••"
                  disabled={loading}
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 active:bg-blue-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  <span>جاري الإنشاء...</span>
                </>
              ) : (
                <span>إنشاء الحساب</span>
              )}
            </button>
          </form>

          <div className="mt-6 text-center text-sm text-slate-500">
            لديك حساب بالفعل؟{' '}
            <button
              onClick={() => navigate('/login')}
              className="text-blue-600 font-medium hover:text-blue-700 transition-colors"
            >
              تسجيل الدخول
            </button>
          </div>
        </div>

        <p className="text-center text-blue-300 text-xs mt-6">
          © 2024 نواة AI - جميع الحقوق محفوظة
        </p>
      </div>
    </div>
  )
}
