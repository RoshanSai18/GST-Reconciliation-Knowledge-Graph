/**
 * useAuth.tsx — Clerk-backed authentication hook.
 *
 * Wraps @clerk/clerk-react to expose a consistent `useAuth()` interface
 * used throughout the app, and wires the Clerk session token into the
 * Axios API instance (via setTokenProvider in api.ts).
 */
import { useAuth as useClerkAuth, useUser } from '@clerk/clerk-react'
import { useEffect, type ReactNode } from 'react'
import { setTokenProvider, sessionApi } from '@/lib/api'

/**
 * Drop-in AuthProvider kept for backward compatibility.
 * ClerkProvider (in main.tsx) is the real auth boundary — this just
 * registers the Clerk token getter with the API layer once.
 */
function ClerkTokenSync() {
  const { getToken } = useClerkAuth()

  useEffect(() => {
    setTokenProvider(() => getToken())
  }, [getToken])

  return null
}

export function AuthProvider({ children }: { children: ReactNode }) {
  return (
    <>
      <ClerkTokenSync />
      {children}
    </>
  )
}

interface AuthCtx {
  isAuthenticated: boolean
  isLoaded: boolean
  username: string
  logout: () => void
}

export function useAuth(): AuthCtx {
  const { isSignedIn, isLoaded, signOut } = useClerkAuth()
  const { user } = useUser()

  const username =
    user?.username ??
    (user?.firstName ? `${user.firstName} ${user.lastName ?? ''}`.trim() : null) ??
    user?.primaryEmailAddress?.emailAddress ??
    'User'

  return {
    isAuthenticated: !!isSignedIn,
    isLoaded,
    username,
    logout: async () => {
      try {
        // Delete all user data from Neo4j before signing out
        await sessionApi.deleteSession()
      } catch {
        // Fire-and-forget: always sign out even if delete fails
      }
      signOut()
    },
  }
}
