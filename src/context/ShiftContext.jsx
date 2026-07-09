/**
 * Shift Context - Safe Version
 * =-=-=-=-=-=-=-=-=-=-=-=-=-=-=
 * سياق إدارة الورديات مع حماية كاملة
 */

import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { useDatabase } from './DatabaseContext.jsx'
import { useAuth } from './AuthContext.jsx'

// Storage key
const SHIFT_KEY = 'nawh_current_shift'

// Context
const ShiftContext = createContext(null)

// Safe storage helper (same as DatabaseContext)
const safeStorage = {
  async get(key) {
    try {
      if (typeof window !== 'undefined' && window.Capacitor?.Plugins?.Preferences) {
        const { Preferences } = await import('@capacitor/preferences')
        const { value } = await Preferences.get({ key })
        return value ? JSON.parse(value) : null
      }
    } catch {}
    try {
      const local = localStorage.getItem(key)
      return local ? JSON.parse(local) : null
    } catch {
      return null
    }
  },

  async set(key, value) {
    try {
      if (typeof window !== 'undefined' && window.Capacitor?.Plugins?.Preferences) {
        const { Preferences } = await import('@capacitor/preferences')
        await Preferences.set({ key, value: JSON.stringify(value) })
        return true
      }
    } catch {}
    try {
      localStorage.setItem(key, JSON.stringify(value))
      return true
    } catch {
      return false
    }
  },

  async remove(key) {
    try {
      if (typeof window !== 'undefined' && window.Capacitor?.Plugins?.Preferences) {
        const { Preferences } = await import('@capacitor/preferences')
        await Preferences.remove({ key })
        return true
      }
    } catch {}
    try {
      localStorage.removeItem(key)
      return true
    } catch {
      return false
    }
  }
}

/**
 * Shift Provider Component
 */
