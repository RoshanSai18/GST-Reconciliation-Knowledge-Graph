import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from '@/hooks/useAuth'
import AppLayout from '@/components/layout/AppLayout'
import LoginPage from '@/pages/LoginPage'
import DashboardPage from '@/pages/DashboardPage'
import InvoicesPage from '@/pages/InvoicesPage'
import VendorsPage from '@/pages/VendorsPage'
import GraphPage from '@/pages/GraphPage'
import PatternsPage from '@/pages/PatternsPage'
import UploadPage from '@/pages/UploadPage'
import { ChatPage } from '@/pages/ChatPage'

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth()
  return isAuthenticated ? <>{children}</> : <Navigate to="/login" replace />
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        element={
          <ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/invoices"  element={<InvoicesPage />} />
        <Route path="/vendors"   element={<VendorsPage />} />
        <Route path="/graph"     element={<GraphPage />} />
        <Route path="/patterns"  element={<PatternsPage />} />
        <Route path="/upload"    element={<UploadPage />} />
        <Route path="/chat"      element={<ChatPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  )
}
