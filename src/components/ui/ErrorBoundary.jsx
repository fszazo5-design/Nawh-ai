/**
 * Error Boundary - حاجز الأخطاء
 * =-=-=-=-=-=-=-=-=-=-=-=-=-=
 * يلتقط أي أخطاء ويعرض شاشة استرداد آمنة
 */

import { Component } from 'react'
import { AlertTriangle, RefreshCw, Home, FileText } from 'lucide-react'

class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      eventId: null
    }
  }

  static getDerivedStateFromError(error) {
    // Update state so the next render shows the fallback UI
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    // Log error details
    console.error('=== Application Error ===')
    console.error('Error:', error?.message || error)
    console.error('Component Stack:', errorInfo?.componentStack)

    this.setState({
      errorInfo
    })

    // In production, you could send this to an error reporting service
    // Example: Sentry.captureException(error, { contexts: { react: { componentStack: errorInfo.componentStack } } })
  }

  handleReload = () => {
    // Clear any potentially corrupted state
    try {
      localStorage.removeItem('nawh_user')
      localStorage.removeItem('nawh_token')
      localStorage.removeItem('nawh_current_shift')
    } catch (e) {
      // Ignore localStorage errors
    }

    window.location.href = '/'
  }

  handleGoHome = () => {
    window.location.href = '/'
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null, errorInfo: null })
  }

  render() {
    const { hasError, error, errorInfo } = this.state

    if (hasError) {
      const errorMessage = error?.message || 'حدث خطأ غير متوقع'
      const isChunkError = errorMessage.includes('ChunkLoadError') || errorMessage.includes('Loading chunk')
      const isNetworkError = errorMessage.includes('Network') || errorMessage.includes('fetch')

      return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center p-4" dir="rtl">
          <div className="text-center max-w-lg">
            {/* Icon */}
            <div className="w-24 h-24 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <AlertTriangle className="w-12 h-12 text-amber-500" />
            </div>

            {/* Title */}
            <h1 className="text-2xl font-bold text-slate-800 mb-3">
              {isChunkError ? 'حدث خطأ في تحميل الملفات' :
               isNetworkError ? 'مشكلة في الاتصال بالشبكة' :
               'حدث خطأ غير متوقع'}
            </h1>

            {/* Description */}
            <p className="text-slate-600 mb-2">
              {isChunkError ? 'يبدو أن بعض ملفات التطبيق لم يتم تحميلها بشكل صحيح.' :
               isNetworkError ? 'تعذر الاتصال بالخادم. تحقق من اتصالك بالإنترنت.' :
               'حدث خطأ أثناء تحميل الصفحة.'}
            </p>

            <p className="text-slate-500 text-sm mb-6">
              يمكنك المحاولة مرة أخرى أو العودة للصفحة الرئيسية.
            </p>

            {/* Error Details (collapsible in dev) */}
            {process.env.NODE_ENV === 'development' && error && (
              <details className="text-left mb-6 bg-slate-100 rounded-lg p-4">
                <summary className="cursor-pointer text-sm font-medium text-slate-700">
                  تفاصيل الخطأ (للمطورين)
                </summary>
                <pre className="mt-2 text-xs text-red-600 overflow-auto max-h-40">
                  {errorMessage}
                  {errorInfo?.componentStack && (
                    <>
                      {'\n\nComponent Stack:'}
                      {errorInfo.componentStack}
                    </>
                  )}
                </pre>
              </details>
            )}

            {/* Actions */}
            <div className="flex items-center justify-center gap-3 flex-wrap">
              <button
                onClick={this.handleRetry}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
                إعادة المحاولة
              </button>

              <button
                onClick={this.handleGoHome}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-slate-200 text-slate-700 rounded-lg hover:bg-slate-300 transition-colors"
              >
                <Home className="w-4 h-4" />
                الصفحة الرئيسية
              </button>
            </div>

            {/* Footer */}
            <p className="mt-6 text-xs text-slate-400">
              نواة AI - نظام نقاط البيع
            </p>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

/**
 * Functional Error Fallback
 * يُستخدم للأخطاء غير الحرجة
 */
export function ErrorFallback({ error, onRetry, message }) {
  return (
    <div className="flex items-center justify-center p-8" dir="rtl">
      <div className="text-center">
        <AlertTriangle className="w-8 h-8 text-amber-500 mx-auto mb-3" />
        <p className="text-slate-600 mb-3">{message || error?.message || 'حدث خطأ'}</p>
        {onRetry && (
          <button
            onClick={onRetry}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg"
          >
            <RefreshCw className="w-3 h-3" />
            إعادة المحاولة
          </button>
        )}
      </div>
    </div>
  )
}

/**
 * Offline Indicator
 */
export function OfflineIndicator() {
  return (
    <div className="fixed bottom-4 left-4 right-4 lg:left-auto lg:right-4 lg:w-80 bg-amber-50 border border-amber-200 rounded-lg p-3 shadow-lg z-50" dir="rtl">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center flex-shrink-0">
          <AlertTriangle className="w-5 h-5 text-amber-600" />
        </div>
        <div>
          <p className="font-medium text-amber-800">أنت غير متصل بالإنترنت</p>
          <p className="text-sm text-amber-600">البيانات ستُحفظ محلياً وتُزامن لاحقاً</p>
        </div>
      </div>
    </div>
  )
}

export default ErrorBoundary
