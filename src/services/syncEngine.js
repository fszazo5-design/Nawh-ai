/**
 * Sync Engine - محرك المزامنة الثنائية
 * =-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=
 * يدير المزامنة بين SQLite المحلي و Neon السحابي
 * يدعم المراقبة التلقائية واليدوية
 */

import { Preferences } from '@capacitor/preferences';
import { CapacitorHttp } from '@capacitor/core';
import { API_BASE, AUTH_ENDPOINTS, DATA_ENDPOINTS, addId } from '../config/apiEndpoints.js';

// Storage Keys
const SYNC_KEYS = {
  LAST_SYNC: 'nawh_last_sync_timestamp',
  SYNC_QUEUE: 'nawh_sync_queue',
  OFFLINE_QUEUE: 'nawh_offline_operations',
  PENDING_UPLOADS: 'nawh_pending_uploads',
  SYNC_STATUS: 'nawh_sync_status',
  USER: 'nawh_user',
  TOKEN: 'nawh_token',
  CURRENT_SHIFT: 'nawh_current_shift'
};

// Sync Status Constants
export const SYNC_STATUS = {
  PENDING: 'pending',
  SYNCING: 'syncing',
  SYNCED: 'synced',
  FAILED: 'failed',
  CONFLICT: 'conflict'
};

// Tables to sync (بترتيب العلاقات)
const SYNC_TABLES = [
  'products',
  'customers',
  'suppliers',
  'expense_categories',
  'shifts',
  'invoices',
  'invoice_items',
  'purchase_orders',
  'purchase_order_items',
  'expenses',
  'stock_movements',
  'loyalty_transactions',
  'whatsapp_queue',
  'admin_requests'
];

// ============================================
// Sync State Management
// ============================================

/**
 * جلب حالة المزامنة
 */
export async function getSyncStatus() {
  try {
    const { value } = await Preferences.get({ key: SYNC_KEYS.SYNC_STATUS });
    return value ? JSON.parse(value) : {
      isOnline: navigator.onLine,
      lastSync: null,
      pendingCount: 0,
      failedCount: 0,
      isSyncing: false
    };
  } catch {
    return {
      isOnline: navigator.onLine,
      lastSync: null,
      pendingCount: 0,
      failedCount: 0,
      isSyncing: false
    };
  }
}

/**
 * تحديث حالة المزامنة
 */
async function updateSyncStatus(status) {
  try {
    await Preferences.set({
      key: SYNC_KEYS.SYNC_STATUS,
      value: JSON.stringify({
        ...await getSyncStatus(),
        ...status,
        isOnline: navigator.onLine,
        updated: Date.now()
      })
    });
  } catch (err) {
    console.error('Error updating sync status:', err);
  }
}

// ============================================
// HTTP Request Helper
// ============================================

async function httpRequest(endpoint, method = 'GET', data = null) {
  const token = await getTokenFromPreferences();

  const headers = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    ...(token && { 'Authorization': `Bearer ${token}` })
  };

  const options = {
    url: `${API_BASE}${endpoint}`,
    method,
    headers,
    responseType: 'json',
    readTimeout: 30000,
    connectTimeout: 30000
  };

  if (data && (method === 'POST' || method === 'PUT')) {
    options.data = data;
  }

  try {
    const isNative = typeof window !== 'undefined' && window.Capacitor?.isNativePlatform?.();

    if (isNative) {
      const response = await CapacitorHttp.request(options);
      return {
        success: response.status >= 200 && response.status < 300,
        data: response.data?.data || response.data,
        status: response.status
      };
    } else {
      const fetchOptions = { method, headers };
      if (data) fetchOptions.body = JSON.stringify(data);

      const response = await fetch(options.url, fetchOptions);
      const result = await response.json();

      return {
        success: response.ok,
        data: result.data || result,
        status: response.status
      };
    }
  } catch (err) {
    console.error('HTTP request error:', err);
    return { success: false, error: err.message };
  }
}

async function getTokenFromPreferences() {
  try {
    const { value } = await Preferences.get({ key: SYNC_KEYS.TOKEN });
    return value;
  } catch {
    return localStorage.getItem(SYNC_KEYS.TOKEN);
  }
}

// ============================================
// Queue Management
// ============================================

/**
 * إضافة عملية للطابور
 * @param {string} tableName - اسم الجدول
 * @param {string} recordId - معرف السجل
 * @param {string} action - INSERT/UPDATE/DELETE
 * @param {object} data - البيانات
 */
