import { useEffect, useState } from 'react'
import { Package, Plus, Search, Edit2, Trash2, X } from 'lucide-react'
import { products } from '../../services/neonService.js'
import LoadingSpinner from '../../components/ui/LoadingSpinner.jsx'
import { formatCurrency } from '../../lib/utils.js'

export default function ProductsPage() {
  const [productList, setProductList] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editingProduct, setEditingProduct] = useState(null)
  const [form, setForm] = useState({
    name: '', barcode: '', category: '', unit: 'قطعة',
    cost_price: '', sell_price: '', stock_qty: '', min_stock_qty: '', notes: ''
  })

  useEffect(() => {
    loadProducts()
  }, [])

  async function loadProducts() {
    setLoading(true)
    try {
      const data = await products.getAll({ search: search || undefined })
      setProductList(data)
    } catch {
      setProductList([])
    } finally {
      setLoading(false)
    }
  }

  function openCreateModal() {
    setEditingProduct(null)
    setForm({
      name: '', barcode: '', category: '', unit: 'قطعة',
      cost_price: '', sell_price: '', stock_qty: '', min_stock_qty: '', notes: ''
    })
    setShowModal(true)
  }

  function openEditModal(product) {
    setEditingProduct(product)
    setForm({
      name: product.name || '',
      barcode: product.barcode || '',
      category: product.category || '',
      unit: product.unit || 'قطعة',
      cost_price: product.cost_price || '',
      sell_price: product.sell_price || '',
      stock_qty: product.stock_qty || '',
      min_stock_qty: product.min_stock_qty || '',
      notes: product.notes || ''
    })
    setShowModal(true)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    try {
      const data = {
        name: form.name,
        barcode: form.barcode || null,
        category: form.category || null,
        unit: form.unit || 'قطعة',
        cost_price: parseFloat(form.cost_price) || 0,
        sell_price: parseFloat(form.sell_price) || 0,
        stock_qty: parseFloat(form.stock_qty) || 0,
        min_stock_qty: parseFloat(form.min_stock_qty) || 0,
        notes: form.notes || null
      }

      if (editingProduct) {
        await products.update(editingProduct.id, data)
      } else {
        await products.create(data)
      }
      setShowModal(false)
      loadProducts()
    } catch (err) {
      console.error('Error saving product:', err)
    }
  }

  async function handleDelete(id) {
    if (!confirm('هل أنت متأكد من حذف هذا المنتج؟')) return
    try {
      await products.delete(id)
      loadProducts()
    } catch (err) {
      console.error('Error deleting product:', err)
    }
  }

  function handleSearch(e) {
    e.preventDefault()
    loadProducts()
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <form onSubmit={handleSearch} className="relative flex-1 max-w-sm">
          <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            placeholder="بحث عن منتج..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pr-9 pl-4 py-2.5 text-sm rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
          />
        </form>
        <button
          onClick={openCreateModal}
          className="flex items-center gap-2 bg-blue-600 text-white text-sm font-semibold px-4 py-2.5 rounded-xl hover:bg-blue-700 active:bg-blue-800 transition-colors shadow-sm"
        >
          <Plus size={16} />
          <span>منتج جديد</span>
        </button>
      </div>

      {loading ? (
        <LoadingSpinner size="lg" className="h-64" />
      ) : productList.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-10 flex flex-col items-center justify-center gap-3">
          <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center">
            <Package size={28} className="text-slate-400" />
          </div>
          <p className="text-slate-500 font-medium">لا توجد منتجات بعد</p>
          <p className="text-sm text-slate-400">أضف منتجك الأول للبدء</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3 text-right font-semibold text-slate-600">المنتج</th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-600">الباركود</th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-600">الفئة</th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-600">سعر التكلفة</th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-600">سعر البيع</th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-600">المخزون</th>
                  <th className="px-4 py-3 text-center font-semibold text-slate-600">إجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {productList.map((product) => (
                  <tr key={product.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-slate-800">{product.name}</td>
                    <td className="px-4 py-3 text-slate-500">{product.barcode || '-'}</td>
                    <td className="px-4 py-3 text-slate-500">{product.category || '-'}</td>
                    <td className="px-4 py-3 text-slate-600">{formatCurrency(product.cost_price)}</td>
                    <td className="px-4 py-3 text-slate-600">{formatCurrency(product.sell_price)}</td>
                    <td className="px-4 py-3">
                      <span className={`font-medium ${product.stock_qty <= product.min_stock_qty ? 'text-rose-600' : 'text-slate-600'}`}>
                        {product.stock_qty}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => openEditModal(product)}
                          className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-blue-600 transition-colors"
                        >
                          <Edit2 size={16} />
                        </button>
                        <button
                          onClick={() => handleDelete(product.id)}
                          className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-rose-600 transition-colors"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-4 border-b border-slate-200">
              <h3 className="font-bold text-lg text-slate-800">
                {editingProduct ? 'تعديل المنتج' : 'إضافة منتج جديد'}
              </h3>
              <button onClick={() => setShowModal(false)} className="p-1 hover:bg-slate-100 rounded-lg">
                <X size={20} className="text-slate-500" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">اسم المنتج *</label>
                <input
                  type="text"
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">الباركود</label>
                  <input
                    type="text"
                    value={form.barcode}
                    onChange={(e) => setForm({ ...form, barcode: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">الفئة</label>
                  <input
                    type="text"
                    value={form.category}
                    onChange={(e) => setForm({ ...form, category: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">سعر التكلفة</label>
                  <input
                    type="number"
                    step="0.01"
                    value={form.cost_price}
                    onChange={(e) => setForm({ ...form, cost_price: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">سعر البيع</label>
                  <input
                    type="number"
                    step="0.01"
                    value={form.sell_price}
                    onChange={(e) => setForm({ ...form, sell_price: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">الكمية</label>
                  <input
                    type="number"
                    step="0.001"
                    value={form.stock_qty}
                    onChange={(e) => setForm({ ...form, stock_qty: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">الحد الأدنى</label>
                  <input
                    type="number"
                    step="0.001"
                    value={form.min_stock_qty}
                    onChange={(e) => setForm({ ...form, min_stock_qty: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">ملاحظات</label>
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  rows={2}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
                />
              </div>
              <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
                >
                  {editingProduct ? 'حفظ التعديلات' : 'إضافة المنتج'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
