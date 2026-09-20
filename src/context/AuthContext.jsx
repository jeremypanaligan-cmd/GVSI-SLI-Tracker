import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import LoginScreen from '../components/LoginScreen'
import {
  readSession, saveSession, clearSession, endRemoteSession, isDeveloper,
} from '../utils/auth'

const AuthContext = createContext(null)

/**
 * Holds the signed-in user and renders the login screen until a session exists.
 *
 * Every session carries a server token now, so two things the browser cannot do alone
 * become possible: the Developer roster can see who is signed in, and a session can be
 * revoked (maintenance mode, "force sign-out all") — `forceSignOut` is how the app
 * reacts when a heartbeat reports that its own token is no longer valid.
 *
 * This is still a client-side convenience gate — see the README for what it does and
 * does not protect.
 */
export function AuthProvider({ children }) {
  const [user, setUser] = useState(readSession)
  const [notice, setNotice] = useState('')

  const signIn = useCallback((nextUser, remember) => {
    setNotice('')
    setUser(saveSession(nextUser, remember))
  }, [])

  const signOut = useCallback(() => {
    const token = user?.token
    clearSession()
    setUser(null)
    // Best effort: tell the server so the roster drops this person right away.
    if (token) endRemoteSession(token)
  }, [user])

  const forceSignOut = useCallback((reason) => {
    clearSession()
    setUser(null)
    setNotice(reason || 'Your session was ended. Please sign in again.')
  }, [])

  const value = useMemo(() => ({
    user,
    signIn,
    signOut,
    forceSignOut,
    notice,
    clearNotice: () => setNotice(''),
    isDeveloper: isDeveloper(user),
  }), [user, signIn, signOut, forceSignOut, notice])

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
