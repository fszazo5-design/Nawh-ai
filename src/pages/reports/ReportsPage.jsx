/**
 * Reports & Analytics Page
 * =-=-=-=-=-=-=-=-=
 * صفحة التقارير والتحليلات
 */

import { useState, useEffect } from 'react';
import {
  TrendingUp, TrendingDown, DollarSign, Package, Users,
  ShoppingCart, BarChart3, PieChart, Calendar, Download
} from 'lucide-react';
import { useDatabase } from '../../context/DatabaseContext.jsx';
import { useShift } from '../../context/ShiftContext.jsx';
import LoadingSpinner from '../../components/ui/LoadingSpinner.jsx';

export default function ReportsPage() {
  const { reports, invoices, expenses, products } = useDatabase();
  const { currentShift, getShiftSummary } = useShift();

  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [dateRange, setDateRange] = useState({
    from: new Date().toISOString().slice(0, 10),
    to: new Date().toISOString().slice(0, 10)
  });

  // Data states
  const [dashboardStats, setDashboardStats] = useState(null);
  const [salesReport, setSalesReport] = useState([]);
  const [productPerformance, setProductPerformance] = useState([]);
  const [shiftSummary, setShiftSummary] = useState(null);

  // Load dashboard data
  useEffect(() => {
    if (activeTab === 'dashboard') {
      loadDashboardData();
    }
  }, [activeTab]);

  // Load reports based on date range
  useEffect(() => {
    if (activeTab === 'sales') {
      loadSalesReport();
    } else if (activeTab === 'products') {
      loadProductReport();
    }
  }, [activeTab, dateRange]);

  // Load shift summary
  useEffect(() => {
    if (currentShift) {
      loadShiftSummary();
    }
  }, [currentShift]);

  const loadDashboardData = async () => {
    setLoading(true);
    try {
      const stats = await reports.getDashboardStats();
      setDashboardStats(stats);
    } catch (err) {
      console.error('Error loading dashboard:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadSalesReport = async () => {
    setLoading(true);
    try {
      const report = await reports.getSalesReport(dateRange.from, dateRange.to);
      setSalesReport(report);
    } catch (err) {
      console.error('Error loading sales report:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadProductReport = async () => {
    setLoading(true);
    try {
      const performance = await reports.getProductPerformance(dateRange.from, dateRange.to);
      setProductPerformance(performance);
    } catch (err) {
      console.error('Error loading product report:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadShiftSummary = async () => {
    try {
      const summary = await getShiftSummary();
      setShiftSummary(summary);
    } catch (err) {
      console.error('Error loading shift summary:', err);
    }
  };

  // Export report
  const exportToCSV = () => {
    let csv = '';
    if (activeTab === 'sales' && salesReport.length > 0) {
      csv = 'التاريخ,الفواتير,المبيعات,نقدي,بطاقة,آجل\n';
      salesReport.forEach(row => {
        csv += `${row.date},${row.invoice_count},${row.total_sales},${row.cash_sales},${row.card_sales},${row.credit_sales}\n`;
      });
    }

    const blob = new Blob(['\ufeff' + csv], { encoding: 'UTF-8', type: 'text/csv;charset=UTF-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `تقرير_${activeTab}_${dateRange.from}_${dateRange.to}.csv`;
    a.click();
  };

  return (
    <div className="p-6 space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">التقارير والتحليلات</h1>
          <p className="text-slate-500 text-sm mt-1">إحصائيات وتقارير الأداء</p>
        </div>

        <button
          onClick={exportToCSV}
          className="flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200"
        >
          <Download size={18} />
          <span>تصدير</span>
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-slate-200">
        <button
          onClick={() => setActiveTab('dashboard')}
          className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'dashboard'
              ? 'border-blue-500 text-blue-600'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <BarChart3 size={16} className="inline ml-1" />
          لوحة التحكم
        </button>
        <button
          onClick={() => setActiveTab('sales')}
          className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'sales'
              ? 'border-blue-500 text-blue-600'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <TrendingUp size={16} className="inline ml-1" />
          تقرير المبيعات
        </button>
        <button
          onClick={() => setActiveTab('products')}
          className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'products'
              ? 'border-blue-500 text-blue-600'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <Package size={16} className="inline ml-1" />
          أداء المنتجات
        </button>
        <button
          onClick={() => setActiveTab('shift')}
          className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'shift'
              ? 'border-blue-500 text-blue-600'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <Users size={16} className="inline ml-1" />
          تقرير الوردية
        </button>
      </div>

      {/* Date Range Picker */}
      {(activeTab === 'sales' || activeTab === 'products') && (
        <div className="flex items-center gap-4 bg-slate-50 p-4 rounded-lg">
          <Calendar size={20} className="text-slate-500" />
          <div className="flex items-center gap-2">
            <label className="text-sm text-slate-600">من:</label>
            <input
              type="date"
              value={dateRange.from}
              onChange={(e) => setDateRange(prev => ({ ...prev, from: e.target.value }))}
              className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm text-slate-600">إلى:</label>
            <input
              type="date"
              value={dateRange.to}
              onChange={(e) => setDateRange(prev => ({ ...prev, to: e.target.value }))}
              className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm"
            />
          </div>
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div className="flex justify-center py-12">
          <LoadingSpinner />
        </div>
      ) : (
        <>
          {/* Dashboard Tab */}
          {activeTab === 'dashboard' && dashboardStats && (
            <div className="space-y-6">
              {/* Stats Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-slate-500 text-sm">مبيعات اليوم</p>
                      <p className="text-2xl font-bold text-slate-800 mt-1">
                        {dashboardStats.todaySales?.toFixed(2)}
                      </p>
                      <p className="text-sm text-slate-400 mt-1">
                        {dashboardStats.todayCount} فاتورة
                      </p>
                    </div>
                    <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
                      <DollarSign className="text-blue-600" size={24} />
                    </div>
                  </div>
                </div>

                <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-slate-500 text-sm">الربح الإجمالي</p>
                      <p className="text-2xl font-bold text-emerald-600 mt-1">
                        {dashboardStats.grossProfit?.toFixed(2)}
                      </p>
                    </div>
                    <div className="w-12 h-12 bg-emerald-100 rounded-xl flex items-center justify-center">
                      <TrendingUp className="text-emerald-600" size={24} />
                    </div>
                  </div>
                </div>

                <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-slate-500 text-sm">صافي الربح</p>
                      <p className={`text-2xl font-bold mt-1 ${dashboardStats.netProfit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                        {dashboardStats.netProfit?.toFixed(2)}
                      </p>
                      <p className="text-sm text-slate-400 mt-1">
                        بعد خصم: {dashboardStats.expensesToday?.toFixed(2)}
                      </p>
                    </div>
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${dashboardStats.netProfit >= 0 ? 'bg-emerald-100' : 'bg-red-100'}`}>
                      {dashboardStats.netProfit >= 0
                        ? <TrendingUp className="text-emerald-600" size={24} />
                        : <TrendingDown className="text-red-600" size={24} />
                      }
                    </div>
                  </div>
                </div>

                <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-slate-500 text-sm">المنتجات</p>
                      <p className="text-2xl font-bold text-slate-800 mt-1">
                        {dashboardStats.productCount}
                      </p>
                      {dashboardStats.lowStockCount > 0 && (
                        <p className="text-sm text-amber-600 mt-1">
                          {dashboardStats.lowStockCount} تحت الحد الأدنى
                        </p>
                      )}
                    </div>
                    <div className="w-12 h-12 bg-amber-100 rounded-xl flex items-center justify-center">
                      <Package className="text-amber-600" size={24} />
                    </div>
                  </div>
                </div>
              </div>

              {/* Payment Methods Summary */}
              <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                <h3 className="text-lg font-bold text-slate-800 mb-4">طرق الدفع اليوم</h3>
                <div className="grid grid-cols-3 gap-4">
                  <div className="text-center p-4 bg-emerald-50 rounded-lg">
                    <p className="text-slate-600 text-sm">نقدي</p>
                    <p className="text-xl font-bold text-emerald-600 mt-1">
                      {dashboardStats.cashSales?.toFixed(2)}
                    </p>
                  </div>
                  <div className="text-center p-4 bg-blue-50 rounded-lg">
                    <p className="text-slate-600 text-sm">بطاقة</p>
                    <p className="text-xl font-bold text-blue-600 mt-1">
                      {dashboardStats.cardSales?.toFixed(2)}
                    </p>
                  </div>
                  <div className="text-center p-4 bg-amber-50 rounded-lg">
                    <p className="text-slate-600 text-sm">آجل</p>
                    <p className="text-xl font-bold text-amber-600 mt-1">
                      {dashboardStats.creditSales?.toFixed(2)}
                    </p>
                  </div>
                </div>
              </div>

              {/* Top Products */}
              {dashboardStats.topProducts && dashboardStats.topProducts.length > 0 && (
                <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                  <h3 className="text-lg font-bold text-slate-800 mb-4">المنتجات الأكثر مبيعاً</h3>
                  <div className="space-y-3">
                    {dashboardStats.topProducts.map((product, index) => (
                      <div key={index} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                        <div className="flex items-center gap-3">
                          <span className="w-6 h-6 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-sm font-bold">
                            {index + 1}
                          </span>
                          <span className="font-medium text-slate-800">{product.name}</span>
                        </div>
                        <div className="text-left">
                          <p className="font-bold text-slate-800">{product.total_qty} وحدة</p>
                          <p className="text-sm text-slate-500">{product.total_sales?.toFixed(2)} ريال</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Sales Report Tab */}
          {activeTab === 'sales' && (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <table className="w-full">
                <thead className="bg-slate-50 text-slate-600 text-sm">
                  <tr>
                    <th className="px-4 py-3 text-right font-medium">التاريخ</th>
                    <th className="px-4 py-3 text-right font-medium">الفواتير</th>
                    <th className="px-4 py-3 text-right font-medium">المبيعات</th>
                    <th className="px-4 py-3 text-right font-medium">نقدي</th>
                    <th className="px-4 py-3 text-right font-medium">بطاقة</th>
                    <th className="px-4 py-3 text-right font-medium">آجل</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {salesReport.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-center py-8 text-slate-500">
                        لا توجد بيانات
                      </td>
                    </tr>
                  ) : (
                    salesReport.map((row, index) => (
                      <tr key={index} className="hover:bg-slate-50">
                        <td className="px-4 py-3 text-slate-800">{row.date}</td>
                        <td className="px-4 py-3 text-slate-600">{row.invoice_count}</td>
                        <td className="px-4 py-3 font-bold text-slate-800">{row.total_sales?.toFixed(2)}</td>
                        <td className="px-4 py-3 text-emerald-600">{row.cash_sales?.toFixed(2)}</td>
                        <td className="px-4 py-3 text-blue-600">{row.card_sales?.toFixed(2)}</td>
                        <td className="px-4 py-3 text-amber-600">{row.credit_sales?.toFixed(2)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* Products Report Tab */}
          {activeTab === 'products' && (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <table className="w-full">
                <thead className="bg-slate-50 text-slate-600 text-sm">
                  <tr>
                    <th className="px-4 py-3 text-right font-medium">المنتج</th>
                    <th className="px-4 py-3 text-right font-medium">الفئة</th>
                    <th className="px-4 py-3 text-right font-medium">الباركود</th>
                    <th className="px-4 py-3 text-right font-medium">الكمية</th>
                    <th className="px-4 py-3 text-right font-medium">المبيعات</th>
                    <th className="px-4 py-3 text-right font-medium">الربح</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {productPerformance.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-center py-8 text-slate-500">
                        لا توجد بيانات
                      </td>
                    </tr>
                  ) : (
                    productPerformance.map((product, index) => (
                      <tr key={index} className="hover:bg-slate-50">
                        <td className="px-4 py-3 text-slate-800 font-medium">{product.name}</td>
                        <td className="px-4 py-3 text-slate-600">{product.category || '-'}</td>
                        <td className="px-4 py-3 text-slate-500">{product.barcode || '-'}</td>
                        <td className="px-4 py-3 text-slate-800">{product.total_qty}</td>
                        <td className="px-4 py-3 text-slate-800">{product.total_sales?.toFixed(2)}</td>
                        <td className={`px-4 py-3 font-bold ${product.profit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                          {product.profit?.toFixed(2)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* Shift Report Tab */}
          {activeTab === 'shift' && (
            <div className="space-y-6">
              {currentShift && shiftSummary ? (
                <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                  <h3 className="text-lg font-bold text-slate-800 mb-4">ملخص الوردية الحالية</h3>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                    <div className="p-4 bg-slate-50 rounded-lg">
                      <p className="text-sm text-slate-500">البداية</p>
                      <p className="text-lg font-bold text-slate-800 mt-1">
                        {new Date(shiftSummary.started_at).toLocaleString('ar-SA')}
                      </p>
                    </div>
                    <div className="p-4 bg-slate-50 rounded-lg">
                      <p className="text-sm text-slate-500">الصندوق</p>
                      <p className="text-lg font-bold text-slate-800 mt-1">
                        {shiftSummary.starting_cash?.toFixed(2)} ريال
                      </p>
                    </div>
                    <div className="p-4 bg-slate-50 rounded-lg">
                      <p className="text-sm text-slate-500">الفواتير</p>
                      <p className="text-lg font-bold text-slate-800 mt-1">
                        {shiftSummary.invoice_count}
                      </p>
                    </div>
                    <div className="p-4 bg-slate-50 rounded-lg">
                      <p className="text-sm text-slate-500">المستخدم</p>
                      <p className="text-lg font-bold text-slate-800 mt-1">
                        {shiftSummary.user_name}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-4">
                    <div className="p-4 bg-emerald-50 rounded-lg text-center">
                      <p className="text-sm text-slate-600">نقدي</p>
                      <p className="text-2xl font-bold text-emerald-600 mt-1">
                        {shiftSummary.cashSales?.toFixed(2)}
                      </p>
                    </div>
                    <div className="p-4 bg-blue-50 rounded-lg text-center">
                      <p className="text-sm text-slate-600">بطاقة</p>
                      <p className="text-2xl font-bold text-blue-600 mt-1">
                        {shiftSummary.cardSales?.toFixed(2)}
                      </p>
                    </div>
                    <div className="p-4 bg-amber-50 rounded-lg text-center">
                      <p className="text-sm text-slate-600">آجل</p>
                      <p className="text-2xl font-bold text-amber-600 mt-1">
                        {shiftSummary.creditSales?.toFixed(2)}
                      </p>
                    </div>
                  </div>

                  <div className="mt-6 p-4 bg-blue-50 rounded-lg">
                    <div className="flex justify-between items-center">
                      <span className="text-slate-600">إجمالي المبيعات</span>
                      <span className="text-2xl font-bold text-blue-600">
                        {shiftSummary.totalSales?.toFixed(2)} ريال
                      </span>
                    </div>
                    <div className="flex justify-between items-center mt-2">
                      <span className="text-slate-600">المصروفات</span>
                      <span className="text-lg font-bold text-red-600">
                        -{shiftSummary.totalExpenses?.toFixed(2)} ريال
                      </span>
                    </div>
                    <div className="h-px bg-blue-200 my-2" />
                    <div className="flex justify-between items-center">
                      <span className="text-slate-600 font-bold">الصافي المتوقع</span>
                      <span className="text-2xl font-bold text-emerald-600">
                        {shiftSummary.expectedCash?.toFixed(2)} ريال
                      </span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-12 text-slate-500 bg-white rounded-xl border border-slate-200">
                  <Users size={48} className="mx-auto mb-4 text-slate-300" />
                  <p>لا توجد وردية مفتوحة</p>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
