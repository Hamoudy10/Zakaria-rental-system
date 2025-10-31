import React, { useState, Suspense, lazy } from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate, Link, useNavigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { PropertyProvider } from './context/PropertyContext'
import { AllocationProvider } from './context/TenantAllocationContext'
import { PaymentProvider } from './context/PaymentContext'
import { ReportProvider } from './context/ReportContext'
import { NotificationProvider } from './context/NotificationContext'
import { UserProvider } from './context/UserContext'
import NotificationBell from './components/NotificationBell'
import Login from './components/Login'
import { SalaryPaymentProvider } from './context/SalaryPaymentContext'
import { ComplaintProvider } from './context/ComplaintContext';
import { SystemSettingsProvider } from './context/SystemSettingsContext';

// Lazy load all dashboard components and major components
const AdminDashboard = lazy(() => import('./pages/AdminDashboard'));
const AgentDashboard = lazy(() => import('./pages/AgentDashboard'));
const TenantDashboard = lazy(() => import('./pages/TenantDashboard'));
const NotificationsPage = lazy(() => import('./components/NotificationsPage'));
const TenantPayment = lazy(() => import('./components/TenantPayment'));

// Loading component for Suspense fallback
const LoadingSpinner = () => (
  <div className="flex justify-center items-center min-h-64">
    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
  </div>
);

// Layout component with notification bell
const Layout = ({ children }) => {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  // Get dashboard path based on user role
  const getDashboardPath = () => {
    if (!user) return '/login'
    switch (user.role) {
      case 'admin': return '/admin-dashboard'
      case 'agent': return '/agent-dashboard'
      case 'tenant': return '/tenant-dashboard'
      default: return '/login'
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            {/* Left side - Logo and Navigation */}
            <div className="flex items-center space-x-8">
              {/* Logo/Brand */}
              <div className="flex-shrink-0">
                <h1 className="text-xl font-bold text-blue-800 whitespace-nowrap">
                  Zakaria Rental System
                </h1>
              </div>

              {/* Navigation */}
              <nav className="hidden md:flex space-x-4">
                <Link 
                  to={getDashboardPath()} 
                  className="text-gray-600 hover:text-gray-900 px-3 py-2 rounded-md text-sm font-medium transition-colors duration-200"
                >
                  Dashboard
                </Link>
                <Link 
                  to={`${getDashboardPath()}/notifications`} 
                  className="text-gray-600 hover:text-gray-900 px-3 py-2 rounded-md text-sm font-medium transition-colors duration-200"
                >
                  Notifications
                </Link>
              </nav>
            </div>

            {/* Right side - User menu and notifications */}
            <div className="flex items-center space-x-4">
              {/* User Welcome Message - Only show on larger screens */}
              <div className="hidden lg:block">
                <p className="text-sm text-gray-700">
                  Welcome back, <span className="font-semibold text-blue-800">{user?.first_name} {user?.last_name}</span>
                </p>
                <p className="text-xs text-gray-500 capitalize">{user?.role}</p>
              </div>

              {/* Notification Bell */}
              <div className="relative">
                <NotificationBell />
              </div>
              
              {/* User menu */}
              <div className="relative group">
                <button className="flex items-center space-x-2 text-sm text-gray-700 hover:text-gray-900 focus:outline-none transition-colors duration-200">
                  <div className="w-8 h-8 bg-blue-800 rounded-full flex items-center justify-center text-white font-semibold text-sm">
                    {user?.first_name?.charAt(0)}{user?.last_name?.charAt(0)}
                  </div>
                  {/* Show user name on medium screens and up */}
                  <span className="hidden md:block">
                    {user?.first_name} {user?.last_name}
                  </span>
                  <svg className="w-4 h-4 hidden md:block" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                
                {/* Dropdown menu */}
                <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-200 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50">
                  <div className="py-2">
                    {/* Mobile user info - only show on small screens */}
                    <div className="md:hidden px-4 py-2 border-b border-gray-100">
                      <p className="text-sm font-medium text-gray-900">
                        {user?.first_name} {user?.last_name}
                      </p>
                      <p className="text-xs text-gray-500 capitalize">
                        {user?.role}
                      </p>
                    </div>
                    
                    <Link 
                      to={`${getDashboardPath()}/profile`} 
                      className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors duration-150"
                    >
                      Your Profile
                    </Link>
                    <Link 
                      to={`${getDashboardPath()}/settings`} 
                      className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors duration-150"
                    >
                      Settings
                    </Link>
                    <div className="border-t border-gray-100"></div>
                    <button
                      onClick={handleLogout}
                      className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors duration-150"
                    >
                      Sign out
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Mobile Navigation - Show on small screens */}
          <div className="md:hidden border-t border-gray-200 mt-2 pt-2">
            <nav className="flex space-x-4">
              <Link 
                to={getDashboardPath()} 
                className="text-gray-600 hover:text-gray-900 px-2 py-1 rounded text-sm font-medium"
              >
                Dashboard
              </Link>
              <Link 
                to={`${getDashboardPath()}/notifications`} 
                className="text-gray-600 hover:text-gray-900 px-2 py-1 rounded text-sm font-medium"
              >
                Notifications
              </Link>
            </nav>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <Suspense fallback={<LoadingSpinner />}>
          {children}
        </Suspense>
      </main>
    </div>
  )
}

