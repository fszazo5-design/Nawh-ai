/**
 * WhatsApp CRM Page
 * =-=-=-=-=-=-=-=-=-=
 * صفحة إدارة التواصل عبر واتساب
 */

import { useState, useEffect } from 'react';
import {
  MessageCircle, Send, Users, UserPlus, Building2, Search,
  FileText, AlertCircle, Clock, CheckCircle, X, Phone
} from 'lucide-react';
import { useDatabase } from '../../context/DatabaseContext.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useShift } from '../../context/ShiftContext.jsx';
import LoadingSpinner from '../../components/ui/LoadingSpinner.jsx';

// Message Templates
const MESSAGE_TEMPLATES = {
  invoice: {
    title: 'تفاصيل الفاتورة',
    template: (data) => `فاتورة رقم: ${data.invoice_number}
التاريخ: ${data.date}
الإجمالي: ${data.total} ريال
طريقة الدفع: ${data.payment_method}
---
شكراً لتعاملكم معنا!`
  },
  order_request: {
    title: 'طلب توريد',
    template: (data) => `طلب توريد جديد
---
المورد: ${data.supplier_name}
المنتجات المطلوبة:
${data.items}
---
يرجى التواصل للتأكيد`
  },
  payment_reminder: {
    title: 'تذكير بالسداد',
    template: (data) => `تذكير بفاتورة مستحقة

فاتورة رقم: ${data.invoice_number}
المبلغ المستحق: ${data.amount} ريال
تاريخ الاستحقاق: ${data.due_date}

يرجى المبادرة بالسداد.`
  },
  custom: {
    title: 'رسالة مخصصة',
    template: (data) => data.message || ''
  }
};

// Request Types
const REQUEST_TYPES = [
  { id: 'salary_advance', label: 'طلب سلفة' },
  { id: 'issue_report', label: 'بلاغ مشكلة' },
  { id: 'special_order', label: 'طلب بضاعة خاص' },
  { id: 'leave_request', label: 'طلب إجازة' },
  { id: 'other', label: 'طلب آخر' }
];

