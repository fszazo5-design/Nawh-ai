/**
 * App Entry Point - نقطة الدخول الرئيسية
 * =-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=
 * مع حماية كاملة من الانهيار (Crash Protection)
 */

import { useState, useEffect, useMemo } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AlertTriangle, RefreshCw, Wifi, WifiOff, Database, Loader2 } from 'lucide-react'
import { AuthProvider } from './context/AuthContext.jsx'
import { DatabaseProvider, useDatabase } from './context/DatabaseContext.jsx'
import { ShiftProvider } from './context/ShiftContext.jsx'
import ProtectedRoute from './components/auth/ProtectedRoute.jsx'
import AppLayout from './components/layout/AppLayout.jsx'
import LoginPage from './pages/auth/LoginPage.jsx'
import RegisterPage from './pages/auth/RegisterPage.jsx'
import DashboardPage from './pages/dashboard/DashboardPage.jsx'
import ProductsPage from './pages/products/ProductsPage.jsx'
import InvoicesPage from './pages/invoices/InvoicesPage.jsx'
import NewInvoicePage from './pages/invoices/NewInvoicePage.jsx'
import PurchasesPage from './pages/purchases/PurchasesPage.jsx'
import ExpensesPage from './pages/expenses/ExpensesPage.jsx'
import ReportsPage from './pages/reports/ReportsPage.jsx'
import SettingsPage from './pages/settings/SettingsPage.jsx'
import CustomersPage from './pages/customers/CustomersPage.jsx'
import SuppliersPage from './pages/suppliers/SuppliersPage.jsx'
import InventoryPage from './pages/inventory/InventoryPage.jsx'
import WhatsAppCRMPage from './pages/whatsapp/WhatsAppCRMPage.jsx'

/**
 * Loading Screen - شاشة التحميل
 */
function LoadingScreen() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-900 via-blue-800 to-blue-900 flex items-center justify-center" dir="rtl">
      <div className="text-center text-white">
        <Loader2 className="w-12 h-12 animate-spin mx-auto mb-4" />
        <p className="text-lg font-medium">جاري تحميل النظام...</p>
        <p className="text-blue-200 text-sm mt-2">نواة AI - نقاط البيع</p>
      </div>
    </div>
  )
}

/**
 * Error Screen - شاشة الخطأ
 */
function ErrorScreen({ error, onRetry }) {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4" dir="rtl">
      <div className="text-center max-w-md">
        <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
          <AlertTriangle className="w-10 h-10 text-red-500" />
        </div>
        <h1 className="text-2xl font-bold text-slate-800 mb-2">حدث خطأ في التحميل</h1>
        <p className="text-slate-600 mb-4">
          {error || 'تعذر تحميل بعض مكونات النظام'}
        </p>
        <p className="text-slate-500 text-sm mb-6">
          يمكن للمستخدم استخدام النظام محلياً حتى لو فشل الاتصال بالسيرفر
        </p>
        <button
          onClick={onRetry}
          className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          إعادة المحاولة
        </button>
      </div>
    </div>
  )
}

/**
 * App Routes - مسارات التطبيق
 */
function AppRoutes() {
  const { isReady, error } = useDatabase()

  // Still loading
  if (!isReady) {
    return <LoadingScreen />
  }

  // Critical error (shouldn't happen with safe init, but just in case)
  if (error) {
    return (
      <ErrorScreen
        error={error}
        onRetry={() => window.location.reload()}
      />
    )
  }

  return (
    <BrowserRouter>
      <Routes>
        {/* Public Routes */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />

        {/* Protected Routes */}
        <Route element={
          <ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>
        }>
          <Route index element={<DashboardPage />} />
          <Route path="/invoices" element={<InvoicesPage />} />
          <Route path="/invoices/new" element={<NewInvoicePage />} />
          <Route path="/products" element={<ProductsPage />} />
          <Route path="/purchases" element={<PurchasesPage />} />
          <Route path="/expenses" element={<ExpensesPage />} />
          <Route path="/customers" element={<CustomersPage />} />
          <Route path="/suppliers" element={<SuppliersPage />} />
          <Route path="/inventory" element={<InventoryPage />} />
          <Route path="/reports" element={<ReportsPage />} />
          <Route path="/whatsapp" element={<WhatsAppCRMPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>

        {/* Catch all */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

/**
 * Main App Component
 */
export default function App() {
  const [appState, setAppState] = useState({
    isReady: false,
    error: null,
    retryCount: 0
  })

  useEffect(() => {
    initializeApp()
  }, [appState.retryCount])

  /**
   * Initialize App with Safe Mode
   * تهيئة آمنة للتطبيق مع حماية من الأخطاء
   */
  const initializeApp = async () => {
    try {
      setAppState(prev => ({ ...prev, isReady: false, error: null }))

      // Simulating minimal async initialization
      // In production, this is where we check capacitor availability
      await new Promise(resolve => setTimeout(resolve, 100))

      // App is ready (DatabaseProvider handles its own safety)
      setAppState(prev => ({ ...prev, isReady: true }))

    } catch (err) {
      console.error('App initialization error:', err)
      setAppState(prev => ({
        ...prev,
        isReady: true, // Still show UI, even with errors
        error: err.message || 'حدث خطأ أثناء التحميل'
      }))
    }
  }

  const handleRetry = () => {
    setAppState(prev => ({
      ...prev,
      retryCount: prev.retryCount + 1
    }))
  }

  // Show loading screen during initialization
  if (!appState.isReady) {
    return <LoadingScreen />
  }

  return (
    <AuthProvider>
      <DatabaseProvider>
        <ShiftProvider>
          <AppRoutes />
        </ShiftProvider>
      </DatabaseProvider>
    </AuthProvider>
  )
}