export async function queueSyncOperation(tableName, recordId, action, data) {
  try {
    const queue = await getSyncQueue();
    const operationId = `${tableName}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    queue.push({
      id: operationId,
      table_name: tableName,
      record_id: recordId,
      action,
      data: JSON.stringify(data),
      sync_attempts: 0,
      synced: false,
      created_at: new Date().toISOString()
    });

    await saveSyncQueue(queue);

    // Update pending count
    const status = await getSyncStatus();
    await updateSyncStatus({
      pendingCount: queue.filter(op => !op.synced).length
    });

    // Try to sync immediately if online
    if (navigator.onLine) {
      // Run sync in background without waiting
      processSyncQueue().catch(console.error);
    }
  } catch (err) {
    console.error('Error queueing sync operation:', err);
  }
}

/**
 * جلب طابور المزامنة
 */
async function getSyncQueue() {
  try {
    const { value } = await Preferences.get({ key: SYNC_KEYS.SYNC_QUEUE });
    return value ? JSON.parse(value) : [];
  } catch {
    return [];
  }
}

/**
 * حفظ طابور المزامنة
 */
async function saveSyncQueue(queue) {
  try {
    await Preferences.set({
      key: SYNC_KEYS.SYNC_QUEUE,
      value: JSON.stringify(queue)
    });
  } catch (err) {
    console.error('Error saving sync queue:', err);
  }
}

// ============================================
// Main Sync Functions
// ============================================

/**
 * معالجة طابور المزامنة
 * يتم استدعاؤها تلقائياً عند عودة الاتصال
 */
export async function processSyncQueue() {
  const status = await getSyncStatus();

  if (!navigator.onLine || status.isSyncing) {
    return { processed: 0, failed: 0, pending: status.pendingCount };
  }

  await updateSyncStatus({ isSyncing: true });

  const queue = await getSyncQueue();
  const pending = queue.filter(op => !op.synced);

  if (pending.length === 0) {
    await updateSyncStatus({ isSyncing: false, pendingCount: 0 });
    return { processed: 0, failed: 0, pending: 0 };
  }

  let processed = 0;
  let failed = 0;
  const stillPending = [];

  for (const operation of pending) {
    try {
      const result = await syncOperation(operation);

      if (result.success) {
        operation.synced = true;
        operation.synced_at = new Date().toISOString();
        processed++;
      } else {
        operation.sync_attempts = (operation.sync_attempts || 0) + 1;
        operation.error_message = result.error;

        // Max 5 attempts
        if (operation.sync_attempts >= 5) {
          failed++;
        } else {
          stillPending.push(operation);
        }
      }
    } catch (err) {
      console.error('Sync operation error:', err);
      operation.sync_attempts = (operation.sync_attempts || 0) + 1;
      stillPending.push(operation);
    }
  }

  // Update queue (keep synced and pending)
  const newQueue = queue.filter(op => op.synced).concat(stillPending);
  await saveSyncQueue(newQueue);

  const now = new Date().toISOString();
  await updateSyncStatus({
    isSyncing: false,
    lastSync: now,
    pendingCount: stillPending.length,
    failedCount: (status.failedCount || 0) + failed,
    lastSyncResult: {
      processed,
      failed,
      timestamp: now
    }
  });

  return {
    processed,
    failed,
    pending: stillPending.length
  };
}

/**
 * تنفيذ عملية مزامنة واحدة
 */
async function syncOperation(operation) {
  const { table_name, record_id, action, data } = operation;
  const parsedData = JSON.parse(data || '{}');

  // Determine endpoint based on table
  let endpoint = getTableEndpoint(table_name);

  // Add ID for UPDATE and DELETE
  if (action !== 'INSERT' && record_id) {
    endpoint = addId(endpoint, record_id);
  }

  // Determine method
  let method = 'POST';
  if (action === 'UPDATE') method = 'PUT';
  if (action === 'DELETE') method = 'DELETE';

  // Add cloud_id for linking
  if (parsedData.id && !parsedData.cloud_id) {
    parsedData.cloud_id = parsedData.id;
  }

  const result = await httpRequest(endpoint, method, parsedData);

  return result;
}

/**
 * جلب نقطة نهاية الجدول
 */
function getTableEndpoint(tableName) {
  const tableMap = {
    products: '?table=products',
    customers: '?table=customers',
    suppliers: '?table=suppliers',
    invoices: '?table=invoices',
    invoice_items: '?table=invoice-items',
    purchase_orders: '?table=purchases',
    purchase_order_items: '?table=purchase-order-items',
    expenses: '?table=expenses',
    expense_categories: '?table=expense-categories',
    shifts: '?table=shifts',
    stock_movements: '?table=stock-movements',
    loyalty_transactions: '?table=loyalty-transactions',
    whatsapp_queue: '?table=whatsapp',
    admin_requests: '?table=admin-requests'
  };

  return `/data${tableMap[tableName] || `?table=${tableName}`}`;
}

// ============================================
// Pull from Cloud (Download)
// ============================================

/**
 * سحب البيانات من السحاب
 * @param {string} tableName - اسم الجدول
 * @param {string} lastSync - وقت آخر مزامنة
 */
export async function pullFromCloud(tableName, db, lastSync = null) {
  if (!navigator.onLine) {
    return { pulled: 0, error: 'Offline' };
  }

  try {
    let endpoint = getTableEndpoint(tableName);
    if (lastSync) {
      endpoint += `&since=${encodeURIComponent(lastSync)}`;
    }

    const result = await httpRequest(endpoint, 'GET');

    if (!result.success) {
      return { pulled: 0, error: result.error };
    }

    const records = Array.isArray(result.data) ? result.data : [];

    // Insert or update local records
    for (const record of records) {
      await upsertLocalRecord(db, tableName, record);
    }

    return { pulled: records.length };
  } catch (err) {
    console.error('Pull error:', err);
    return { pulled: 0, error: err.message };
  }
}

/**
 * تحديث أو إدراج سجل محلي
 */
async function upsertLocalRecord(db, tableName, record) {
  if (!db || !record) return;

  try {
    // Check if record exists
    const existing = await db.query(
      `SELECT id FROM ${tableName} WHERE cloud_id = ? OR id = ?`,
      [record.id, record.id]
    );

    const recordData = {
      ...record,
      cloud_id: record.id,
      sync_status: 'synced'
    };

    if (existing.length > 0) {
      // Update
      const fields = Object.keys(recordData)
        .filter(k => k !== 'id')
        .map(k => `${k} = ?`)
        .join(', ');

      const values = Object.values(recordData)
        .filter((_, i) => Object.keys(recordData)[i] !== 'id');

      values.push(record.id);
      await db.execute(`UPDATE ${tableName} SET ${fields}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, values);
    } else {
      // Insert
      const keys = Object.keys(recordData).join(', ');
      const placeholders = Object.keys(recordData).map(() => '?').join(', ');

      await db.execute(
        `INSERT OR REPLACE INTO ${tableName} (${keys}) VALUES (${placeholders})`,
        Object.values(recordData)
      );
    }
  } catch (err) {
    console.error('Upsert local record error:', err);
  }
}

