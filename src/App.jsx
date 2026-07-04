import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext.jsx'
import ProtectedRoute from './components/auth/ProtectedRoute.jsx'
import AppLayout from './components/layout/AppLayout.jsx'
import LoginPage from './pages/auth/LoginPage.jsx'
import RegisterPage from './pages/auth/RegisterPage.jsx'
import DashboardPage from './pages/dashboard/DashboardPage.jsx'
import ProductsPage from './pages/products/ProductsPage.jsx'
import InvoicesPage from './pages/invoices/InvoicesPage.jsx'
import PurchasesPage from './pages/purchases/PurchasesPage.jsx'
import ExpensesPage from './pages/expenses/ExpensesPage.jsx'
import ReportsPage from './pages/reports/ReportsPage.jsx'
import SettingsPage from './pages/settings/SettingsPage.jsx'
import CustomersPage from './pages/customers/CustomersPage.jsx'
import SuppliersPage from './pages/suppliers/SuppliersPage.jsx'

export default function App() {
  return (
    <AuthProvider>
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
            <Route path="/invoices/*" element={<InvoicesPage />} />
            <Route path="/products/*" element={<ProductsPage />} />
            <Route path="/purchases/*" element={<PurchasesPage />} />
            <Route path="/expenses/*" element={<ExpensesPage />} />
            <Route path="/customers" element={<CustomersPage />} />
            <Route path="/suppliers" element={<SuppliersPage />} />
            <Route path="/reports" element={<ReportsPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Route>

          {/* Catch all - redirect to dashboard */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
