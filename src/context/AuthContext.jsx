/**
 * Authentication Context
 * =-=-=-=-=-=-=-=-=-=-=-=-=
 * سياق المصادقة للتطبيق - يربط الواجهة بخدمة المصادقة
 * جميع الدوال async لتتوافق مع Capacitor Preferences
 */

import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { auth, processOfflineQueue } from '../services/neonService.js';

// استيراد مكتبة كابتشور لضمان التخزين الدائم على بيئة الأندرويد
import { Preferences } from '@capacitor/preferences';

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
          // تحديث الكاش على الأندرويد بالبيانات الجديدة
          if (freshUser.data) {
            await Preferences.set({ key: 'userData', value: JSON.stringify(freshUser.data) });
          }
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
      // 1. جلب المستخدم والتوكن من التخزين الدائم للأندرويد
      const { value: token } = await Preferences.get({ key: 'token' });
      const { value: cachedUserStr } = await Preferences.get({ key: 'userData' });
      const localUser = cachedUserStr ? JSON.parse(cachedUserStr) : await auth.getUser();
      const hasToken = token ? true : await auth.isAuthenticated();

      if (localUser && hasToken) {
        setUser(localUser);
        setIsAuthenticated(true);
        setLoading(false); // عرض البيانات المحلية فوراً للمستخدم لمنع التأخير

        // 2. التحقق من السيرفر في الخلفية لتحديث البيانات أو التحقق من الصلاحية
        try {
          const result = await auth.getCurrentUser();
          if (result.success) {
            setUser(result.data);
            setIsAuthenticated(true);
            // تحديث البيانات المخزنة محلياً بآخر تحديث من السيرفر
            await Preferences.set({ key: 'userData', value: JSON.stringify(result.data) });
            
            // تحديث السكيما والتوكن إذا أرجعهما السيرفر مجدداً لضمان التطابق
            if (result.token) await Preferences.set({ key: 'token', value: result.token });
            if (result.schemaName) await Preferences.set({ key: 'schemaName', value: result.schemaName });
          } else {
            // الرمز غير صالح أو منتهي - مسح البيانات لتجنب تعليق التطبيق
            await handleLogout();
          }
        } catch (err) {
          // خطأ في الاتصال بالشبكة - البقاء على البيانات المحلية المخزنة بكابتشور
          console.log('Using cached Android user data due to network error');
        }
      } else {
        // لا توجد بيانات مسجلة مسبقاً
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

      if (result.success && result.data) {
        const userData = result.data.user || result.data;
        setUser(userData);
        setIsAuthenticated(true);

        // === حفظ كافة البيانات المستلمة داخل أندرويد بشكل دائم ومؤمن ===
        if (result.data.token || result.token) {
          await Preferences.set({ key: 'token', value: result.data.token || result.token });
        }
        if (result.data.schemaName || result.schemaName) {
          await Preferences.set({ key: 'schemaName', value: result.data.schemaName || result.schemaName });
        }
        await Preferences.set({ key: 'userData', value: JSON.stringify(userData) });
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

      if (result.success && result.data) {
        const userData = result.data.user || result.data;
        setUser(userData);
        setIsAuthenticated(true);

        // === حفظ كافة البيانات للمستخدم الجديد داخل أندرويد دائمًا ===
        if (result.data.token || result.token) {
          await Preferences.set({ key: 'token', value: result.data.token || result.token });
        }
        if (result.data.schemaName || result.schemaName) {
          await Preferences.set({ key: 'schemaName', value: result.data.schemaName || result.schemaName });
        }
        await Preferences.set({ key: 'userData', value: JSON.stringify(userData) });
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
      
      // مسح كافة قيم كابتشور المخزنة بالأندرويد تماماً
      await Preferences.remove({ key: 'token' });
      await Preferences.remove({ key: 'schemaName' });
      await Preferences.remove({ key: 'userData' });

      setUser(null);
      setIsAuthenticated(false);
      return result;
    } catch (err) {
      console.error('Logout error:', err);
      // مسح البيانات المحلية على أي حال لضمان عدم تعليق الواجهات
      await Preferences.remove({ key: 'token' });
      await Preferences.remove({ key: 'schemaName' });
      await Preferences.remove({ key: 'userData' });
      
      setUser(null);
      setIsAuthenticated(false);
      return {
        success: true,
        message: 'تم تسجيل الخروج محلياً'
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
   * جلب المستخدم الحالي (من التخزين المحلي للأندرويد)
   * @returns {object|null}
   */
  const getCurrentUser = useCallback(async () => {
    const { value: cachedUserStr } = await Preferences.get({ key: 'userData' });
    if (cachedUserStr) {
      return JSON.parse(cachedUserStr);
    }
    return auth.getUser();
  }, []);

  // القيم المصدرة للـ Components والـ Hooks الأخرى
  const value = {
    user,
    loading,
    isAuthenticated,
    isOnline,

    login: handleLogin,
    register: handleRegister,
    logout: handleLogout,
    refreshAuth,

    hasRole,
    isAdmin,
    isManager,

    getCurrentUser,
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

export default AuthContext;
