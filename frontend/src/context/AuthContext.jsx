import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { authAPI, setToken, removeToken } from '../services/api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user,    setUser]    = useState(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState('')

  useEffect(() => {
    const t = localStorage.getItem('td3_token')
    if (!t) { setLoading(false); return }
    authAPI.me()
      .then(d => { if (d?.user) setUser(d.user) })
      .catch(() => removeToken())
      .finally(() => setLoading(false))
  }, [])

  async function login(email, password) {
    try {
      setError('')
      const d = await authAPI.login(email, password)
      setToken(d.token)
      setUser(d.user)
      return true
    } catch(e) { setError(e.message); return false }
  }

  function logout() { removeToken(); setUser(null) }

  const refreshWallet = useCallback(async () => {
    try {
      const d = await authAPI.me()
      if (d?.user) setUser(d.user)
    } catch {}
  }, [])

  function updateWallet(wallet) {
    setUser(prev => prev ? { ...prev, wallet } : prev)
  }

  return (
    <AuthContext.Provider value={{ user, loading, error, setError, login, logout, refreshWallet, updateWallet }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)

/* ─────────────────────────────────────────────────────────────
   Permission helpers — read user.pages (set on login from
   role_pages) and answer "can this user do <action> on
   <pageId>?". Backend enforces the same rule via
   requirePermission middleware; the UI helper just lets us
   hide/disable buttons we know will 403 anyway.

   Default to FALSE on missing data so a partial response from
   an older backend can't accidentally grant access.
   ───────────────────────────────────────────────────────────── */
export function hasPermission(user, pageId, action) {
  if (!user || !Array.isArray(user.pages)) return false
  const p = user.pages.find(x => x.id === pageId)
  if (!p) return false
  switch (action) {
    case 'view':   return p.can_view !== false   // default true if field absent (backwards-compat)
    case 'create': return p.can_create === true
    case 'edit':   return p.can_edit   === true
    case 'delete': return p.can_delete === true
    default:       return false
  }
}

export function usePermission(pageId, action) {
  const { user } = useAuth()
  return hasPermission(user, pageId, action)
}
