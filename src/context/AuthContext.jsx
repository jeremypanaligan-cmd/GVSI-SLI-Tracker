import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import LoginScreen from '../components/LoginScreen'
import { readSession, saveSession, clearSession } from '../utils/auth'

const AuthContext = createContext(null)

/**
 * Holds the signed-in user and renders the login screen until a session exists.
 *
 * This is a client-side convenience gate — see the README for what it does and
 * does not protect.
 */
export function AuthProvider({ children }) {
  const [user, setUser] = useState(readSession)

  const signIn = useCallback((nextUser, remember) => {
    setUser(saveSession(nextUser, remember))
  }, [])

  const signOut = useCallback(() => {
    clearSession()
    setUser(null)
  }, [])

  const value = useMemo(() => ({ user, signIn, signOut }), [user, signIn, signOut])

  return (
    <AuthContext.Provider value={value}>
      {user ? children : <LoginScreen />}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