// ============================================
// Full Sync (Bi-directional)
// ============================================

/**
 * مزامنة كاملة (سحب + دفع)
 */
export async function fullSync(db) {
  if (!navigator.onLine) {
    return { success: false, error: 'Offline' };
  }

  await updateSyncStatus({ isSyncing: true });

  try {
    // 1. Process pending uploads first
    const uploadResult = await processSyncQueue();

    // 2. Pull updates from cloud for each table
    const lastSync = await getLastSyncTimestamp();
    const pullResults = {};

    for (const tableName of SYNC_TABLES) {
      const result = await pullFromCloud(tableName, db, lastSync);
      pullResults[tableName] = result.pulled;
    }

    // 3. Update sync timestamp
    const now = new Date().toISOString();
    await setLastSyncTimestamp(now);

    await updateSyncStatus({
      isSyncing: false,
      lastSync: now,
      pendingCount: uploadResult.pending,
      lastFullSync: {
        timestamp: now,
        uploaded: uploadResult.processed,
        downloaded: pullResults
      }
    });

    return {
      success: true,
      uploaded: uploadResult.processed,
      downloaded: pullResults,
      pending: uploadResult.pending
    };
  } catch (err) {
    console.error('Full sync error:', err);
    await updateSyncStatus({ isSyncing: false, lastError: err.message });
    return { success: false, error: err.message };
  }
}

// ============================================
// Helpers
// ============================================

async function getLastSyncTimestamp() {
  try {
    const { value } = await Preferences.get({ key: SYNC_KEYS.LAST_SYNC });
    return value;
  } catch {
    return null;
  }
}

async function setLastSyncTimestamp(timestamp) {
  try {
    await Preferences.set({ key: SYNC_KEYS.LAST_SYNC, value: timestamp });
  } catch {}
}

/**
 * جدولة المزامنة التلقائية
 * @param {number} intervalMs - الفاصل الزمني بالمللي ثانية
 */
export function startAutoSync(db, intervalMs = 60000) {
  // Listen for online event
  const handleOnline = () => {
    console.log('Network back online - triggering sync');
    fullSync(db).catch(console.error);
  };

  const handleOffline = () => {
    console.log('Network offline');
    updateSyncStatus({ isOnline: false });
  };

  window.addEventListener('online', handleOnline);
  window.addEventListener('offline', handleOffline);

  // Start interval
  const intervalId = setInterval(() => {
    if (navigator.onLine) {
      processSyncQueue().catch(console.error);
    }
  }, intervalMs);

  // Run initial sync
  if (navigator.onLine) {
    fullSync(db).catch(console.error);
  }

  // Return cleanup function
  return () => {
    window.removeEventListener('online', handleOnline);
    window.removeEventListener('offline', handleOffline);
    clearInterval(intervalId);
  };
}

// ============================================
// Manual Sync Actions
// ============================================

/**
 * إعادة مزامنة سجل معين
 */
export async function resyncRecord(tableName, recordId) {
  return queueSyncOperation(tableName, recordId, 'UPDATE', { id: recordId });
}

/**
 * مسح طابور المزامنة
 */
export async function clearSyncQueue() {
  await saveSyncQueue([]);
  await updateSyncStatus({ pendingCount: 0 });
}

/**
 * جلب عدد العمليات المعلقة
 */
export async function getPendingCount() {
  const queue = await getSyncQueue();
  return queue.filter(op => !op.synced).length;
}

export default {
  getSyncStatus,
  processSyncQueue,
  fullSync,
  pullFromCloud,
  queueSyncOperation,
  startAutoSync,
  getPendingCount,
  clearSyncQueue,
  resyncRecord,
  SYNC_STATUS
};
