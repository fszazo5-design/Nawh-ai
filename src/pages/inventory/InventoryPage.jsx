/**
 * Inventory Management Page
 * =-=-=-=-=-=-=-=-=-=-=-=-=
 * صفحة إدارة المخزون مع تنبيهات الحد الأدنى
 */

import { useState, useEffect } from 'react';
import {
  Package, AlertTriangle, Search, Plus, Edit, RefreshCw,
  TrendingDown, TrendingUp, BarChart3, History
} from 'lucide-react';
import { useDatabase } from '../../context/DatabaseContext.jsx';
import LoadingSpinner from '../../components/ui/LoadingSpinner.jsx';

export default function InventoryPage() {
  const { products, reports, query } = useDatabase();

  const [activeTab, setActiveTab] = useState('stock');
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [productsList, setProductsList] = useState([]);
  const [lowStockProducts, setLowStockProducts] = useState([]);
  const [adjustments, setAdjustments] = useState([]);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [showAdjustModal, setShowAdjustModal] = useState(false);
  const [adjustData, setAdjustData] = useState({ qty: 0, reason: '' });

  // Load data on mount
  useEffect(() => {
    loadInventoryData();
  }, []);

  const loadInventoryData = async () => {
    setLoading(true);
    try {
      // Load products
      const productsData = await products.getAll({});
      setProductsList(productsData);

      // Load low stock products
      const lowStock = await products.getLowStock();
      setLowStockProducts(lowStock);

      // Load recent adjustments
      const adjustmentsData = await query(
        `SELECT * FROM inventory_adjustments ORDER BY created_at DESC LIMIT 20`
      );
      setAdjustments(adjustmentsData);
    } catch (err) {
      console.error('Error loading inventory:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleAdjustStock = async () => {
    if (!selectedProduct) return;

    try {
      await products.updateStock(
        selectedProduct.id,
        adjustData.qty,
        adjustData.reason
      );

      // Refresh data
      await loadInventoryData();
      setShowAdjustModal(false);
      setSelectedProduct(null);
      setAdjustData({ qty: 0, reason: '' });
    } catch (err) {
      console.error('Error adjusting stock:', err);
    }
  };

  const filteredProducts = search
    ? productsList.filter(p =>
        p.name?.toLowerCase().includes(search.toLowerCase()) ||
        p.barcode?.toLowerCase().includes(search.toLowerCase())
      )
    : productsList;

  return (
    <div className="p-6 space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">إدارة المخزون</h1>
          <p className="text-slate-500 text-sm mt-1">مراقبة وتسوية المخزون</p>
        </div>

        <div className="flex items-center gap-2">
          {lowStockProducts.length > 0 && (
            <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-amber-700">
              <AlertTriangle size={18} />
              <span className="text-sm font-medium">{lowStockProducts.length} منتج تحت الحد الأدنى</span>
            </div>
          )}
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-slate-500 text-sm">إجمالي المنتجات</p>
              <p className="text-2xl font-bold text-slate-800 mt-1">{productsList.length}</p>
            </div>
            <Package className="text-blue-500" size={24} />
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-slate-500 text-sm">تحت الحد الأدنى</p>
              <p className="text-2xl font-bold text-amber-600 mt-1">{lowStockProducts.length}</p>
            </div>
            <TrendingDown className="text-amber-500" size={24} />
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-slate-500 text-sm">نواقص اليوم</p>
              <p className="text-2xl font-bold text-red-600 mt-1">
                {adjustments.filter(a => a.adjustment_qty < 0).length}
              </p>
            </div>
            <TrendingDown className="text-red-500" size={24} />
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-slate-500 text-sm">زيادات اليوم</p>
              <p className="text-2xl font-bold text-emerald-600 mt-1">
                {adjustments.filter(a => a.adjustment_qty > 0).length}
              </p>
            </div>
            <TrendingUp className="text-emerald-500" size={24} />
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-slate-200">
        <button
          onClick={() => setActiveTab('stock')}
          className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'stock'
              ? 'border-blue-500 text-blue-600'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <Package size={16} className="inline ml-1" />
          المخزون الحالي
        </button>
        <button
          onClick={() => setActiveTab('low')}
          className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'low'
              ? 'border-blue-500 text-blue-600'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <AlertTriangle size={16} className="inline ml-1" />
          تنبيهات النواقص
        </button>
        <button
          onClick={() => setActiveTab('history')}
          className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'history'
              ? 'border-blue-500 text-blue-600'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <History size={16} className="inline ml-1" />
          سجل التسويات
        </button>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex justify-center py-8">
          <LoadingSpinner />
        </div>
      ) : (
        <>
          {/* Stock List Tab */}
          {activeTab === 'stock' && (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="p-4 border-b border-slate-200">
                <div className="relative">
                  <Search size={18} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="بحث بالاسم أو الباركود..."
                    className="w-full pr-10 pl-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                  />
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-slate-50 text-slate-600 text-sm">
                    <tr>
                      <th className="px-4 py-3 text-right font-medium">المنتج</th>
                      <th className="px-4 py-3 text-right font-medium">الباركود</th>
                      <th className="px-4 py-3 text-right font-medium">الفئة</th>
                      <th className="px-4 py-3 text-right font-medium">سعر التكلفة</th>
                      <th className="px-4 py-3 text-right font-medium">سعر البيع</th>
                      <th className="px-4 py-3 text-right font-medium">الكمية</th>
                      <th className="px-4 py-3 text-right font-medium">الحد الأدنى</th>
                      <th className="px-4 py-3 text-right font-medium">الحالة</th>
                      <th className="px-4 py-3 text-center font-medium">إجراءات</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredProducts.map(product => (
                      <tr key={product.id} className="hover:bg-slate-50">
                        <td className="px-4 py-3 text-slate-800 font-medium">{product.name}</td>
                        <td className="px-4 py-3 text-slate-600">{product.barcode || '-'}</td>
                        <td className="px-4 py-3 text-slate-600">{product.category || '-'}</td>
                        <td className="px-4 py-3 text-slate-600">{product.cost_price?.toFixed(2)}</td>
                        <td className="px-4 py-3 text-slate-600">{product.sell_price?.toFixed(2)}</td>
                        <td className={`px-4 py-3 font-medium ${product.stock_qty <= product.min_stock_qty ? 'text-red-600' : 'text-slate-800'}`}>
                          {product.stock_qty}
                        </td>
                        <td className="px-4 py-3 text-slate-500">{product.min_stock_qty}</td>
                        <td className="px-4 py-3">
                          {product.stock_qty <= product.min_stock_qty ? (
                            <span className="inline-flex items-center gap-1 px-2 py-1 bg-red-100 text-red-700 text-xs rounded-full">
                              <AlertTriangle size={12} />
                              نواقص
                            </span>
                          ) : (
                            <span className="inline-flex px-2 py-1 bg-emerald-100 text-emerald-700 text-xs rounded-full">
                              متوفر
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <button
                            onClick={() => {
                              setSelectedProduct(product);
                              setShowAdjustModal(true);
                            }}
                            className="p-2 hover:bg-blue-50 rounded-lg text-blue-600 transition-colors"
                            title="تسوية الكمية"
                          >
                            <RefreshCw size={16} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Low Stock Tab */}
          {activeTab === 'low' && (
            <div className="space-y-4">
              {lowStockProducts.length === 0 ? (
                <div className="text-center py-8 text-slate-500">
                  <Package size={48} className="mx-auto mb-4 text-slate-300" />
                  <p>جميع المنتجات متوفرة بالكمية الكافية</p>
                </div>
              ) : (
                lowStockProducts.map(product => (
                  <div key={product.id} className="flex items-center justify-between p-4 bg-amber-50 border border-amber-200 rounded-lg">
                    <div className="flex items-center gap-3">
                      <AlertTriangle className="text-amber-500" size={24} />
                      <div>
                        <h4 className="font-medium text-slate-800">{product.name}</h4>
                        <p className="text-sm text-slate-500">
                          الكمية الحالية: <span className="text-amber-700 font-medium">{product.stock_qty}</span>
                          {product.min_stock_qty > 0 && ` - يجب لا تقل عن ${product.min_stock_qty}`}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        setSelectedProduct(product);
                        setShowAdjustModal(true);
                      }}
                      className="px-3 py-1.5 bg-amber-600 text-white text-sm rounded-lg hover:bg-amber-700 transition-colors"
                    >
                      طلب توريد
                    </button>
                  </div>
                ))
              )}
            </div>
          )}

          {/* History Tab */}
          {activeTab === 'history' && (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <table className="w-full">
                <thead className="bg-slate-50 text-slate-600 text-sm">
                  <tr>
                    <th className="px-4 py-3 text-right font-medium">التاريخ</th>
                    <th className="px-4 py-3 text-right font-medium">المنتج</th>
                    <th className="px-4 py-3 text-right font-medium">السابقة</th>
                    <th className="px-4 py-3 text-right font-medium">الجديدة</th>
                    <th className="px-4 py-3 text-right font-medium">التغيير</th>
                    <th className="px-4 py-3 text-right font-medium">السبب</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {adjustments.map(adj => (
                    <tr key={adj.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 text-slate-600 text-sm">
                        {new Date(adj.created_at).toLocaleString('ar-SA')}
                      </td>
                      <td className="px-4 py-3 text-slate-800">{adj.product_name}</td>
                      <td className="px-4 py-3 text-slate-600">{adj.previous_qty}</td>
                      <td className="px-4 py-3 text-slate-800 font-medium">{adj.new_qty}</td>
                      <td className={`px-4 py-3 font-medium ${adj.adjustment_qty < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                        {adj.adjustment_qty > 0 ? '+' : ''}{adj.adjustment_qty}
                      </td>
                      <td className="px-4 py-3 text-slate-500">{adj.reason || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* Adjustment Modal */}
      {showAdjustModal && selectedProduct && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md mx-4">
            <h3 className="text-lg font-bold text-slate-800 mb-4">تسوية الكمية</h3>

            <div className="space-y-4">
              <div className="p-3 bg-slate-50 rounded-lg">
                <p className="text-sm text-slate-500">المنتج</p>
                <p className="font-medium text-slate-800">{selectedProduct.name}</p>
                <p className="text-sm text-slate-500 mt-1">الكمية الحالية: {selectedProduct.stock_qty}</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  التغيير (+ إضافة / - خصم)
                </label>
                <input
                  type="number"
                  value={adjustData.qty}
                  onChange={(e) => setAdjustData(prev => ({ ...prev, qty: parseFloat(e.target.value) || 0 }))}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                  placeholder="أدخل الكمية"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  سبب التسوية
                </label>
                <input
                  type="text"
                  value={adjustData.reason}
                  onChange={(e) => setAdjustData(prev => ({ ...prev, reason: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                  placeholder="مثال: جرد يدوي، تلف، إرجاع"
                />
              </div>

              <div className="p-3 bg-blue-50 rounded-lg">
                <p className="text-sm text-slate-600">
                  الكمية بعد التسوية:
                  <span className="font-bold text-blue-700 ms-2">
                    {selectedProduct.stock_qty + adjustData.qty}
                  </span>
                </p>
              </div>
            </div>

            <div className="flex gap-2 mt-6">
              <button
                onClick={() => setShowAdjustModal(false)}
                className="flex-1 px-4 py-2 border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors"
              >
                إلغاء
              </button>
              <button
                onClick={handleAdjustStock}
                disabled={adjustData.qty === 0}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                تأكيد التسوية
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
