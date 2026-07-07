/**
 * Authentication Context
 * =-=-=-=-=-=-=-=-=-=-=-=-=
 * سياق المصادقة للتطبيق - يربط الواجهة بخدمة المصادقة
 * جميع الدوال async لتتوافق مع Capacitor Preferences
 */

import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { auth, processOfflineQueue } from '../services/neonService.js';

// إنشاء السياق
const AuthContext = createContext(null);

/**
 * مزود سياق المصادقة
 */
export function AuthProvider({ children }) {
  // حالات السياق
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  // ============================================
  // تهيئة السياق عند التحميل
  // ============================================
  useEffect(() => {
    // التحقق من حالة المصادقة الأولية
    initializeAuth();

    // الاستماع لأحداث الاتصال
    const handleOnline = async () => {
      setIsOnline(true);
      // معالجة الطابور المؤجل عند عودة الاتصال
      try {
        await processOfflineQueue();
        // تحديث بيانات المستخدم بعد المزامنة
        const freshUser = await auth.getCurrentUser();
        if (freshUser.success) {
          setUser(freshUser.data);
        }
      } catch (err) {
        console.error('Error processing offline queue:', err);
      }
    };

    const handleOffline = () => {
      setIsOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // تنظيف المستمعين عند الإلغاء
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  /**
   * تهيئة المصادقة - جلب المستخدم المحلي ثم التحقق من السيرفر
   */
  const initializeAuth = async () => {
    try {
      // 1. جلب المستخدم من التخزين المحلي أولاً (سريع)
      const localUser = await auth.getUser();
      const hasToken = await auth.isAuthenticated();

      if (localUser && hasToken) {
        setUser(localUser);
        setIsAuthenticated(true);
        setLoading(false); // عرض البيانات المحلية فوراً

        // 2. التحقق من السيرفر في الخلفية
        try {
          const result = await auth.getCurrentUser();
          if (result.success) {
            setUser(result.data);
            setIsAuthenticated(true);
          } else {
            // الرمز غير صالح - مسح البيانات
            await handleLogout();
          }
        } catch (err) {
          // خطأ في الاتصال - البقاء على البيانات المحلية
          console.log('Using cached user data due to network error');
        }
      } else {
        // لا يوجد بيانات محلية
        setUser(null);
        setIsAuthenticated(false);
      }
    } catch (err) {
      console.error('Auth initialization error:', err);
      setUser(null);
      setIsAuthenticated(false);
    } finally {
      setLoading(false);
    }
  };

  /**
   * تسجيل الدخول
   * @param {object} credentials - { email, password }
   * @returns {object} نتيجة العملية
   */
  const handleLogin = async (credentials) => {
    try {
      const result = await auth.login(credentials);

      if (result.success && result.data?.user) {
        setUser(result.data.user);
        setIsAuthenticated(true);
      }

      return result;
    } catch (err) {
      console.error('Login error:', err);
      return {
        success: false,
        error: 'SYSTEM_ERROR',
        message: 'حدث خطأ في النظام'
      };
    }
  };

  /**
   * تسجيل مستخدم جديد
   * @param {object} credentials - { email, password, full_name }
   * @returns {object} نتيجة العملية
   */
  const handleRegister = async (credentials) => {
    try {
      const result = await auth.register(credentials);

      if (result.success && result.data?.user) {
        setUser(result.data.user);
        setIsAuthenticated(true);
      }

      return result;
    } catch (err) {
      console.error('Register error:', err);
      return {
        success: false,
        error: 'SYSTEM_ERROR',
        message: 'حدث خطأ في النظام'
      };
    }
  };

  /**
   * تسجيل الخروج
   * @returns {object} نتيجة العملية
   */
  const handleLogout = async () => {
    try {
      const result = await auth.logout();
      setUser(null);
      setIsAuthenticated(false);
      return result;
    } catch (err) {
      console.error('Logout error:', err);
      // مسح البيانات المحلية على أي حال
      setUser(null);
      setIsAuthenticated(false);
      return {
        success: true,
        message: 'تم تسجيل الخروج'
      };
    }
  };

  /**
   * تحديث بيانات المستخدم
   */
  const refreshAuth = async () => {
    await initializeAuth();
  };

  /**
   * التحقق من الصلاحيات
   * @param {string} requiredRole - الصلاحية المطلوبة
   * @returns {boolean}
   */
  const hasRole = useCallback(async (requiredRole) => {
    return auth.hasRole(requiredRole);
  }, []);

  /**
   * هل المستخدم مدير؟
   * @returns {boolean}
   */
  const isAdmin = useCallback(() => {
    return user?.role === 'admin';
  }, [user]);

  /**
   * هل المستخدم مدير أو أعلى؟
   * @returns {boolean}
   */
  const isManager = useCallback(() => {
    return user?.role === 'manager' || user?.role === 'admin';
  }, [user]);

  /**
   * جلب المستخدم الحالي (من التخزين المحلي)
   * @returns {object|null}
   */
  const getCurrentUser = useCallback(async () => {
    return auth.getUser();
  }, []);

  // القيم المصدرة
  const value = {
    // الحالات
    user,
    loading,
    isAuthenticated,
    isOnline,

    // دوال المصادقة
    login: handleLogin,
    register: handleRegister,
    logout: handleLogout,
    refreshAuth,

    // دوال الصلاحيات
    hasRole,
    isAdmin,
    isManager,

    // دوال مساعدة
    getCurrentUser,

    // حالة الاتصال
    processOfflineQueue
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

/**
 * Hook لاستخدام سياق المصادقة
 * @returns {object} سياق المصادقة
 */
export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }

  return context;
}

// تصدير السياق للاستخدام المباشر إذا لزم
export default AuthContext;