// Protected Route component - FIXED VERSION
const ProtectedRoute = ({ children, allowedRoles }) => {
  const { user, loading } = useAuth()
  const navigate = useNavigate()
  
  if (loading) {
    return <LoadingSpinner />
  }
  
  if (!user) {
    console.log('No user, redirecting to login');
    return <Navigate to="/login" replace />
  }
  
  if (allowedRoles && !allowedRoles.includes(user.role)) {
    console.log('User role not allowed, redirecting to unauthorized');
    return <Navigate to="/unauthorized" replace />
  }
  
  return <Layout>{children}</Layout>
}

// Public Route - redirect to dashboard if already authenticated
const PublicRoute = ({ children }) => {
  const { user, loading } = useAuth()
  
  if (loading) {
    return <LoadingSpinner />
  }
  
  if (user) {
    // Redirect to appropriate dashboard based on role
    let redirectPath = '/login'
    switch (user.role) {
      case 'admin': redirectPath = '/admin-dashboard'; break
      case 'agent': redirectPath = '/agent-dashboard'; break
      case 'tenant': redirectPath = '/tenant-dashboard'; break
      default: redirectPath = '/login'
    }
    console.log(`🔄 PublicRoute: User authenticated, redirecting to ${redirectPath}`)
    return <Navigate to={redirectPath} replace />
  }
  
  return children
}

// Move AppRoutes inside the providers to ensure proper context availability
function AppContent() {
  const { user, loading } = useAuth()

  // Show loading spinner while checking authentication
  if (loading) {
    return <LoadingSpinner />
  }

  // Get the appropriate dashboard path based on user role
  const getDashboardPath = () => {
    if (!user) return '/login'
    switch (user.role) {
      case 'admin': return '/admin-dashboard'
      case 'agent': return '/agent-dashboard'
      case 'tenant': return '/tenant-dashboard'
      default: return '/login'
    }
  }

  return (
    <Routes>
      {/* Public Routes */}
      <Route 
        path="/login" 
        element={
          <PublicRoute>
            <Login />
          </PublicRoute>
        } 
      />
      
      {/* Admin Routes */}
      <Route 
        path="/admin-dashboard" 
        element={
          <ProtectedRoute allowedRoles={['admin']}>
            <AdminDashboard />
          </ProtectedRoute>
        } 
      />
      <Route 
        path="/admin-dashboard/notifications" 
        element={
          <ProtectedRoute allowedRoles={['admin']}>
            <NotificationsPage />
          </ProtectedRoute>
        } 
      />
      
      {/* Agent Routes */}
      <Route 
        path="/agent-dashboard" 
        element={
          <ProtectedRoute allowedRoles={['agent']}>
            <AgentDashboard />
          </ProtectedRoute>
        } 
      />
      <Route 
        path="/agent-dashboard/notifications" 
        element={
          <ProtectedRoute allowedRoles={['agent']}>
            <NotificationsPage />
          </ProtectedRoute>
        } 
      />
      
      {/* Tenant Routes */}
      <Route 
        path="/tenant-dashboard" 
        element={
          <ProtectedRoute allowedRoles={['tenant']}>
            <TenantDashboard />
          </ProtectedRoute>
        } 
      />
      <Route 
        path="/tenant-dashboard/payments" 
        element={
          <ProtectedRoute allowedRoles={['tenant']}>
            <TenantPayment />
          </ProtectedRoute>
        } 
      />
      <Route 
        path="/tenant-dashboard/notifications" 
        element={
          <ProtectedRoute allowedRoles={['tenant']}>
            <NotificationsPage />
          </ProtectedRoute>
        } 
      />
      
      {/* Default route - redirect to appropriate dashboard or login */}
      <Route 
        path="/" 
        element={<Navigate to={user ? getDashboardPath() : '/login'} replace />} 
      />
      
      {/* Catch-all route for undefined paths - redirect to appropriate dashboard */}
      <Route 
        path="*" 
        element={
          user ? (
            <Navigate to={getDashboardPath()} replace />
          ) : (
            <Navigate to="/login" replace />
          )
        } 
      />
      
      {/* Unauthorized route */}
      <Route 
        path="/unauthorized" 
        element={
          <div className="min-h-screen flex items-center justify-center bg-gray-50">
            <div className="text-center">
              <h1 className="text-4xl font-bold text-red-600 mb-4">Unauthorized</h1>
              <p className="text-gray-600">You don't have permission to access this page.</p>
              <Link 
                to={user ? getDashboardPath() : '/login'} 
                className="mt-4 inline-block bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700"
              >
                {user ? 'Go to Dashboard' : 'Back to Login'}
              </Link>
            </div>
          </div>
        } 
      />
    </Routes>
  )
}

function App() {
  return (
    <Router>
      <AuthProvider>
        <UserProvider>
          <PropertyProvider>
            <NotificationProvider>
              <PaymentProvider>
                <AllocationProvider>
                  <SalaryPaymentProvider>
                    <ComplaintProvider>
                      <ReportProvider>
                        <SystemSettingsProvider>
                          <AppContent />
                        </SystemSettingsProvider>
                      </ReportProvider>
                    </ComplaintProvider>
                  </SalaryPaymentProvider>
                </AllocationProvider>
              </PaymentProvider>
            </NotificationProvider>
          </PropertyProvider>
        </UserProvider>
      </AuthProvider>
    </Router>
  )
}

export default App