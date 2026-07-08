/**
 * Shift Context
 * =-=-=-=-=-=-=-=
 * سياق إدارة الورديات
 * يحفظ بيانات الوردية الحالية في Preferences
 */

import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { Preferences } from '@capacitor/preferences';
import { useDatabase } from './DatabaseContext.jsx';
import { useAuth } from './AuthContext.jsx';

// Storage key
const SHIFT_KEY = 'nawh_current_shift';

// Context
const ShiftContext = createContext(null);

/**
 * Shift Provider Component
 */
export function ShiftProvider({ children }) {
  const [currentShift, setCurrentShift] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isShiftOpen, setIsShiftOpen] = useState(false);

  const { db } = useDatabase();
  const { user } = useAuth();

  // Load shift from storage on mount
  useEffect(() => {
    loadShift();
  }, []);

  /**
   * Load shift from Preferences
   */
  const loadShift = async () => {
    try {
      const stored = await getFromStorage(SHIFT_KEY);
      if (stored) {
        setCurrentShift(stored);
        setIsShiftOpen(true);
      }
    } catch (err) {
      console.error('Error loading shift:', err);
    } finally {
      setLoading(false);
    }
  };

  /**
   * Open new shift
   * @param {number} startingCash - المبلغ الافتتاحي للوردية
   */
  const openShift = useCallback(async (startingCash = 0) => {
    if (!user) {
      throw new Error('يجب تسجيل الدخول أولاً');
    }

    if (isShiftOpen) {
      throw new Error('الوردية الحالية مفتوحة بالفعل');
    }

    try {
      // Create shift record in database
      const shiftData = await db.shifts.open(user.id, user.full_name || user.email, startingCash);

      setCurrentShift(shiftData);
      setIsShiftOpen(true);

      return shiftData;
    } catch (err) {
      console.error('Error opening shift:', err);
      throw err;
    }
  }, [user, isShiftOpen, db]);

  /**
   * Close current shift
   * @param {number} endingCash - المبلغ النهائي الفعلي
   * @param {string} notes - ملاحظات
   */
  const closeShift = useCallback(async (endingCash, notes = '') => {
    if (!currentShift) {
      throw new Error('لا توجد وردية مفتوحة');
    }

    try {
      // Calculate shift stats
      const stats = await calculateShiftStats();

      // Close shift in database
      const closedShift = await db.shifts.close(currentShift.id, {
        endingCash,
        totalSales: stats.totalSales,
        totalRefunds: stats.totalRefunds,
        totalExpenses: stats.totalExpenses,
        cashSales: stats.cashSales,
        cardSales: stats.cardSales,
        creditSales: stats.creditSales,
        invoiceCount: stats.invoiceCount,
        notes
      });

      // Clear from storage
      await removeFromStorage(SHIFT_KEY);

      setCurrentShift(null);
      setIsShiftOpen(false);

      return closedShift;
    } catch (err) {
      console.error('Error closing shift:', err);
      throw err;
    }
  }, [currentShift, db]);

  /**
   * Calculate current shift stats
   */
  const calculateShiftStats = useCallback(async () => {
    if (!currentShift) {
      return {
        totalSales: 0,
        totalRefunds: 0,
        totalExpenses: 0,
        cashSales: 0,
        cardSales: 0,
        creditSales: 0,
        invoiceCount: 0
      };
    }

    try {
      // Get invoices for this shift
      const invoices = await db.invoices.getAll({ shift_id: currentShift.id });

      let totalSales = 0;
      let totalRefunds = 0;
      let cashSales = 0;
      let cardSales = 0;
      let creditSales = 0;
      let invoiceCount = 0;

      for (const inv of invoices) {
        if (inv.status === 'cancelled') {
          totalRefunds += inv.total_amount;
        } else {
          totalSales += inv.total_amount;
          invoiceCount++;

          if (inv.payment_method === 'cash') {
            cashSales += inv.total_amount;
          } else if (inv.payment_method === 'card') {
            cardSales += inv.total_amount;
          } else if (inv.payment_method === 'credit') {
            creditSales += inv.total_amount;
          }
        }
      }

      // Get expenses for this shift
      const expensesResult = await db.query(
        "SELECT COALESCE(SUM(amount), 0) as total FROM expenses WHERE shift_id = ?",
        [currentShift.id]
      );
      const totalExpenses = expensesResult[0]?.total || 0;

      return {
        totalSales,
        totalRefunds,
        totalExpenses,
        cashSales,
        cardSales,
        creditSales,
        invoiceCount
      };
    } catch (err) {
      console.error('Error calculating stats:', err);
      return {
        totalSales: 0,
        totalRefunds: 0,
        totalExpenses: 0,
        cashSales: 0,
        cardSales: 0,
        creditSales: 0,
        invoiceCount: 0
      };
    }
  }, [currentShift, db]);

  /**
   * Get shift summary for display
   */
  const getShiftSummary = useCallback(async () => {
    if (!currentShift) {
      return null;
    }

    const stats = await calculateShiftStats();

    return {
      ...currentShift,
      ...stats,
      expectedCash: (currentShift.starting_cash || 0) + stats.cashSales - stats.totalExpenses,
      variance: endingCash => endingCash - ((currentShift.starting_cash || 0) + stats.cashSales - stats.totalExpenses)
    };
  }, [currentShift, calculateShiftStats]);

  /**
   * Check if shift is active for current user
   */
  const isUserShift = useCallback(() => {
    if (!currentShift || !user) return false;
    return currentShift.user_id === user.id;
  }, [currentShift, user]);

  // Context value
  const value = {
    currentShift,
    isShiftOpen,
    loading,
    openShift,
    closeShift,
    calculateShiftStats,
    getShiftSummary,
    isUserShift
  };

  return (
    <ShiftContext.Provider value={value}>
      {children}
    </ShiftContext.Provider>
  );
}

/**
 * Hook to use shift context
 */
export function useShift() {
  const context = useContext(ShiftContext);
  if (!context) {
    throw new Error('useShift must be used within ShiftProvider');
  }
  return context;
}

// Helper functions
async function getFromStorage(key) {
  try {
    const { value } = await Preferences.get({ key });
    return value ? JSON.parse(value) : null;
  } catch (err) {
    const local = localStorage.getItem(key);
    return local ? JSON.parse(local) : null;
  }
}

async function removeFromStorage(key) {
  try {
    await Preferences.remove({ key });
  } catch (err) {
    localStorage.removeItem(key);
  }
}

export default ShiftContext;
