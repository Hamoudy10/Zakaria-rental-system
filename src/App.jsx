import React from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import Login from './components/Login'
import Layout from './components/Layout'
import AdminDashboard from './pages/AdminDashboard'
import AgentDashboard from './pages/AgentDashboard'
import TenantDashboard from './pages/TenantDashboard'
import { PropertyProvider } from './context/PropertyContext' // Add this import
import { AllocationProvider } from './context/TenantAllocationContext'
import { PaymentProvider } from './context/PaymentContext' // Add this import



// Protected Route component
const ProtectedRoute = ({ children, allowedRoles }) => {
  const { user } = useAuth()
  
  if (!user) {
    return <Navigate to="/login" replace />
  }
  
  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate to="/unauthorized" replace />
  }
  
  return <Layout>{children}</Layout>
}

function AppRoutes() {
  const { user } = useAuth()

  return (
    <Routes>
      <Route 
        path="/login" 
        element={user ? <Navigate to={`/${user.role}`} replace /> : <Login />} 
      />
      <Route 
        path="/admin/*" 
        element={
          <ProtectedRoute allowedRoles={['admin']}>
            <AdminDashboard />
          </ProtectedRoute>
        } 
      />
      <Route 
        path="/agent/*" 
        element={
          <ProtectedRoute allowedRoles={['agent']}>
            <AgentDashboard />
          </ProtectedRoute>
        } 
      />
      <Route 
        path="/tenant/*" 
        element={
          <ProtectedRoute allowedRoles={['tenant']}>
            <TenantDashboard />
          </ProtectedRoute>
        } 
      />
      <Route 
        path="/" 
        element={<Navigate to={user ? `/${user.role}` : '/login'} replace />} 
      />
      <Route 
        path="/unauthorized" 
        element={
          <div className="min-h-screen flex items-center justify-center bg-gray-50">
            <div className="text-center">
              <h1 className="text-4xl font-bold text-red-600 mb-4">Unauthorized</h1>
              <p className="text-gray-600">You don't have permission to access this page.</p>
            </div>
          </div>
        } 
      />
    </Routes>

    
  )
}

function App() {
  return (
    <Router
      future={{
        v7_startTransition: true,
        v7_relativeSplatPath: true,
      }}
    >
      <AuthProvider>
         <PropertyProvider> {/* Wrap with PropertyProvider */}
          <AllocationProvider> {/* Add AllocationProvider */}
             <PaymentProvider> {/* Add PaymentProvider */}
              <AppRoutes />
            </PaymentProvider>
          </AllocationProvider>
        </PropertyProvider>
      </AuthProvider>
    </Router>
  )
}

export default App