export default function WhatsAppCRMPage() {
  const { whatsapp, adminRequests, invoices, customers, suppliers } = useDatabase();
  const { user } = useAuth();
  const { currentShift } = useShift();

  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('contacts');
  const [contactType, setContactType] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [contacts, setContacts] = useState([]);
  const [selectedContact, setSelectedContact] = useState(null);
  const [showMessageModal, setShowMessageModal] = useState(false);
  const [showAdminRequestModal, setShowAdminRequestModal] = useState(false);

  // Message state
  const [messageType, setMessageType] = useState('custom');
  const [messageText, setMessageText] = useState('');
  const [templateData, setTemplateData] = useState({});

  // Admin request state
  const [requestType, setRequestType] = useState('other');
  const [requestTitle, setRequestTitle] = useState('');
  const [requestDescription, setRequestDescription] = useState('');
  const [requestPriority, setRequestPriority] = useState('normal');

  // Pending messages
  const [pendingMessages, setPendingMessages] = useState([]);
  const [sentMessages, setSentMessages] = useState([]);

  // Load contacts
  useEffect(() => {
    loadContacts();
  }, [contactType]);

  const loadContacts = async () => {
    setLoading(true);
    try {
      const contactList = await whatsapp.getRecipientsFromContacts(contactType);
      setContacts(contactList);
    } catch (err) {
      console.error('Error loading contacts:', err);
    } finally {
      setLoading(false);
    }
  };

  // Filter contacts
  const filteredContacts = searchQuery
    ? contacts.filter(c =>
        c.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.phone?.includes(searchQuery)
      )
    : contacts;

  // Open message modal
  const openMessageModal = (contact) => {
    setSelectedContact(contact);
    setMessageType('custom');
    setMessageText('');
    setShowMessageModal(true);
  };

  // Generate message from template
  const generateMessage = () => {
    const template = MESSAGE_TEMPLATES[messageType];
    if (template) {
      const msg = template.template(templateData);
      setMessageText(msg);
    }
  };

  // Send message via WhatsApp
  const sendMessage = async () => {
    if (!selectedContact || !messageText.trim()) return;

    // Open WhatsApp with message
    const url = whatsapp.generateWhatsAppUrl(selectedContact.phone, messageText);
    window.open(url, '_blank');

    // Log to queue
    await whatsapp.queueMessage({
      recipient_type: selectedContact.type,
      recipient_id: selectedContact.id,
      recipient_name: selectedContact.name,
      phone: selectedContact.phone,
      message: messageText,
      template_type: messageType
    });

    setShowMessageModal(false);
    loadContacts();
  };

  // Send admin request via WhatsApp
  const sendAdminRequest = async () => {
    if (!requestTitle.trim() || !requestDescription.trim()) return;

    try {
      // Create request record
      const requestId = await adminRequests.create({
        user_id: user?.id,
        user_name: user?.full_name || user?.email,
        request_type: requestType,
        title: requestTitle,
        description: requestDescription,
        priority: requestPriority
      });

      // Get request label
      const typeLabel = REQUEST_TYPES.find(t => t.id === requestType)?.label || 'طلب';

      // Generate message
      const message = `طلب ${typeLabel}
---
العنوان: ${requestTitle}
التفاصيل: ${requestDescription}
الأولوية: ${requestPriority === 'urgent' ? 'عاجل' : requestPriority === 'high' ? 'مهم' : 'عادي'}
---
الموظف: ${user?.full_name || user?.email}
${currentShift ? `الوردية: ${currentShift.id?.substring(0, 8)}` : ''}
التاريخ: ${new Date().toLocaleString('ar-SA')}`;

      // Get admin phone from settings or use default
      const adminPhone = import.meta.env.VITE_ADMIN_PHONE || '';

      if (adminPhone) {
        const url = whatsapp.generateWhatsAppUrl(adminPhone, message);
        window.open(url, '_blank');
      }

      setShowAdminRequestModal(false);
      setRequestType('other');
      setRequestTitle('');
      setRequestDescription('');
      setRequestPriority('normal');

      alert('تم إرسال الطلب بنجاح');
    } catch (err) {
      console.error('Error sending admin request:', err);
      alert('حدث خطأ في إرسال الطلب');
    }
  };

  return (
    <div className="p-6 space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">مركز التواصل</h1>
          <p className="text-slate-500 text-sm mt-1">إدارة الرسائل والتواصل عبر واتساب</p>
        </div>

        <button
          onClick={() => setShowAdminRequestModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          <AlertCircle size={18} />
          <span>طلب للإدارة</span>
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-slate-200">
        <button
          onClick={() => setActiveTab('contacts')}
          className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'contacts'
              ? 'border-blue-500 text-blue-600'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <Users size={16} className="inline ml-1" />
          جهات الاتصال
        </button>
        <button
          onClick={() => setActiveTab('pending')}
          className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'pending'
              ? 'border-blue-500 text-blue-600'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <Clock size={16} className="inline ml-1" />
          قيد الانتظار
        </button>
      </div>

      {/* Content */}
      {activeTab === 'contacts' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          {/* Filters */}
          <div className="p-4 border-b border-slate-200 flex items-center gap-4">
            <div className="flex gap-2">
              <button
                onClick={() => setContactType('all')}
                className={`px-3 py-1.5 rounded-lg text-sm ${contactType === 'all' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600'}`}
              >
                الكل
              </button>
              <button
                onClick={() => setContactType('customers')}
                className={`px-3 py-1.5 rounded-lg text-sm ${contactType === 'customers' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600'}`}
              >
                <Users size={14} className="inline ml-1" />
                العملاء
              </button>
              <button
                onClick={() => setContactType('suppliers')}
                className={`px-3 py-1.5 rounded-lg text-sm ${contactType === 'suppliers' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600'}`}
              >
                <Building2 size={14} className="inline ml-1" />
                الموردين
              </button>
            </div>

            <div className="flex-1">
              <div className="relative">
                <Search size={18} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="بحث..."
                  className="w-full pr-10 pl-4 py-2 border border-slate-200 rounded-lg text-sm"
                />
              </div>
            </div>
          </div>

          {/* Contacts List */}
          {loading ? (
            <div className="flex justify-center py-8">
              <LoadingSpinner />
            </div>
          ) : filteredContacts.length === 0 ? (
            <div className="text-center py-8 text-slate-500">
              <Users size={48} className="mx-auto mb-4 text-slate-300" />
              <p>لا توجد جهات اتصال</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {filteredContacts.map(contact => (
                <div key={`${contact.type}-${contact.id}`} className="flex items-center justify-between p-4 hover:bg-slate-50">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${contact.type === 'supplier' ? 'bg-amber-100 text-amber-600' : 'bg-blue-100 text-blue-600'}`}>
                      {contact.type === 'supplier' ? <Building2 size={20} /> : <Users size={20} />}
                    </div>
                    <div>
                      <p className="font-medium text-slate-800">{contact.name}</p>
                      <p className="text-sm text-slate-500 flex items-center gap-1">
                        <Phone size={12} />
                        {contact.phone}
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={() => openMessageModal(contact)}
                    className="flex items-center gap-2 px-3 py-1.5 bg-emerald-100 text-emerald-700 rounded-lg hover:bg-emerald-200"
                  >
                    <MessageCircle size={16} />
                    <span className="text-sm">رسالة</span>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'pending' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
          <div className="text-center py-8 text-slate-500">
            <CheckCircle size={48} className="mx-auto mb-4 text-emerald-300" />
            <p>لا توجد رسائل معلقة</p>
          </div>
        </div>
      )}

      {/* Message Modal */}
      {showMessageModal && selectedContact && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl w-full max-w-lg mx-4" dir="rtl">
            <div className="p-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-lg font-bold">إرسال رسالة</h3>
              <button onClick={() => setShowMessageModal(false)}>
                <X size={20} className="text-slate-500" />
              </button>
            </div>

            <div className="p-4 space-y-4">
              {/* Recipient */}
              <div className="p-3 bg-slate-50 rounded-lg">
                <p className="text-sm text-slate-500">المستلم</p>
                <p className="font-medium text-slate-800">{selectedContact.name}</p>
                <p className="text-sm text-slate-500">{selectedContact.phone}</p>
              </div>

              {/* Template Type */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">نوع الرسالة</label>
                <select
                  value={messageType}
                  onChange={(e) => setMessageType(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                >
                  <option value="custom">رسالة مخصصة</option>
                  <option value="invoice">تفاصيل فاتورة</option>
                  <option value="payment_reminder">تذكير بالسداد</option>
                  {selectedContact.type === 'supplier' && <option value="order_request">طلب توريد</option>}
                </select>
              </div>

              {/* Message Text */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">نص الرسالة</label>
                <textarea
                  value={messageText}
                  onChange={(e) => setMessageText(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg resize-none"
                  rows={5}
                  placeholder="اكتب رسالتك هنا..."
                />
              </div>
            </div>

            <div className="p-4 border-t border-slate-200 flex gap-2">
              <button
                onClick={() => setShowMessageModal(false)}
                className="flex-1 py-2 border border-slate-200 rounded-lg hover:bg-slate-50"
              >
                إلغاء
              </button>
              <button
                onClick={sendMessage}
                disabled={!messageText.trim()}
                className="flex-1 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <Send size={18} />
                <span>إرسال عبر واتساب</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Admin Request Modal */}
      {showAdminRequestModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl w-full max-w-lg mx-4" dir="rtl">
            <div className="p-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-lg font-bold">طلب للإدارة</h3>
              <button onClick={() => setShowAdminRequestModal(false)}>
                <X size={20} className="text-slate-500" />
              </button>
            </div>

            <div className="p-4 space-y-4">
              {/* User Info */}
              <div className="p-3 bg-blue-50 rounded-lg text-sm">
                <p className="text-blue-800">
                  <strong>الموظف:</strong> {user?.full_name || user?.email}
                </p>
                {currentShift && (
                  <p className="text-blue-600 mt-1">
                    <strong>الوردية:</strong> {currentShift.id?.substring(0, 8)}
                  </p>
                )}
              </div>

              {/* Request Type */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">نوع الطلب</label>
                <select
                  value={requestType}
                  onChange={(e) => setRequestType(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                >
                  {REQUEST_TYPES.map(type => (
                    <option key={type.id} value={type.id}>{type.label}</option>
                  ))}
                </select>
              </div>

              {/* Title */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">عنوان الطلب</label>
                <input
                  type="text"
                  value={requestTitle}
                  onChange={(e) => setRequestTitle(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                  placeholder="عنوان مختصر للطلب..."
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">التفاصيل</label>
                <textarea
                  value={requestDescription}
                  onChange={(e) => setRequestDescription(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg resize-none"
                  rows={4}
                  placeholder="اشرح طلبك بالتفصيل..."
                />
              </div>

              {/* Priority */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">الأولوية</label>
                <div className="flex gap-2">
                  {[
                    { id: 'normal', label: 'عادي', color: 'bg-slate-100 text-slate-600' },
                    { id: 'high', label: 'مهم', color: 'bg-amber-100 text-amber-600' },
                    { id: 'urgent', label: 'عاجل', color: 'bg-red-100 text-red-600' }
                  ].map(p => (
                    <button
                      key={p.id}
                      onClick={() => setRequestPriority(p.id)}
                      className={`flex-1 py-2 rounded-lg text-sm ${requestPriority === p.id ? p.color : 'bg-slate-100 text-slate-500'}`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="p-4 border-t border-slate-200 flex gap-2">
              <button
                onClick={() => setShowAdminRequestModal(false)}
                className="flex-1 py-2 border border-slate-200 rounded-lg hover:bg-slate-50"
              >
                إلغاء
              </button>
              <button
                onClick={sendAdminRequest}
                disabled={!requestTitle.trim() || !requestDescription.trim()}
                className="flex-1 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <Send size={18} />
                <span>إرسال الطلب</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
