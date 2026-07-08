/**
 * New Invoice Page
 * =-=-=-=-=-=-=-=-=-=
 * صفحة إنشاء فاتورة جديدة مع دعم تعدد طرق الدفع
 */

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ShoppingCart, Search, Plus, Minus, Trash2, User,
  CreditCard, Banknote, Wallet, QrCode, Printer, Send, X
} from 'lucide-react';
import { useDatabase } from '../../context/DatabaseContext.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useShift } from '../../context/ShiftContext.jsx';
import LoadingSpinner from '../../components/ui/LoadingSpinner.jsx';

export default function NewInvoicePage() {
  const navigate = useNavigate();
  const { products, customers, invoices, whatsapp } = useDatabase();
  const { user } = useAuth();
  const { currentShift, isShiftOpen } = useShift();

  // State
  const [loading, setLoading] = useState(false);
  const [searchProduct, setSearchProduct] = useState('');
  const [searchCustomer, setSearchCustomer] = useState('');
  const [productResults, setProductResults] = useState([]);
  const [customerResults, setCustomerResults] = useState([]);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [cart, setCart] = useState([]);
  const [payments, setPayments] = useState([{ method: 'cash', amount: 0 }]);
  const [discount, setDiscount] = useState({ type: 'fixed', value: 0 });
  const [notes, setNotes] = useState('');
  const [showProductSearch, setShowProductSearch] = useState(false);
  const [showCustomerSearch, setShowCustomerSearch] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showQRModal, setShowQRModal] = useState(false);
  const [createdInvoice, setCreatedInvoice] = useState(null);

  // Calculations
  const subtotal = cart.reduce((sum, item) => sum + item.total, 0);
  const discountAmount = discount.type === 'percent'
    ? subtotal * (discount.value / 100)
    : discount.value;
  const afterDiscount = subtotal - discountAmount;
  const taxAmount = afterDiscount * 0.15; // 15% VAT
  const totalAmount = afterDiscount + taxAmount;
  const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);
  const balanceDue = totalAmount - totalPaid;

  // Search products
  useEffect(() => {
    const timer = setTimeout(async () => {
      if (searchProduct.trim().length > 1) {
        const resultsObj = await products.getAll({ search: searchProduct });
        setProductResults(resultsObj);
      } else {
        setProductResults([]);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchProduct, products]);

  // Search customers
  useEffect(() => {
    const timer = setTimeout(async () => {
      if (searchCustomer.trim().length > 1) {
        const resultsObj = await customers.getAll(searchCustomer);
        setCustomerResults(resultsObj);
      } else {
        setCustomerResults([]);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchCustomer, customers]);

  // Add product to cart
  const addToCart = useCallback((product) => {
    setCart(prev => {
      const existing = prev.find(item => item.id === product.id);
      if (existing) {
        return prev.map(item =>
          item.id === product.id
            ? { ...item, qty: item.qty + 1, total: (item.qty + 1) * item.sell_price }
            : item
        );
      }
      return [...prev, {
        id: product.id,
        name: product.name,
        barcode: product.barcode,
        sell_price: product.sell_price,
        cost_price: product.cost_price,
        qty: 1,
        max_qty: product.stock_qty,
        total: product.sell_price
      }];
    });
    setSearchProduct('');
    setShowProductSearch(false);
  }, []);

  // Update cart item
  const updateCartItem = useCallback((itemId, field, value) => {
    setCart(prev => prev.map(item => {
      if (item.id !== itemId) return item;

      let newValue = parseFloat(value) || 0;
      if (field === 'qty' && item.max_qty !== undefined) {
        newValue = Math.min(newValue, item.max_qty);
        newValue = Math.max(newValue, 1);
      }

      const updatedItem = { ...item, [field]: newValue };
      updatedItem.total = updatedItem.qty * updatedItem.sell_price;
      return updatedItem;
    }));
  }, []);

  // Remove from cart
  const removeFromCart = useCallback((itemId) => {
    setCart(prev => prev.filter(item => item.id !== itemId));
  }, []);

  // Add payment method
  const addPayment = useCallback(() => {
    setPayments(prev => [...prev, { method: 'cash', amount: 0 }]);
  }, []);

  // Update payment
  const updatePayment = useCallback((index, field, value) => {
    setPayments(prev => prev.map((payment, i) =>
      i === index ? { ...payment, [field]: value } : payment
    ));
  }, []);

  // Remove payment
  const removePayment = useCallback((index) => {
    setPayments(prev => prev.filter((_, i) => i !== index));
  }, []);

  // Payment icon
  const getPaymentIcon = (method) => {
    switch (method) {
      case 'card': return <CreditCard size={16} />;
      case 'credit': return <Wallet size={16} />;
      default: return <Banknote size={16} />;
    }
  };

  // Process invoice
  const processInvoice = async () => {
    if (cart.length === 0) {
      alert('السلة فارغة');
      return;
    }

    if (!isShiftOpen) {
      alert('يجب فتح وردية أولاً');
      return;
    }

    if (balanceDue > 0.01) {
      alert('المبلغ المدفوع أقل من الإجمالي');
      return;
    }

    setLoading(true);
    try {
      const invoiceData = {
        customer_id: selectedCustomer?.id || null,
        customer_name: selectedCustomer?.name || 'عميل نقدي',
        user_id: user?.id,
        user_name: user?.full_name || user?.email,
        status: 'completed',
        subtotal,
        discount_amt: discountAmount,
        discount_percent: discount.type === 'percent' ? discount.value : 0,
        tax_rate: 15,
        tax_amt: taxAmount,
        total_amount: totalAmount,
        paid_amount: totalPaid,
        balance_due: balanceDue > 0 ? balanceDue : 0,
        payment_method: payments.length > 1 ? 'split' : payments[0].method,
        payment_details: payments,
        notes,
        items: cart.map(item => ({
          product_id: item.id,
          name: item.name,
          barcode: item.barcode,
          qty: item.qty,
          unit_price: item.sell_price,
          cost_price: item.cost_price,
          discount: 0,
          total: item.total
        }))
      };

      const invoice = await invoices.create(invoiceData);
      setCreatedInvoice(invoice);
      setShowPaymentModal(false);
      setShowQRModal(true);

      // Generate QR
      generateQR(invoice);

    } catch (err) {
      console.error('Error creating invoice:', err);
      alert('حدث خطأ في إنشاء الفاتورة');
    } finally {
      setLoading(false);
    }
  };

  // Generate ZATCA-compliant QR
  const generateQR = (invoice) => {
    // Simplified ZATCA QR generation
    const qrData = {
      seller: 'نواة AI',
      vatNo: 'XXXXXXXXXXX',
      timestamp: new Date().toISOString(),
      total: totalAmount.toFixed(2),
      vat: taxAmount.toFixed(2)
    };
    // In real implementation, use proper ZATCA TLV encoding
    return JSON.stringify(qrData);
  };

  // Send via WhatsApp
  const sendViaWhatsApp = async () => {
    if (!selectedCustomer?.phone && !createdInvoice) return;

    const message = `فاتورة رقم: ${createdInvoice.invoice_number}
التاريخ: ${new Date(createdInvoice.created_at).toLocaleDateString('ar-SA')}
الإجمالي: ${totalAmount.toFixed(2)} ريال
---
شكراً لتعاملكم معنا!`;

    const url = whatsapp.generateWhatsAppUrl(selectedCustomer.phone, message);
    window.open(url, '_blank');
  };

  // Print invoice
  const printInvoice = () => {
    window.print();
  };

  // Clear form
  const clearForm = () => {
    setCart([]);
    setSelectedCustomer(null);
    setPayments([{ method: 'cash', amount: 0 }]);
    setDiscount({ type: 'fixed', value: 0 });
    setNotes('');
    setShowQRModal(false);
    setCreatedInvoice(null);
  };

  return (
    <div className="h-[calc(100vh-64px)] flex" dir="rtl">
      {/* Left Panel - Products */}
      <div className="flex-1 flex flex-col border-l border-slate-200 bg-white">
        {/* Search */}
        <div className="p-4 bg-slate-50">
          <div className="relative">
            <Search size={18} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchProduct}
              onChange={(e) => {
                setSearchProduct(e.target.value);
                setShowProductSearch(true);
              }}
              onFocus={() => setShowProductSearch(true)}
              placeholder="بحث بالاسم أو الباركود..."
              className="w-full pr-10 pl-4 py-3 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Product Results */}
          {showProductSearch && productResults.length > 0 && (
            <div className="absolute z-10 mt-1 w-[calc(100%-2rem)] bg-white border border-slate-200 rounded-lg shadow-lg max-h-64 overflow-auto">
              {productResults.map(product => (
                <button
                  key={product.id}
                  onClick={() => addToCart(product)}
                  className="w-full px-4 py-3 text-right hover:bg-slate-50 flex items-center justify-between"
                >
                  <div>
                    <p className="font-medium text-slate-800">{product.name}</p>
                    <p className="text-sm text-slate-500">
                      السعر: {product.sell_price} | المخزون: {product.stock_qty}
                    </p>
                  </div>
                  <span className="text-blue-600 font-medium">إضافة</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Cart */}
        <div className="flex-1 overflow-auto p-4">
          {cart.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <ShoppingCart size={48} className="mx-auto mb-4" />
              <p>السلة فارغة</p>
            </div>
          ) : (
            <div className="space-y-2">
              {cart.map(item => (
                <div key={item.id} className="bg-slate-50 rounded-lg p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium text-slate-800">{item.name}</span>
                    <button
                      onClick={() => removeFromCart(item.id)}
                      className="p-1 hover:bg-red-100 rounded text-red-500"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="flex items-center border border-slate-200 rounded-lg">
                      <button
                        onClick={() => updateCartItem(item.id, 'qty', item.qty - 1)}
                        className="px-2 py-1 hover:bg-slate-100"
                        disabled={item.qty <= 1}
                      >
                        <Minus size={14} />
                      </button>
                      <input
                        type="number"
                        value={item.qty}
                        onChange={(e) => updateCartItem(item.id, 'qty', e.target.value)}
                        className="w-12 text-center border-x border-slate-200 py-1"
                      />
                      <button
                        onClick={() => updateCartItem(item.id, 'qty', item.qty + 1)}
                        className="px-2 py-1 hover:bg-slate-100"
                        disabled={item.max_qty && item.qty >= item.max_qty}
                      >
                        <Plus size={14} />
                      </button>
                    </div>

                    <div className="flex-1 text-slate-500 text-sm">
                      {item.sell_price} × {item.qty}
                    </div>

                    <div className="font-bold text-blue-600">
                      {item.total.toFixed(2)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Customer Selection */}
        <div className="p-4 border-t border-slate-200">
          <button
            onClick={() => setShowCustomerSearch(true)}
            className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-right flex items-center justify-between hover:bg-slate-100"
          >
            {selectedCustomer ? (
              <span className="text-slate-800">{selectedCustomer.name}</span>
            ) : (
              <span className="text-slate-500">
                <User size={16} className="inline ml-1" />
                عميل نقدي
              </span>
            )}
            <span className="text-blue-600 text-sm">تغيير</span>
          </button>
        </div>
      </div>

      {/* Right Panel - Summary */}
      <div className="w-96 flex flex-col bg-slate-800 text-white">
        {/* Header */}
        <div className="p-4 border-b border-slate-700">
          <h2 className="text-lg font-bold">ملخص الفاتورة</h2>
        </div>

        {/* Calculations */}
        <div className="flex-1 p-4 space-y-3 text-sm">
          <div className="flex justify-between">
            <span className="text-slate-400">المجموع الفرعي</span>
            <span>{subtotal.toFixed(2)}</span>
          </div>

          {/* Discount */}
          <div className="flex items-center gap-2">
            <input
              type="number"
              value={discount.value}
              onChange={(e) => setDiscount(prev => ({ ...prev, value: parseFloat(e.target.value) || 0 }))}
              className="flex-1 w-20 px-3 py-1 bg-slate-700 rounded text-white text-right"
              placeholder="الخصم"
            />
            <select
              value={discount.type}
              onChange={(e) => setDiscount(prev => ({ ...prev, type: e.target.value }))}
              className="w-20 px-2 py-1 bg-slate-700 rounded text-white"
            >
              <option value="fixed">ريال</option>
              <option value="percent">%</option>
            </select>
          </div>

          {discountAmount > 0 && (
            <div className="flex justify-between text-amber-400">
              <span>الخصم</span>
              <span>-{discountAmount.toFixed(2)}</span>
            </div>
          )}

          <div className="flex justify-between text-slate-400">
            <span>ضريبة القيمة المضافة (15%)</span>
            <span>{taxAmount.toFixed(2)}</span>
          </div>

          <div className="h-px bg-slate-700 my-2" />

          <div className="flex justify-between text-xl font-bold">
            <span>الإجمالي</span>
            <span>{totalAmount.toFixed(2)} ريال</span>
          </div>

          {/* Notes */}
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="ملاحظات..."
            className="w-full px-3 py-2 bg-slate-700 rounded text-white text-sm resize-none"
            rows={2}
          />
        </div>

        {/* Actions */}
        <div className="p-4 space-y-2">
          <button
            onClick={() => setShowPaymentModal(true)}
            disabled={cart.length === 0}
            className="w-full py-3 bg-blue-600 hover:bg-blue-700 rounded-lg font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            الدفع ({totalAmount.toFixed(2)} ريال)
          </button>

          <button
            onClick={() => {
              setCart([]);
              setSelectedCustomer(null);
            }}
            className="w-full py-2 bg-transparent border border-slate-600 hover:bg-slate-700 rounded-lg text-sm transition-colors"
          >
            إلغاء الفاتورة
          </button>
        </div>
      </div>

      {/* Payment Modal */}
      {showPaymentModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl w-full max-w-md mx-4" dir="rtl">
            <div className="p-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-lg font-bold">الدفع</h3>
              <button onClick={() => setShowPaymentModal(false)}>
                <X size={20} className="text-slate-500" />
              </button>
            </div>

            <div className="p-4 space-y-4">
              {/* Amount Due */}
              <div className="text-center py-4 bg-slate-50 rounded-lg">
                <p className="text-slate-500 text-sm">المبلغ المطلوب</p>
                <p className="text-3xl font-bold text-slate-800">{totalAmount.toFixed(2)} ريال</p>
              </div>

              {/* Payment Methods */}
              <div className="space-y-3">
                {payments.map((payment, index) => (
                  <div key={index} className="flex gap-2">
                    <select
                      value={payment.method}
                      onChange={(e) => updatePayment(index, 'method', e.target.value)}
                      className="w-32 px-3 py-2 border border-slate-200 rounded-lg"
                    >
                      <option value="cash">نقدي</option>
                      <option value="card">بطاقة</option>
                      <option value="credit">آجل</option>
                    </select>
                    <input
                      type="number"
                      value={payment.amount}
                      onChange={(e) => updatePayment(index, 'amount', parseFloat(e.target.value) || 0)}
                      className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-left"
                      placeholder="المبلغ"
                    />
                    {payments.length > 1 && (
                      <button
                        onClick={() => removePayment(index)}
                        className="p-2 text-red-500 hover:bg-red-50 rounded-lg"
                      >
                        <Trash2 size={18} />
                      </button>
                    )}
                  </div>
                ))}

                <button
                  onClick={addPayment}
                  className="w-full py-2 border border-dashed border-slate-300 rounded-lg text-slate-500 hover:bg-slate-50"
                >
                  <Plus size={16} className="inline ml-1" />
                  إضافة طريقة دفع
                </button>
              </div>

              {/* Summary */}
              <div className="p-3 bg-blue-50 rounded-lg space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-600">الإجمالي</span>
                  <span className="font-bold">{totalAmount.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">المدفوع</span>
                  <span className="font-bold text-emerald-600">{totalPaid.toFixed(2)}</span>
                </div>
                <div className="flex justify-between font-bold">
                  <span>الباقي</span>
                  <span className={balanceDue > 0 ? 'text-red-600' : 'text-emerald-600'}>
                    {balanceDue.toFixed(2)}
                  </span>
                </div>
              </div>
            </div>

            <div className="p-4 border-t border-slate-200 flex gap-2">
              <button
                onClick={() => setShowPaymentModal(false)}
                className="flex-1 py-2 border border-slate-200 rounded-lg hover:bg-slate-50"
              >
                إلغاء
              </button>
              <button
                onClick={processInvoice}
                disabled={loading || balanceDue > 0.01}
                className="flex-1 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {loading ? <LoadingSpinner size="sm" /> : 'تأكيد الدفع'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* QR/Success Modal */}
      {showQRModal && createdInvoice && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl w-full max-w-md mx-4" dir="rtl">
            <div className="p-4 border-b border-slate-200 text-center">
              <h3 className="text-lg font-bold text-emerald-600">تم إنشاء الفاتورة بنجاح!</h3>
              <p className="text-slate-500 text-sm mt-1">{createdInvoice.invoice_number}</p>
            </div>

            <div className="p-6 text-center">
              {/* QR Placeholder */}
              <div className="w-40 h-40 mx-auto bg-slate-100 rounded-lg flex items-center justify-center mb-4">
                <QrCode size={80} className="text-slate-400" />
              </div>

              <p className="text-slate-600 mb-4">
                الإجمالي: <span className="font-bold text-xl">{totalAmount.toFixed(2)} ريال</span>
              </p>
            </div>

            <div className="p-4 border-t border-slate-200 grid grid-cols-2 gap-2">
              <button
                onClick={printInvoice}
                className="py-3 bg-slate-100 hover:bg-slate-200 rounded-lg flex items-center justify-center gap-2"
              >
                <Printer size={18} />
                <span>طباعة</span>
              </button>
              <button
                onClick={sendViaWhatsApp}
                disabled={!selectedCustomer?.phone}
                className="py-3 bg-emerald-100 text-emerald-700 hover:bg-emerald-200 rounded-lg flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <Send size={18} />
                <span>واتساب</span>
              </button>
            </div>

            <div className="px-4 pb-4">
              <button
                onClick={clearForm}
                className="w-full py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                فاتورة جديدة
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Customer Search Modal */}
      {showCustomerSearch && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl w-full max-w-md mx-4" dir="rtl">
            <div className="p-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-lg font-bold">اختيار عميل</h3>
              <button onClick={() => setShowCustomerSearch(false)}>
                <X size={20} className="text-slate-500" />
              </button>
            </div>

            <div className="p-4">
              <input
                type="text"
                value={searchCustomer}
                onChange={(e) => setSearchCustomer(e.target.value)}
                placeholder="بحث عن عميل..."
                className="w-full px-4 py-2 border border-slate-200 rounded-lg"
                autoFocus
              />

              {customerResults.length > 0 && (
                <div className="mt-3 max-h-48 overflow-auto border border-slate-200 rounded-lg">
                  {customerResults.map(customer => (
                    <button
                      key={customer.id}
                      onClick={() => {
                        setSelectedCustomer(customer);
                        setShowCustomerSearch(false);
                        setSearchCustomer('');
                      }}
                      className="w-full px-4 py-3 text-right hover:bg-slate-50"
                    >
                      <p className="font-medium text-slate-800">{customer.name}</p>
                      <p className="text-sm text-slate-500">{customer.phone}</p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