export function ShiftProvider({ children }) {
  const [currentShift, setCurrentShift] = useState(null)
  const [loading, setLoading] = useState(true)
  const [isShiftOpen, setIsShiftOpen] = useState(false)

  const { shifts } = useDatabase()
  const { user } = useAuth()

  // Load shift from storage on mount
  useEffect(() => {
    loadShift()
  }, [])

  /**
   * Load shift from storage safely
   */
  const loadShift = async () => {
    try {
      const stored = await safeStorage.get(SHIFT_KEY)
      if (stored && stored.id) {
        setCurrentShift(stored)
        setIsShiftOpen(true)
      }
    } catch (err) {
      console.warn('Error loading shift:', err)
    } finally {
      setLoading(false)
    }
  }

  /**
   * Open new shift
   * @param {number} startingCash - المبلغ الافتتاحي
   */
  const openShift = useCallback(async (startingCash = 0) => {
    if (!user || !user.id) {
      throw new Error('يجب تسجيل الدخول أولاً')
    }

    if (isShiftOpen) {
      throw new Error('الوردية الحالية مفتوحة بالفعل')
    }

    try {
      const shiftData = await shifts.open(
        user.id,
        user.full_name || user.email || 'مستخدم',
        startingCash
      )

      if (shiftData) {
        setCurrentShift(shiftData)
        setIsShiftOpen(true)
      }

      return shiftData
    } catch (err) {
      console.error('Error opening shift:', err)
      throw err
    }
  }, [user, isShiftOpen, shifts])

  /**
   * Close current shift
   * @param {number} endingCash - المبلغ النهائي
   * @param {string} notes - ملاحظات
   */
  const closeShift = useCallback(async (endingCash, notes = '') => {
    if (!currentShift || !currentShift.id) {
      throw new Error('لا توجد وردية مفتوحة')
    }

    try {
      // Calculate shift stats
      const stats = await calculateShiftStats()

      // Close shift in database
      const closedShift = await shifts.close(currentShift.id, {
        endingCash: endingCash || 0,
        totalSales: stats?.totalSales || 0,
        totalRefunds: stats?.totalRefunds || 0,
        totalExpenses: stats?.totalExpenses || 0,
        cashSales: stats?.cashSales || 0,
        cardSales: stats?.cardSales || 0,
        creditSales: stats?.creditSales || 0,
        invoiceCount: stats?.invoiceCount || 0,
        notes: notes || ''
      })

      // Clear from storage
      await safeStorage.remove(SHIFT_KEY)

      setCurrentShift(null)
      setIsShiftOpen(false)

      return closedShift
    } catch (err) {
      console.error('Error closing shift:', err)
      // Still clear locally even if sync fails
      await safeStorage.remove(SHIFT_KEY)
      setCurrentShift(null)
      setIsShiftOpen(false)
      throw err
    }
  }, [currentShift, shifts])

  /**
   * Calculate current shift stats safely
   */
  const calculateShiftStats = useCallback(async () => {
    if (!currentShift || !currentShift.id) {
      return {
        totalSales: 0,
        totalRefunds: 0,
        totalExpenses: 0,
        cashSales: 0,
        cardSales: 0,
        creditSales: 0,
        invoiceCount: 0
      }
    }

    try {
      const db = useDatabase()
      const invoices = await db.invoices.getAll({ shift_id: currentShift.id })

      let totalSales = 0
      let totalRefunds = 0
      let cashSales = 0
      let cardSales = 0
      let creditSales = 0
      let invoiceCount = 0

      for (const inv of invoices || []) {
        if (inv.status === 'cancelled') {
          totalRefunds += inv.total_amount || 0
        } else {
          totalSales += inv.total_amount || 0
          invoiceCount++

          if (inv.payment_method === 'cash') {
            cashSales += inv.total_amount || 0
          } else if (inv.payment_method === 'card') {
            cardSales += inv.total_amount || 0
          } else if (inv.payment_method === 'credit') {
            creditSales += inv.total_amount || 0
          }
        }
      }

      // Get expenses for this shift
      const expResult = await db.query(
        "SELECT COALESCE(SUM(amount), 0) as total FROM expenses WHERE shift_id = ?",
        [currentShift.id]
      )
      const totalExpenses = expResult?.[0]?.total || 0

      return {
        totalSales,
        totalRefunds,
        totalExpenses,
        cashSales,
        cardSales,
        creditSales,
        invoiceCount
      }
    } catch (err) {
      console.error('Error calculating stats:', err)
      return {
        totalSales: currentShift?.total_sales || 0,
        totalRefunds: 0,
        totalExpenses: 0,
        cashSales: currentShift?.cash_sales || 0,
        cardSales: currentShift?.card_sales || 0,
        creditSales: currentShift?.credit_sales || 0,
        invoiceCount: currentShift?.invoice_count || 0
      }
    }
  }, [currentShift])

  /**
   * Get shift summary for display
   */
  const getShiftSummary = useCallback(async () => {
    if (!currentShift) {
      return null
    }

    try {
      const stats = await calculateShiftStats()

      return {
        ...currentShift,
        ...stats,
        expectedCash: (currentShift.starting_cash || 0) + (stats?.cashSales || 0) - (stats?.totalExpenses || 0),
        variance: (endingCash) => endingCash - ((currentShift.starting_cash || 0) + (stats?.cashSales || 0) - (stats?.totalExpenses || 0))
      }
    } catch {
      return currentShift
    }
  }, [currentShift, calculateShiftStats])

  /**
   * Check if shift belongs to current user
   */
  const isUserShift = useCallback(() => {
    if (!currentShift || !user) return false
    return currentShift.user_id === user.id
  }, [currentShift, user])

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
  }

  return (
    <ShiftContext.Provider value={value}>
      {children}
    </ShiftContext.Provider>
  )
}

/**
 * Hook to use shift context
 */
export function useShift() {
  const context = useContext(ShiftContext)
  if (!context) {
    throw new Error('useShift must be used within ShiftProvider')
  }
  return context
}

export default ShiftContext
