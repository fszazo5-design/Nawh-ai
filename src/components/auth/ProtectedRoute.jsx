import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext.jsx'
import LoadingSpinner from '../ui/LoadingSpinner.jsx'

export default function ProtectedRoute({ children, requiredRole = null }) {
  const { isAuthenticated, loading, hasRole } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <LoadingSpinner size="lg" />
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  if (requiredRole && !hasRole(requiredRole)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50" dir="rtl">
        <div className="text-center">
          <h2 className="text-xl font-bold text-slate-800 mb-2">غير مصرح لك بالوصول</h2>
          <p className="text-slate-500">لا تملك الصلاحيات الكافية للوصول لهذه الصفحة</p>
        </div>
      </div>
    )
  }

  return children
}
