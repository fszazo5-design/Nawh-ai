import { useEffect, useState } from 'react'
import { FileText, Plus, Search, Eye, X, Trash2 } from 'lucide-react'
import { invoices, products, customers } from '../../services/neonService.js'
import LoadingSpinner from '../../components/ui/LoadingSpinner.jsx'
import Badge from '../../components/ui/Badge.jsx'
import { formatCurrency, formatDate } from '../../lib/utils.js'

export default function InvoicesPage() {
  const [invoiceList, setInvoiceList] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [showDetailModal, setShowDetailModal] = useState(false)
  const [selectedInvoice, setSelectedInvoice] = useState(null)
  const [invoiceItems, setInvoiceItems] = useState([])
  const [productList, setProductList] = useState([])
  const [customerList, setCustomerList] = useState([])
  const [form, setForm] = useState({
    customer_id: '', status: 'paid', subtotal: 0, discount_amt: 0,
    tax_rate: 15, tax_amt: 0, total_amount: 0, paid_amount: 0,
    payment_method: 'cash', notes: '', items: [{ product_id: '', name: '', qty: 1, unit_price: 0, discount: 0, total: 0 }]
  })

  useEffect(() => {
    loadInvoices()
  }, [])

  async function loadInvoices() {
    setLoading(true)
    try {
      const data = await invoices.getAll()
      setInvoiceList(data)
    } catch {
      setInvoiceList([])
    } finally {
      setLoading(false)
    }
  }

  async function openCreateModal() {
    try {
      const [prods, custs] = await Promise.all([
        products.getAll({ is_active: true }),
        customers.getAll()
      ])
      setProductList(prods)
      setCustomerList(custs)
      setForm({
        customer_id: '', status: 'paid', subtotal: 0, discount_amt: 0,
        tax_rate: 15, tax_amt: 0, total_amount: 0, paid_amount: 0,
        payment_method: 'cash', notes: '',
        items: [{ product_id: '', name: '', qty: 1, unit_price: 0, discount: 0, total: 0 }]
      })
      setShowModal(true)
    } catch (err) {
      console.error('Error loading data:', err)
    }
  }

  async function viewInvoice(invoice) {
    setSelectedInvoice(invoice)
    const items = await invoices.getItems(invoice.id)
    setInvoiceItems(items)
    setShowDetailModal(true)
  }

  function addItem() {
    setForm({
      ...form,
      items: [...form.items, { product_id: '', name: '', qty: 1, unit_price: 0, discount: 0, total: 0 }]
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
        newItems[index].unit_price = product.sell_price
      }
    }

    newItems[index].total = (newItems[index].qty || 0) * (newItems[index].unit_price || 0) * (1 - (newItems[index].discount || 0) / 100)
    setForm({ ...form, items: newItems })
    calculateTotals(newItems)
  }

  function calculateTotals(items) {
    const subtotal = items.reduce((sum, item) => sum + (item.total || 0), 0)
    const tax_amt = subtotal * (form.tax_rate || 0) / 100
    const total_amount = subtotal - (form.discount_amt || 0) + tax_amt
    setForm(prev => ({ ...prev, subtotal, tax_amt, total_amount, paid_amount: total_amount }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    try {
      await invoices.create({
        customer_id: form.customer_id || null,
        status: form.status,
        subtotal: form.subtotal,
        discount_amt: form.discount_amt,
        tax_rate: form.tax_rate,
        tax_amt: form.tax_amt,
        total_amount: form.total_amount,
        paid_amount: form.paid_amount,
        payment_method: form.payment_method,
        notes: form.notes,
        items: form.items.filter(item => item.name && item.qty > 0)
      })
      setShowModal(false)
      loadInvoices()
    } catch (err) {
      console.error('Error creating invoice:', err)
    }
  }

  async function handleDelete(id) {
    if (!confirm('هل أنت متأكد من حذف هذه الفاتورة؟')) return
    try {
      await invoices.delete(id)
      loadInvoices()
    } catch (err) {
      console.error('Error deleting invoice:', err)
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            placeholder="بحث في الفواتير..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pr-9 pl-4 py-2.5 text-sm rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
          />
        </div>
        <button
          onClick={openCreateModal}
          className="flex items-center gap-2 bg-blue-600 text-white text-sm font-semibold px-4 py-2.5 rounded-xl hover:bg-blue-700 active:bg-blue-800 transition-colors shadow-sm"
        >
          <Plus size={16} />
          <span>فاتورة جديدة</span>
        </button>
      </div>

      {loading ? (
        <LoadingSpinner size="lg" className="h-64" />
      ) : invoiceList.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-10 flex flex-col items-center justify-center gap-3">
          <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center">
            <FileText size={28} className="text-slate-400" />
          </div>
          <p className="text-slate-500 font-medium">لا توجد فواتير بعد</p>
          <p className="text-sm text-slate-400">أنشئ فاتورتك الأولى الآن</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3 text-right font-semibold text-slate-600">رقم الفاتورة</th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-600">العميل</th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-600">المبلغ</th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-600">التاريخ</th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-600">الحالة</th>
                  <th className="px-4 py-3 text-center font-semibold text-slate-600">إجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {invoiceList
                  .filter(inv => inv.invoice_number?.toLowerCase().includes(search.toLowerCase()) || inv.customer_name?.toLowerCase().includes(search.toLowerCase()))
                  .map((invoice) => (
                    <tr key={invoice.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3 font-medium text-slate-800">{invoice.invoice_number}</td>
                      <td className="px-4 py-3 text-slate-600">{invoice.customer_name || 'عميل نقدي'}</td>
                      <td className="px-4 py-3 font-semibold text-slate-800">{formatCurrency(invoice.total_amount)}</td>
                      <td className="px-4 py-3 text-slate-500">{formatDate(invoice.created_at)}</td>
                      <td className="px-4 py-3">
                        <Badge variant={invoice.status === 'paid' ? 'success' : invoice.status === 'pending' ? 'warning' : 'danger'}>
                          {invoice.status === 'paid' ? 'مدفوعة' : invoice.status === 'pending' ? 'معلقة' : 'ملغاة'}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() => viewInvoice(invoice)}
                            className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-blue-600 transition-colors"
                          >
                            <Eye size={16} />
                          </button>
                          <button
                            onClick={() => handleDelete(invoice.id)}
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

      {/* Create Invoice Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-4 border-b border-slate-200">
              <h3 className="font-bold text-lg text-slate-800">فاتورة جديدة</h3>
              <button onClick={() => setShowModal(false)} className="p-1 hover:bg-slate-100 rounded-lg">
                <X size={20} className="text-slate-500" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-4 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">العميل</label>
                  <select
                    value={form.customer_id}
                    onChange={(e) => setForm({ ...form, customer_id: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                  >
                    <option value="">عميل نقدي</option>
                    {customerList.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">طريقة الدفع</label>
                  <select
                    value={form.payment_method}
                    onChange={(e) => setForm({ ...form, payment_method: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30"
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
                  <label className="block text-sm font-medium text-slate-700">بنود الفاتورة</label>
                  <button type="button" onClick={addItem} className="text-sm text-blue-600 hover:text-blue-700 font-medium">
                    + إضافة بند
                  </button>
                </div>
                <div className="space-y-2">
                  {form.items.map((item, index) => (
                    <div key={index} className="grid grid-cols-12 gap-2 items-end">
                      <div className="col-span-4">
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
                          placeholder="السعر"
                          value={item.unit_price}
                          onChange={(e) => updateItem(index, 'unit_price', parseFloat(e.target.value) || 0)}
                          className="w-full px-2 py-1.5 text-sm border border-slate-200 rounded-lg"
                          min="0"
                          step="0.01"
                        />
                      </div>
                      <div className="col-span-2">
                        <input
                          type="number"
                          placeholder="الخصم %"
                          value={item.discount}
                          onChange={(e) => updateItem(index, 'discount', parseFloat(e.target.value) || 0)}
                          className="w-full px-2 py-1.5 text-sm border border-slate-200 rounded-lg"
                          min="0"
                          max="100"
                        />
                      </div>
                      <div className="col-span-1 text-sm font-medium text-slate-600 py-1.5">
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

              <div className="grid grid-cols-3 gap-4 bg-slate-50 p-3 rounded-lg">
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">المجموع الفرعي</label>
                  <div className="text-lg font-semibold text-slate-800">{formatCurrency(form.subtotal)}</div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">ضريبة القيمة المضافة ({form.tax_rate}%)</label>
                  <div className="text-lg font-semibold text-slate-800">{formatCurrency(form.tax_amt)}</div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">الإجمالي</label>
                  <div className="text-xl font-bold text-blue-600">{formatCurrency(form.total_amount)}</div>
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
                  className="px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg"
                >
                  إنشاء الفاتورة
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* View Invoice Modal */}
      {showDetailModal && selectedInvoice && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-4 border-b border-slate-200">
              <h3 className="font-bold text-lg text-slate-800">تفاصيل الفاتورة</h3>
              <button onClick={() => setShowDetailModal(false)} className="p-1 hover:bg-slate-100 rounded-lg">
                <X size={20} className="text-slate-500" />
              </button>
            </div>
            <div className="p-4 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className="text-sm text-slate-500">رقم الفاتورة</span>
                  <p className="font-semibold text-slate-800">{selectedInvoice.invoice_number}</p>
                </div>
                <div>
                  <span className="text-sm text-slate-500">التاريخ</span>
                  <p className="font-semibold text-slate-800">{formatDate(selectedInvoice.created_at)}</p>
                </div>
                <div>
                  <span className="text-sm text-slate-500">العميل</span>
                  <p className="font-semibold text-slate-800">{selectedInvoice.customer_name || 'عميل نقدي'}</p>
                </div>
                <div>
                  <span className="text-sm text-slate-500">الحالة</span>
                  <Badge variant={selectedInvoice.status === 'paid' ? 'success' : selectedInvoice.status === 'pending' ? 'warning' : 'danger'}>
                    {selectedInvoice.status === 'paid' ? 'مدفوعة' : selectedInvoice.status === 'pending' ? 'معلقة' : 'ملغاة'}
                  </Badge>
                </div>
              </div>

              <div className="border-t border-slate-200 pt-4">
                <h4 className="font-semibold text-slate-800 mb-2">بنود الفاتورة</h4>
                <div className="bg-slate-50 rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-100">
                      <tr>
                        <th className="px-3 py-2 text-right text-slate-600">المنتج</th>
                        <th className="px-3 py-2 text-center text-slate-600">الكمية</th>
                        <th className="px-3 py-2 text-center text-slate-600">السعر</th>
                        <th className="px-3 py-2 text-center text-slate-600">الإجمالي</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {invoiceItems.map((item, idx) => (
                        <tr key={idx}>
                          <td className="px-3 py-2 text-slate-800">{item.name}</td>
                          <td className="px-3 py-2 text-center text-slate-600">{item.qty}</td>
                          <td className="px-3 py-2 text-center text-slate-600">{formatCurrency(item.unit_price)}</td>
                          <td className="px-3 py-2 text-center font-medium text-slate-800">{formatCurrency(item.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="bg-blue-50 p-3 rounded-lg space-y-1">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600">المجموع الفرعي</span>
                  <span className="font-medium">{formatCurrency(selectedInvoice.subtotal)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600">الضريبة</span>
                  <span className="font-medium">{formatCurrency(selectedInvoice.tax_amt)}</span>
                </div>
                <div className="flex justify-between text-lg font-bold pt-2 border-t border-blue-200">
                  <span className="text-slate-800">الإجمالي</span>
                  <span className="text-blue-600">{formatCurrency(selectedInvoice.total_amount)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
