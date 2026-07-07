/**
 * WhatsApp Helper Utility
 * Formats messages for WhatsApp queue
 */

// Message templates in Arabic
const TEMPLATES = {
  invoice_created: {
    template: 'invoice_created',
    getValue: (data) => `فاتورة جديدة رقم ${data.invoice_number}\nالمبلغ: ${data.total_amount} ر.س\nتاريخ: ${data.date}\nشكراً لتعاملكم معنا`
  },
  invoice_reminder: {
    template: 'invoice_reminder',
    getValue: (data) => `تذكير: لديك فاتورة معلقة رقم ${data.invoice_number}\nالمبلغ المستحق: ${data.amount} ر.س\nيرجى السداد في أقرب وقت`
  },
  payment_received: {
    template: 'payment_received',
    getValue: (data) => `تم استلام الدفع بنجاح\nفاتورة رقم: ${data.invoice_number}\nالمبلغ: ${data.amount} ر.س\nشكراً لك`
  },
  order_ready: {
    template: 'order_ready',
    getValue: (data) => `طلبك جاهز للاستلام!\nرقم الطلب: ${data.order_number}\n${data.notes ? 'ملاحظات: ' + data.notes : ''}`
  },
  promotion: {
    template: 'promotion',
    getValue: (data) => `${data.title}\n${data.description}\n${data.discount ? 'خصم: ' + data.discount + '%' : ''}\n${data.valid_until ? 'صالح حتى: ' + data.valid_until : ''}`
  },
  greeting: {
    template: 'greeting',
    getValue: (data) => `مرحباً ${data.name || ''}!\n${data.message}\nمع أطيب التحيات - نواة AI`
  }
};

/**
 * Format a message using a template
 */
export function formatFromTemplate(templateName, data) {
  const template = TEMPLATES[templateName];
  if (!template) {
    return { message: data.message || '', template: null };
  }

  return {
    message: template.getValue(data),
    template: template.template
  };
}

/**
 * Create an invoice notification message
 */
export function createInvoiceMessage(invoice, customerName = '') {
  const totalFormatted = new Intl.NumberFormat('ar-SA', {
    style: 'currency',
    currency: 'SAR',
    minimumFractionDigits: 2
  }).format(invoice.total_amount || 0);

  return {
    recipient: '', // To be filled
    message: `فاتورة جديدة\n━━━━━━━━━━━━━\nرقم الفاتورة: ${invoice.invoice_number}\nالعميل: ${customerName || 'عميل نقدي'}\nالمجموع: ${totalFormatted}\nالحالة: ${invoice.status === 'paid' ? 'مدفوعة' : 'معلقة'}\nتاريخ: ${new Date(invoice.created_at).toLocaleDateString('ar-SA')}\n━━━━━━━━━━━━━\nشكراً لتعاملكم معنا - نواة AI`
  };
}

/**
 * Create a payment reminder message
 */
export function createReminderMessage(invoice) {
  const amountFormatted = new Intl.NumberFormat('ar-SA', {
    style: 'currency',
    currency: 'SAR',
    minimumFractionDigits: 2
  }).format(invoice.total_amount || 0);

  return {
    recipient: '',
    message: `تذكير بالسداد\n━━━━━━━━━━━━━\nرقم الفاتورة: ${invoice.invoice_number}\nالمبلغ المستحق: ${amountFormatted}\nتاريخ الفاتورة: ${new Date(invoice.created_at).toLocaleDateString('ar-SA')}\n━━━━━━━━━━━━━\nيرجى تسديد المبلغ في أقرب وقت ممكن.\nمع التحية - نواة AI`
  };
}

/**
 * Create an expense alert for admin
 */
export function createExpenseAlert(expense) {
  const amountFormatted = new Intl.NumberFormat('ar-SA', {
    style: 'currency',
    currency: 'SAR',
    minimumFractionDigits: 2
  }).format(expense.amount || 0);

  return {
    recipient: '',
    message: `تنبيه: مصروف جديد\n━━━━━━━━━━━━━\nالنوع: ${expense.category_name || 'غير محدد'}\nالوصف: ${expense.description}\nالمبلغ: ${amountFormatted}\nتم بواسطة: ${expense.paid_by || 'غير محدد'}\nالتاريخ: ${new Date(expense.expense_date || Date.now()).toLocaleDateString('ar-SA')}\n━━━━━━━━━━━━━\nنواة AI`
  };
}

/**
 * Create low stock alert
 */
export function createLowStockAlert(product) {
  return {
    recipient: '',
    message: `تنبيه: مخزون منخفض\n━━━━━━━━━━━━━\nالمنتج: ${product.name}\nالكمية الحالية: ${product.stock_qty}\nالحد الأدنى: ${product.min_stock_qty}\n━━━━━━━━━━━━━\nيرجى إعادة الطلب - نواة AI`
  };
}

/**
 * Format phone number for WhatsApp
 * Removes spaces, dashes, and adds country code if missing
 */
export function formatWhatsAppNumber(phone, countryCode = '966') {
  if (!phone) return '';

  // Remove non-digit characters
  let cleaned = phone.replace(/\D/g, '');

  // Add country code if missing
  if (cleaned.length <= 10 && !cleaned.startsWith(countryCode)) {
    cleaned = countryCode + cleaned;
  }

  // Must have at least 10 digits
  if (cleaned.length < 10) {
    return '';
  }

  return cleaned;
}

/**
 * Validate if a phone number looks valid for WhatsApp
 */
export function isValidWhatsAppNumber(phone) {
  const formatted = formatWhatsAppNumber(phone);
  return formatted.length >= 10 && formatted.length <= 15;
}

/**
 * Send a WhatsApp message (queue it for processing)
 */
import { whatsapp } from '../services/neonService.js';

export async function queueWhatsAppMessage(recipient, message, template = null, params = null) {
  const formattedRecipient = formatWhatsAppNumber(recipient);

  if (!isValidWhatsAppNumber(recipient)) {
    return { success: false, error: 'رقم الهاتف غير صالح' };
  }

  return whatsapp.queueMessage(formattedRecipient, message, template, params);
}

/**
 * Batch queue multiple messages
 */
export async function queueBatchMessages(messages) {
  const results = [];

  for (const msg of messages) {
    const result = await queueWhatsAppMessage(msg.recipient, msg.message, msg.template, msg.params);
    results.push({ recipient: msg.recipient, success: result ? true : false });
  }

  return results;
}

export default {
  formatFromTemplate,
  createInvoiceMessage,
  createReminderMessage,
  createExpenseAlert,
  createLowStockAlert,
  formatWhatsAppNumber,
  isValidWhatsAppNumber,
  queueWhatsAppMessage,
  queueBatchMessages
};
