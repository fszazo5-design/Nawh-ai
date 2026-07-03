import { createContext, useContext, useState, useEffect } from 'react'
import { auth } from '../services/neonService.js'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [isAuthenticated, setIsAuthenticated] = useState(false)

  useEffect(() => {
    // Check initial auth state
    checkAuth()

    // Listen for online/offline events
    const handleOnline = () => {
      // Process offline queue when back online
      import('../services/neonService.js').then(mod => {
        mod.processOfflineQueue()
      })
    }

    window.addEventListener('online', handleOnline)

    return () => {
      window.removeEventListener('online', handleOnline)
    }
  }, [])

  async function checkAuth() {
    try {
      // First check local storage for quick response
      const localUser = auth.getUser()
      if (localUser && auth.getToken()) {
        setUser(localUser)
        setIsAuthenticated(true)
      }

      // Then verify with server
      const result = await auth.getCurrentUser()
      if (result.success) {
        setUser(result.data)
        setIsAuthenticated(true)
      } else {
        // Token invalid - clear everything
        setUser(null)
        setIsAuthenticated(false)
        localStorage.removeItem('nawh_user')
        localStorage.removeItem('nawh_token')
      }
    } catch {
      // Use cached user if available
      const localUser = auth.getUser()
      if (localUser) {
        setUser(localUser)
        setIsAuthenticated(true)
      } else {
        setUser(null)
        setIsAuthenticated(false)
      }
    } finally {
      setLoading(false)
    }
  }

  async function login(credentials) {
    const result = await auth.login(credentials)
    if (result.success) {
      setUser(result.data.user)
      setIsAuthenticated(true)
    }
    return result
  }

  async function register(credentials) {
    const result = await auth.register(credentials)
    if (result.success) {
      setUser(result.data.user)
      setIsAuthenticated(true)
    }
    return result
  }

  async function logout() {
    const result = await auth.logout()
    setUser(null)
    setIsAuthenticated(false)
    return result
  }

  function hasRole(requiredRole) {
    if (!user) return false
    const roleHierarchy = { admin: 3, manager: 2, user: 1 }
    const userLevel = roleHierarchy[user.role] || 0
    const requiredLevel = roleHierarchy[requiredRole] || 0
    return userLevel >= requiredLevel
  }

  function isAdmin() {
    return user?.role === 'admin'
  }

  function isManager() {
    return user?.role === 'manager' || user?.role === 'admin'
  }

  const value = {
    user,
    loading,
    isAuthenticated,
    login,
    register,
    logout,
    hasRole,
    isAdmin,
    isManager,
    refreshAuth: checkAuth
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

export default AuthContext
