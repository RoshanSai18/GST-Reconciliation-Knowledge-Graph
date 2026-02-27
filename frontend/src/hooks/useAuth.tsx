import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'
import { authApi } from '@/lib/api'

// Demo credentials — skips the backend auth call entirely so login works
// even when the backend is not running. The stored value is the backend's
// static JWT_SECRET bypass which the backend also accepts as a valid bearer.
const DEMO_USERNAME = 'admin'
const DEMO_PASSWORD = 'admin@gst123'
const DEMO_TOKEN    = 'gst-recon-super-secret-key-change-in-production'

interface AuthCtx {
  token: string | null
  isAuthenticated: boolean
  login: (username: string, password: string) => Promise<void>
  logout: () => void
}

const Ctx = createContext<AuthCtx | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(
    () => localStorage.getItem('gst_token')
  )

  const login = useCallback(async (username: string, password: string) => {
    // Short-circuit for demo credentials — no network call needed
    if (username === DEMO_USERNAME && password === DEMO_PASSWORD) {
      localStorage.setItem('gst_token', DEMO_TOKEN)
      setToken(DEMO_TOKEN)
      return
    }
    // Fallback: real JWT exchange when backend is fully wired
    const { data } = await authApi.login(username, password)
    localStorage.setItem('gst_token', data.access_token)
    setToken(data.access_token)
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem('gst_token')
    setToken(null)
  }, [])

  return (
    <Ctx.Provider value={{ token, isAuthenticated: !!token, login, logout }}>
      {children}
    </Ctx.Provider>
  )
}

export function useAuth(): AuthCtx {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
