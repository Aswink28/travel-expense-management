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
