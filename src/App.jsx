import React, { useState, Suspense, lazy } from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate, Link } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { PropertyProvider } from './context/PropertyContext'
import { AllocationProvider } from './context/TenantAllocationContext'
import { PaymentProvider } from './context/PaymentContext'
import { ReportProvider } from './context/ReportContext'
import { NotificationProvider, useNotification } from './context/NotificationContext'
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

// Protected Route component
const ProtectedRoute = ({ children, allowedRoles }) => {
  const { user, loading } = useAuth()
  
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

// Layout component with notification bell
const Layout = ({ children }) => {
  const { user, logout } = useAuth()
  const { unreadCount, notifications, markAsRead } = useNotification()
  const [isNotificationOpen, setIsNotificationOpen] = useState(false)

  const handleLogout = () => {
    logout()
  }

  // Get recent notifications for dropdown (last 5 unread or recent)
  const recentNotifications = notifications
    .filter(notification => !notification.is_read)
    .slice(0, 5)

  const handleNotificationClick = async (notificationId) => {
    await markAsRead(notificationId)
    setIsNotificationOpen(false)
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
                  to={`/${user?.role}`} 
                  className="text-gray-600 hover:text-gray-900 px-3 py-2 rounded-md text-sm font-medium transition-colors duration-200"
                >
                  Dashboard
                </Link>
                <Link 
                  to={`/${user?.role}/notifications`} 
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
                      to={`/${user?.role}/profile`} 
                      className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors duration-150"
                      onClick={() => setIsNotificationOpen(false)}
                    >
                      Your Profile
                    </Link>
                    <Link 
                      to={`/${user?.role}/settings`} 
                      className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors duration-150"
                      onClick={() => setIsNotificationOpen(false)}
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
                to={`/${user?.role}`} 
                className="text-gray-600 hover:text-gray-900 px-2 py-1 rounded text-sm font-medium"
                onClick={() => setIsNotificationOpen(false)}
              >
                Dashboard
              </Link>
              <Link 
                to={`/${user?.role}/notifications`} 
                className="text-gray-600 hover:text-gray-900 px-2 py-1 rounded text-sm font-medium"
                onClick={() => setIsNotificationOpen(false)}
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

function AppRoutes() {
  const { user } = useAuth()

  return (
    <Routes>
      <Route 
        path="/login" 
        element={user ? <Navigate to={`/${user.role}`} replace /> : <Login />} 
      />
      
      {/* Admin Routes */}
      <Route 
        path="/admin/*" 
        element={
          <ProtectedRoute allowedRoles={['admin']}>
            <AdminDashboard />
          </ProtectedRoute>
        } 
      />
      <Route 
        path="/admin/notifications" 
        element={
          <ProtectedRoute allowedRoles={['admin']}>
            <NotificationsPage />
          </ProtectedRoute>
        } 
      />
      
      {/* Agent Routes */}
      <Route 
        path="/agent/*" 
        element={
          <ProtectedRoute allowedRoles={['agent']}>
            <AgentDashboard />
          </ProtectedRoute>
        } 
      />
      <Route 
        path="/agent/notifications" 
        element={
          <ProtectedRoute allowedRoles={['agent']}>
            <NotificationsPage />
          </ProtectedRoute>
        } 
      />
      
      {/* Tenant Routes */}
      <Route 
        path="/tenant/*" 
        element={
          <ProtectedRoute allowedRoles={['tenant']}>
            <TenantDashboard />
          </ProtectedRoute>
        } 
      />
      <Route 
        path="/tenant/payments" 
        element={
          <ProtectedRoute allowedRoles={['tenant']}>
            <TenantPayment />
          </ProtectedRoute>
        } 
      />
      <Route 
        path="/tenant/notifications" 
        element={
          <ProtectedRoute allowedRoles={['tenant']}>
            <NotificationsPage />
          </ProtectedRoute>
        } 
      />
      
      {/* Default route */}
      <Route 
        path="/" 
        element={<Navigate to={user ? `/${user.role}` : '/login'} replace />} 
      />
      
      {/* Notifications route for all roles */}
      <Route 
        path="/notifications" 
        element={<Navigate to={user ? `/${user.role}/notifications` : '/login'} replace />} 
      />
      
      {/* Payment route for tenants */}
      <Route 
        path="/payments" 
        element={<Navigate to={user ? `/${user.role}/payments` : '/login'} replace />} 
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
                to="/login" 
                className="mt-4 inline-block bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700"
              >
                Back to Login
              </Link>
            </div>
          </div>
        } 
      />
      
      {/* 404 Not Found route */}
      <Route 
        path="*" 
        element={
          <div className="min-h-screen flex items-center justify-center bg-gray-50">
            <div className="text-center">
              <h1 className="text-4xl font-bold text-gray-900 mb-4">404 - Page Not Found</h1>
              <p className="text-gray-600">The page you're looking for doesn't exist.</p>
              <Link 
                to="/" 
                className="mt-4 inline-block bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700"
              >
                Go Home
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
    <Router
      future={{
        v7_startTransition: true,
        v7_relativeSplatPath: true,
      }}
    >
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
                          <Suspense fallback={<LoadingSpinner />}>
                            <AppRoutes />
                          </Suspense>
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