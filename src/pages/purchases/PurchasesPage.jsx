import { useEffect, useState } from 'react'
import { ShoppingBag, Plus, Eye, X, Trash2 } from 'lucide-react'
import { purchases, products, suppliers } from '../../services/neonService.js'
import LoadingSpinner from '../../components/ui/LoadingSpinner.jsx'
import Badge from '../../components/ui/Badge.jsx'
import { formatCurrency, formatDate } from '../../lib/utils.js'

export default function PurchasesPage() {
  const [purchaseList, setPurchaseList] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [showDetailModal, setShowDetailModal] = useState(false)
  const [selectedPurchase, setSelectedPurchase] = useState(null)
  const [purchaseItems, setPurchaseItems] = useState([])
  const [productList, setProductList] = useState([])
  const [supplierList, setSupplierList] = useState([])
  const [form, setForm] = useState({
    supplier_id: '', status: 'received', subtotal: 0, discount_amt: 0,
    tax_amt: 0, total_amount: 0, paid_amount: 0,
    payment_method: 'cash', notes: '',
    items: [{ product_id: '', name: '', qty: 1, unit_cost: 0, total: 0 }]
  })

  useEffect(() => {
    loadPurchases()
  }, [])

  async function loadPurchases() {
    setLoading(true)
    try {
      const data = await purchases.getAll()
      setPurchaseList(data)
    } catch {
      setPurchaseList([])
    } finally {
      setLoading(false)
    }
  }

  async function openCreateModal() {
    try {
      const [prods, supps] = await Promise.all([
        products.getAll({ is_active: true }),
        suppliers.getAll()
      ])
      setProductList(prods)
      setSupplierList(supps)
      setForm({
        supplier_id: '', status: 'received', subtotal: 0, discount_amt: 0,
        tax_amt: 0, total_amount: 0, paid_amount: 0,
        payment_method: 'cash', notes: '',
        items: [{ product_id: '', name: '', qty: 1, unit_cost: 0, total: 0 }]
      })
      setShowModal(true)
    } catch (err) {
      console.error('Error loading data:', err)
    }
  }

  async function viewPurchase(purchase) {
    setSelectedPurchase(purchase)
    const items = await purchases.getItems(purchase.id)
    setPurchaseItems(items)
    setShowDetailModal(true)
  }

  function addItem() {
    setForm({
      ...form,
      items: [...form.items, { product_id: '', name: '', qty: 1, unit_cost: 0, total: 0 }]
    })
  }

  function removeItem(index) {
    if (form.items.length === 1) return
    const newItems = form.items.filter((_, i) => i !== index)
    setForm({ ...form, items: newItems })
    calculateTotals(newItems)
  }

  function updateItem(index, field, value) {
    const newItems = [...form.items]
    newItems[index][field] = value

    if (field === 'product_id') {
      const product = productList.find(p => p.id === value)
      if (product) {
        newItems[index].name = product.name
        newItems[index].unit_cost = product.cost_price
      }
    }

    newItems[index].total = (newItems[index].qty || 0) * (newItems[index].unit_cost || 0)
    setForm({ ...form, items: newItems })
    calculateTotals(newItems)
  }

  function calculateTotals(items) {
    const subtotal = items.reduce((sum, item) => sum + (item.total || 0), 0)
    const total_amount = subtotal - (form.discount_amt || 0) + (form.tax_amt || 0)
    setForm(prev => ({ ...prev, subtotal, total_amount, paid_amount: total_amount }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    try {
      await purchases.create({
        supplier_id: form.supplier_id || null,
        status: form.status,
        subtotal: form.subtotal,
        discount_amt: form.discount_amt,
        tax_amt: form.tax_amt,
        total_amount: form.total_amount,
        paid_amount: form.paid_amount,
        payment_method: form.payment_method,
        notes: form.notes,
        items: form.items.filter(item => item.name && item.qty > 0)
      })
      setShowModal(false)
      loadPurchases()
    } catch (err) {
      console.error('Error creating purchase:', err)
    }
  }

  async function handleDelete(id) {
    if (!confirm('هل أنت متأكد من حذف هذا أمر الشراء؟')) return
    try {
      await purchases.delete(id)
      loadPurchases()
    } catch (err) {
      console.error('Error deleting purchase:', err)
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex justify-end">
        <button
          onClick={openCreateModal}
          className="flex items-center gap-2 bg-amber-600 text-white text-sm font-semibold px-4 py-2.5 rounded-xl hover:bg-amber-700 active:bg-amber-800 transition-colors shadow-sm"
        >
          <Plus size={16} />
          <span>طلب شراء جديد</span>
        </button>
      </div>

      {loading ? (
        <LoadingSpinner size="lg" className="h-64" />
      ) : purchaseList.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-10 flex flex-col items-center justify-center gap-3">
          <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center">
            <ShoppingBag size={28} className="text-slate-400" />
          </div>
          <p className="text-slate-500 font-medium">لا توجد مشتريات بعد</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3 text-right font-semibold text-slate-600">رقم الشراء</th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-600">المورد</th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-600">المبلغ</th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-600">التاريخ</th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-600">الحالة</th>
                  <th className="px-4 py-3 text-center font-semibold text-slate-600">إجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {purchaseList.map((purchase) => (
                  <tr key={purchase.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-slate-800">{purchase.purchase_number}</td>
                    <td className="px-4 py-3 text-slate-600">{purchase.supplier_name || '-'}</td>
                    <td className="px-4 py-3 font-semibold text-slate-800">{formatCurrency(purchase.total_amount)}</td>
                    <td className="px-4 py-3 text-slate-500">{formatDate(purchase.created_at)}</td>
                    <td className="px-4 py-3">
                      <Badge variant={purchase.status === 'received' ? 'success' : purchase.status === 'pending' ? 'warning' : 'danger'}>
                        {purchase.status === 'received' ? 'مستلم' : purchase.status === 'pending' ? 'معلق' : 'ملغي'}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => viewPurchase(purchase)}
                          className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-amber-600 transition-colors"
                        >
                          <Eye size={16} />
                        </button>
                        <button
                          onClick={() => handleDelete(purchase.id)}
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

      {/* Create Purchase Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-4 border-b border-slate-200">
              <h3 className="font-bold text-lg text-slate-800">طلب شراء جديد</h3>
              <button onClick={() => setShowModal(false)} className="p-1 hover:bg-slate-100 rounded-lg">
                <X size={20} className="text-slate-500" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-4 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">المورد</label>
                  <select
                    value={form.supplier_id}
                    onChange={(e) => setForm({ ...form, supplier_id: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500/30"
                  >
                    <option value="">اختر المورد</option>
                    {supplierList.map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">طريقة الدفع</label>
                  <select
                    value={form.payment_method}
                    onChange={(e) => setForm({ ...form, payment_method: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500/30"
                  >
                    <option value="cash">نقدي</option>
                    <option value="card">بطاقة</option>
                    <option value="transfer">تحويل</option>
                    <option value="credit">آجل</option>
                  </select>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-slate-700">بنود الشراء</label>
                  <button type="button" onClick={addItem} className="text-sm text-amber-600 hover:text-amber-700 font-medium">
                    + إضافة بند
                  </button>
                </div>
                <div className="space-y-2">
                  {form.items.map((item, index) => (
                    <div key={index} className="grid grid-cols-12 gap-2 items-end">
                      <div className="col-span-5">
                        <select
                          value={item.product_id}
                          onChange={(e) => updateItem(index, 'product_id', e.target.value)}
                          className="w-full px-2 py-1.5 text-sm border border-slate-200 rounded-lg"
                        >
                          <option value="">اختر منتج</option>
                          {productList.map(p => (
                            <option key={p.id} value={p.id}>{p.name}</option>
                          ))}
                        </select>
                      </div>
                      <div className="col-span-2">
                        <input
                          type="number"
                          placeholder="الكمية"
                          value={item.qty}
                          onChange={(e) => updateItem(index, 'qty', parseFloat(e.target.value) || 0)}
                          className="w-full px-2 py-1.5 text-sm border border-slate-200 rounded-lg"
                          min="0"
                          step="0.001"
                        />
                      </div>
                      <div className="col-span-2">
                        <input
                          type="number"
                          placeholder="سعر التكلفة"
                          value={item.unit_cost}
                          onChange={(e) => updateItem(index, 'unit_cost', parseFloat(e.target.value) || 0)}
                          className="w-full px-2 py-1.5 text-sm border border-slate-200 rounded-lg"
                          min="0"
                          step="0.01"
                        />
                      </div>
                      <div className="col-span-2 text-sm font-medium text-slate-600 py-1.5">
                        {formatCurrency(item.total)}
                      </div>
                      <div className="col-span-1">
                        <button type="button" onClick={() => removeItem(index)} className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg">
                          <X size={16} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 bg-amber-50 p-3 rounded-lg">
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">المجموع الفرعي</label>
                  <div className="text-lg font-semibold text-slate-800">{formatCurrency(form.subtotal)}</div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">الإجمالي</label>
                  <div className="text-xl font-bold text-amber-600">{formatCurrency(form.total_amount)}</div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">ملاحظات</label>
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  rows={2}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                />
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-sm font-semibold text-white bg-amber-600 hover:bg-amber-700 rounded-lg"
                >
                  إنشاء طلب الشراء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* View Purchase Modal */}
      {showDetailModal && selectedPurchase && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-4 border-b border-slate-200">
              <h3 className="font-bold text-lg text-slate-800">تفاصيل طلب الشراء</h3>
              <button onClick={() => setShowDetailModal(false)} className="p-1 hover:bg-slate-100 rounded-lg">
                <X size={20} className="text-slate-500" />
              </button>
            </div>
            <div className="p-4 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className="text-sm text-slate-500">رقم الشراء</span>
                  <p className="font-semibold text-slate-800">{selectedPurchase.purchase_number}</p>
                </div>
                <div>
                  <span className="text-sm text-slate-500">التاريخ</span>
                  <p className="font-semibold text-slate-800">{formatDate(selectedPurchase.created_at)}</p>
                </div>
                <div>
                  <span className="text-sm text-slate-500">المورد</span>
                  <p className="font-semibold text-slate-800">{selectedPurchase.supplier_name || '-'}</p>
                </div>
                <div>
                  <span className="text-sm text-slate-500">الحالة</span>
                  <Badge variant={selectedPurchase.status === 'received' ? 'success' : selectedPurchase.status === 'pending' ? 'warning' : 'danger'}>
                    {selectedPurchase.status === 'received' ? 'مستلم' : selectedPurchase.status === 'pending' ? 'معلق' : 'ملغي'}
                  </Badge>
                </div>
              </div>

              <div className="border-t border-slate-200 pt-4">
                <h4 className="font-semibold text-slate-800 mb-2">بنود الشراء</h4>
                <div className="bg-slate-50 rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-100">
                      <tr>
                        <th className="px-3 py-2 text-right text-slate-600">المنتج</th>
                        <th className="px-3 py-2 text-center text-slate-600">الكمية</th>
                        <th className="px-3 py-2 text-center text-slate-600">سعر التكلفة</th>
                        <th className="px-3 py-2 text-center text-slate-600">الإجمالي</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {purchaseItems.map((item, idx) => (
                        <tr key={idx}>
                          <td className="px-3 py-2 text-slate-800">{item.name}</td>
                          <td className="px-3 py-2 text-center text-slate-600">{item.qty}</td>
                          <td className="px-3 py-2 text-center text-slate-600">{formatCurrency(item.unit_cost)}</td>
                          <td className="px-3 py-2 text-center font-medium text-slate-800">{formatCurrency(item.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="bg-amber-50 p-3 rounded-lg">
                <div className="flex justify-between text-lg font-bold">
                  <span className="text-slate-800">الإجمالي</span>
                  <span className="text-amber-600">{formatCurrency(selectedPurchase.total_amount)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
