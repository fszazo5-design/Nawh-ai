import { useEffect, useState } from 'react'
import { DollarSign, Plus, Edit2, Trash2, X } from 'lucide-react'
import { expenses } from '../../services/neonService.js'
import LoadingSpinner from '../../components/ui/LoadingSpinner.jsx'
import { formatCurrency, formatDate } from '../../lib/utils.js'

export default function ExpensesPage() {
  const [expenseList, setExpenseList] = useState([])
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editingExpense, setEditingExpense] = useState(null)
  const [form, setForm] = useState({
    category_id: '', description: '', amount: '', paid_by: '', expense_date: ''
  })

  useEffect(() => {
    loadExpenses()
  }, [])

  async function loadExpenses() {
    setLoading(true)
    try {
      const [expensesData, categoriesData] = await Promise.all([
        expenses.getAll(),
        expenses.getCategories()
      ])
      setExpenseList(expensesData)
      setCategories(categoriesData)
    } catch {
      setExpenseList([])
      setCategories([])
    } finally {
      setLoading(false)
    }
  }

  function openCreateModal() {
    setEditingExpense(null)
    setForm({
      category_id: '', description: '', amount: '', paid_by: '',
      expense_date: new Date().toISOString().slice(0, 10)
    })
    setShowModal(true)
  }

  function openEditModal(expense) {
    setEditingExpense(expense)
    setForm({
      category_id: expense.category_id || '',
      description: expense.description || '',
      amount: expense.amount || '',
      paid_by: expense.paid_by || '',
      expense_date: expense.expense_date || ''
    })
    setShowModal(true)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    try {
      const data = {
        category_id: form.category_id || null,
        description: form.description,
        amount: parseFloat(form.amount) || 0,
        paid_by: form.paid_by || null,
        expense_date: form.expense_date || null
      }

      if (editingExpense) {
        await expenses.update(editingExpense.id, data)
      } else {
        await expenses.create(data)
      }
      setShowModal(false)
      loadExpenses()
    } catch (err) {
      console.error('Error saving expense:', err)
    }
  }

  async function handleDelete(id) {
    if (!confirm('هل أنت متأكد من حذف هذا المصروف؟')) return
    try {
      await expenses.delete(id)
      loadExpenses()
    } catch (err) {
      console.error('Error deleting expense:', err)
    }
  }

  const totalExpenses = expenseList.reduce((sum, e) => sum + (e.amount || 0), 0)

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="bg-rose-50 px-4 py-2 rounded-xl">
          <span className="text-sm text-rose-600">إجمالي المصروفات: </span>
          <span className="font-bold text-rose-700">{formatCurrency(totalExpenses)}</span>
        </div>
        <button
          onClick={openCreateModal}
          className="flex items-center gap-2 bg-rose-600 text-white text-sm font-semibold px-4 py-2.5 rounded-xl hover:bg-rose-700 active:bg-rose-800 transition-colors shadow-sm"
        >
          <Plus size={16} />
          <span>مصروف جديد</span>
        </button>
      </div>

      {loading ? (
        <LoadingSpinner size="lg" className="h-64" />
      ) : expenseList.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-10 flex flex-col items-center justify-center gap-3">
          <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center">
            <DollarSign size={28} className="text-slate-400" />
          </div>
          <p className="text-slate-500 font-medium">لا توجد مصروفات مسجلة</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3 text-right font-semibold text-slate-600">الوصف</th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-600">الفئة</th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-600">المبلغ</th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-600">التاريخ</th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-600">المدفوع بواسطة</th>
                  <th className="px-4 py-3 text-center font-semibold text-slate-600">إجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {expenseList.map((expense) => (
                  <tr key={expense.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-slate-800">{expense.description}</td>
                    <td className="px-4 py-3 text-slate-500">{expense.category_name || '-'}</td>
                    <td className="px-4 py-3 font-semibold text-rose-600">{formatCurrency(expense.amount)}</td>
                    <td className="px-4 py-3 text-slate-500">{formatDate(expense.expense_date)}</td>
                    <td className="px-4 py-3 text-slate-500">{expense.paid_by || '-'}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => openEditModal(expense)}
                          className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-rose-600 transition-colors"
                        >
                          <Edit2 size={16} />
                        </button>
                        <button
                          onClick={() => handleDelete(expense.id)}
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
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg">
            <div className="flex items-center justify-between p-4 border-b border-slate-200">
              <h3 className="font-bold text-lg text-slate-800">
                {editingExpense ? 'تعديل المصروف' : 'إضافة مصروف جديد'}
              </h3>
              <button onClick={() => setShowModal(false)} className="p-1 hover:bg-slate-100 rounded-lg">
                <X size={20} className="text-slate-500" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">الفئة</label>
                <select
                  value={form.category_id}
                  onChange={(e) => setForm({ ...form, category_id: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500/30"
                >
                  <option value="">اختر الفئة</option>
                  {categories.map(cat => (
                    <option key={cat.id} value={cat.id}>{cat.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">الوصف *</label>
                <input
                  type="text"
                  required
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500/30 focus:border-rose-500"
                  placeholder="وصف المصروف"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">المبلغ *</label>
                  <input
                    type="number"
                    required
                    step="0.01"
                    value={form.amount}
                    onChange={(e) => setForm({ ...form, amount: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500/30 focus:border-rose-500"
                    placeholder="0.00"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">التاريخ</label>
                  <input
                    type="date"
                    value={form.expense_date}
                    onChange={(e) => setForm({ ...form, expense_date: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500/30"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">المدفوع بواسطة</label>
                <input
                  type="text"
                  value={form.paid_by}
                  onChange={(e) => setForm({ ...form, paid_by: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500/30"
                  placeholder="اسم الشخص"
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
                  className="px-4 py-2 text-sm font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-lg transition-colors"
                >
                  {editingExpense ? 'حفظ التعديلات' : 'إضافة المصروف'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
