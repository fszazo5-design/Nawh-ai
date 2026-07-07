import { useEffect, useState } from 'react'
import { Users, Plus, Search, Edit2, Trash2, X, Phone, Mail, MapPin } from 'lucide-react'
import { customers } from '../../services/neonService.js'
import LoadingSpinner from '../../components/ui/LoadingSpinner.jsx'
import { formatCurrency } from '../../lib/utils.js'

export default function CustomersPage() {
  const [customerList, setCustomerList] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editingCustomer, setEditingCustomer] = useState(null)
  const [form, setForm] = useState({
    name: '', phone: '', email: '', address: '',
    tax_id: '', credit_limit: '', notes: ''
  })

  useEffect(() => {
    loadCustomers()
  }, [])

  async function loadCustomers() {
    setLoading(true)
    try {
      const data = await customers.getAll(search)
      setCustomerList(data)
    } catch {
      setCustomerList([])
    } finally {
      setLoading(false)
    }
  }

  function openCreateModal() {
    setEditingCustomer(null)
    setForm({
      name: '', phone: '', email: '', address: '',
      tax_id: '', credit_limit: '', notes: ''
    })
    setShowModal(true)
  }

  function openEditModal(customer) {
    setEditingCustomer(customer)
    setForm({
      name: customer.name || '',
      phone: customer.phone || '',
      email: customer.email || '',
      address: customer.address || '',
      tax_id: customer.tax_id || '',
      credit_limit: customer.credit_limit || '',
      notes: customer.notes || ''
    })
    setShowModal(true)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    try {
      const data = {
        name: form.name,
        phone: form.phone || null,
        email: form.email || null,
        address: form.address || null,
        tax_id: form.tax_id || null,
        credit_limit: parseFloat(form.credit_limit) || 0,
        notes: form.notes || null
      }

      if (editingCustomer) {
        await customers.update(editingCustomer.id, data)
      } else {
        await customers.create(data)
      }
      setShowModal(false)
      loadCustomers()
    } catch (err) {
      console.error('Error saving customer:', err)
    }
  }

  async function handleDelete(id) {
    if (!confirm('هل أنت متأكد من حذف هذا العميل؟')) return
    try {
      await customers.delete(id)
      loadCustomers()
    } catch (err) {
      console.error('Error deleting customer:', err)
    }
  }

  function handleSearch(e) {
    e.preventDefault()
    loadCustomers()
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <form onSubmit={handleSearch} className="relative flex-1 max-w-sm">
          <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            placeholder="بحث عن عميل..."
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
          <span>عميل جديد</span>
        </button>
      </div>

      {loading ? (
        <LoadingSpinner size="lg" className="h-64" />
      ) : customerList.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-10 flex flex-col items-center justify-center gap-3">
          <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center">
            <Users size={28} className="text-slate-400" />
          </div>
          <p className="text-slate-500 font-medium">لا يوجد عملاء بعد</p>
          <p className="text-sm text-slate-400">أضف عميلك الأول للبدء</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {customerList.map((customer) => (
            <div
              key={customer.id}
              className="bg-white rounded-xl border border-slate-200 p-4 hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                    <Users size={20} className="text-blue-600" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-slate-800">{customer.name}</h3>
                    {customer.tax_id && (
                      <p className="text-xs text-slate-400">الرقم الضريبي: {customer.tax_id}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => openEditModal(customer)}
                    className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-blue-600 transition-colors"
                  >
                    <Edit2 size={16} />
                  </button>
                  <button
                    onClick={() => handleDelete(customer.id)}
                    className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-rose-600 transition-colors"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>

              <div className="space-y-2 text-sm">
                {customer.phone && (
                  <div className="flex items-center gap-2 text-slate-600">
                    <Phone size={14} className="text-slate-400" />
                    <span dir="ltr">{customer.phone}</span>
                  </div>
                )}
                {customer.email && (
                  <div className="flex items-center gap-2 text-slate-600">
                    <Mail size={14} className="text-slate-400" />
                    <span className="truncate">{customer.email}</span>
                  </div>
                )}
                {customer.address && (
                  <div className="flex items-center gap-2 text-slate-600">
                    <MapPin size={14} className="text-slate-400" />
                    <span className="truncate">{customer.address}</span>
                  </div>
                )}
              </div>

              {customer.credit_limit > 0 && (
                <div className="mt-3 pt-3 border-t border-slate-100">
                  <span className="text-xs text-slate-500">حد الائتمان: </span>
                  <span className="text-sm font-semibold text-slate-700">
                    {formatCurrency(customer.credit_limit)}
                  </span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-4 border-b border-slate-200">
              <h3 className="font-bold text-lg text-slate-800">
                {editingCustomer ? 'تعديل العميل' : 'إضافة عميل جديد'}
              </h3>
              <button onClick={() => setShowModal(false)} className="p-1 hover:bg-slate-100 rounded-lg">
                <X size={20} className="text-slate-500" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">الاسم *</label>
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
                  <label className="block text-sm font-medium text-slate-700 mb-1">الهاتف</label>
                  <input
                    type="tel"
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
                    dir="ltr"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">البريد الإلكتروني</label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
                    dir="ltr"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">العنوان</label>
                <input
                  type="text"
                  value={form.address}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">الرقم الضريبي</label>
                  <input
                    type="text"
                    value={form.tax_id}
                    onChange={(e) => setForm({ ...form, tax_id: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">حد الائتمان</label>
                  <input
                    type="number"
                    step="0.01"
                    value={form.credit_limit}
                    onChange={(e) => setForm({ ...form, credit_limit: e.target.value })}
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
                  {editingCustomer ? 'حفظ التعديلات' : 'إضافة العميل'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
