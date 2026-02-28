import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuth as useClerkAuth } from '@clerk/clerk-react'
import { AuthProvider } from '@/hooks/useAuth'
import AppLayout from '@/components/layout/AppLayout'
import LandingPage from '@/pages/LandingPage'
import DashboardPage from '@/pages/DashboardPage'
import InvoicesPage from '@/pages/InvoicesPage'
import VendorsPage from '@/pages/VendorsPage'
import GraphPage from '@/pages/GraphPage'
import PatternsPage from '@/pages/PatternsPage'
import UploadPage from '@/pages/UploadPage'
import { ChatPage } from '@/pages/ChatPage'
import WhatsAppPage from '@/pages/WhatsAppPage'
import ProfilePage from '@/pages/ProfilePage'

/**
 * Protects routes using Clerk's auth state.
 * Shows a blank screen while Clerk loads (prevents flash of redirect).
 */
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isSignedIn, isLoaded } = useClerkAuth()
  if (!isLoaded) return <div className="min-h-screen bg-bg" />
  return isSignedIn ? <>{children}</> : <Navigate to="/" replace />
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route
        element={
          <ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>
        }
      >
        <Route path="/profile"   element={<ProfilePage />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/invoices"  element={<InvoicesPage />} />
        <Route path="/vendors"   element={<VendorsPage />} />
        <Route path="/graph"     element={<GraphPage />} />
        <Route path="/patterns"  element={<PatternsPage />} />
        <Route path="/upload"    element={<UploadPage />} />
        <Route path="/chat"      element={<ChatPage />} />
        <Route path="/whatsapp" element={<WhatsAppPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      {/* AuthProvider registers the Clerk token getter with the Axios instance */}
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  )
}
