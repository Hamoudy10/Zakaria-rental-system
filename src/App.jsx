import React, { useState } from 'react'
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

// Protected Route component
const ProtectedRoute = ({ children, allowedRoles }) => {
  const { user, loading } = useAuth()
  
  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-gray-500">Loading...</div>
      </div>
    )
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
                <button
                  onClick={() => setIsNotificationOpen(!isNotificationOpen)}
                  className="relative p-2 text-gray-600 hover:text-gray-900 focus:outline-none transition-colors duration-200"
                >
                  {/* Real Bell Icon - Yellow */}
                  <svg 
                    className="w-6 h-6 text-yellow-500" 
                    fill="currentColor" 
                    viewBox="0 0 20 20"
                  >
                    <path d="M10 2a6 6 0 00-6 6v3.586l-.707.707A1 1 0 004 14h12a1 1 0 00.707-1.707L16 11.586V8a6 6 0 00-6-6zM10 18a3 3 0 01-3-3h6a3 3 0 01-3 3z" />
                  </svg>
                  
                  {unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center border-2 border-white">
                      {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                  )}
                </button>

                {/* Notification Dropdown */}
                {isNotificationOpen && (
                  <div className="absolute right-0 mt-2 w-80 bg-white rounded-lg shadow-lg border border-gray-200 z-50">
                    <div className="p-4">
                      <div className="flex justify-between items-center mb-3">
                        <h3 className="text-lg font-semibold">Notifications</h3>
                        <Link 
                          to={`/${user?.role}/notifications`}
                          className="text-sm text-blue-600 hover:text-blue-800"
                          onClick={() => setIsNotificationOpen(false)}
                        >
                          View All
                        </Link>
                      </div>
                      
                      {/* Dynamic Notification List */}
                      <div className="space-y-2 max-h-60 overflow-y-auto">
                        {recentNotifications.length > 0 ? (
                          recentNotifications.map((notification) => (
                            <div 
                              key={notification.id}
                              className={`p-3 rounded-lg cursor-pointer hover:bg-gray-50 ${
                                notification.type === 'payment_success' ? 'bg-green-50 border border-green-200' :
                                notification.type === 'payment_received' ? 'bg-blue-50 border border-blue-200' :
                                notification.type === 'salary_paid' ? 'bg-purple-50 border border-purple-200' :
                                notification.type === 'salary_processed' ? 'bg-indigo-50 border border-indigo-200' :
                                'bg-gray-50 border border-gray-200'
                              }`}
                              onClick={() => handleNotificationClick(notification.id)}
                            >
                              <p className="text-sm font-medium text-gray-900">{notification.title}</p>
                              <p className="text-xs text-gray-600 mt-1">{notification.message}</p>
                              <p className="text-xs text-gray-500 mt-1">
                                {new Date(notification.created_at).toLocaleDateString()} at{' '}
                                {new Date(notification.created_at).toLocaleTimeString()}
                              </p>
                            </div>
                          ))
                        ) : (
                          <div className="text-center py-4 text-gray-500">
                            <p>No new notifications</p>
                          </div>
                        )}
                      </div>
                      
                      {unreadCount > 0 && (
                        <div className="mt-3 pt-3 border-t border-gray-200">
                          <button
                            onClick={() => {
                              // This would mark all as read - you'd need to implement this function
                              setIsNotificationOpen(false)
                            }}
                            className="w-full text-center text-sm text-blue-600 hover:text-blue-800"
                          >
                            Mark all as read
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )}
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
        {children}
      </main>
    </div>
  )
}

// Dashboard components
import AdminDashboard from './pages/AdminDashboard'
import AgentDashboard from './pages/AgentDashboard'
import TenantDashboard from './pages/TenantDashboard'
import NotificationsPage from './components/NotificationsPage'

// Import payment-related components
import TenantPayment from './components/TenantPayment'

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
                          <AppRoutes />
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