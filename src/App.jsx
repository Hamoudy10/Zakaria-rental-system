// src/App.jsx
import React, { useState, Suspense, lazy } from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate, Link, useNavigate, useLocation } from 'react-router-dom'
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
import { ChatProvider } from './context/ChatContext';

// Lazy load all dashboard components and major components
const AdminDashboard = lazy(() => import('./pages/AdminDashboard'));
const AgentDashboard = lazy(() => import('./pages/AgentDashboard'));
const TenantDashboard = lazy(() => import('./pages/TenantDashboard'));
const NotificationPage = lazy(() => import('./components/NotificationsPage'));
const TenantPayment = lazy(() => import('./components/TenantPayment'));
const ProfilePage = lazy(() => import('./components/ProfilePage'));
const SystemSettings = lazy(() => import('./components/SystemSettings.jsx'));
const AgentManagement = lazy(() => import('./components/AgentManagement'));
const ChatModule = lazy(() => import('./components/ChatModule'));

// Loading component for Suspense fallback
const LoadingSpinner = () => (
  <div className="flex justify-center items-center min-h-64">
    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
  </div>
);

// ============================================
// REUSABLE USER AVATAR COMPONENT
// ============================================
const UserAvatar = ({ user, size = 'md', className = '' }) => {
  const sizeClasses = {
    sm: 'w-6 h-6 text-xs',
    md: 'w-8 h-8 text-sm',
    lg: 'w-10 h-10 text-base',
    xl: 'w-12 h-12 text-lg'
  };

  const sizeClass = sizeClasses[size] || sizeClasses.md;
  const initials = `${user?.first_name?.charAt(0) || ''}${user?.last_name?.charAt(0) || ''}`;

  return (
    <div className={`${sizeClass} bg-blue-800 rounded-full flex items-center justify-center text-white font-semibold overflow-hidden ${className}`}>
      {user?.profile_image ? (
        <img 
          src={user.profile_image} 
          alt={`${user.first_name} ${user.last_name}`}
          className="w-full h-full object-cover"
          onError={(e) => {
            // Fallback to initials if image fails to load
            e.target.style.display = 'none';
            e.target.nextSibling.style.display = 'flex';
          }}
        />
      ) : null}
      <span 
        className={`${user?.profile_image ? 'hidden' : 'flex'} items-center justify-center w-full h-full`}
        style={{ display: user?.profile_image ? 'none' : 'flex' }}
      >
        {initials}
      </span>
    </div>
  );
};

// Alternative simpler avatar component (if you prefer)
const SimpleUserAvatar = ({ user, size = 'md', className = '' }) => {
  const [imageError, setImageError] = useState(false);
  
  const sizeClasses = {
    sm: 'w-6 h-6 text-xs',
    md: 'w-8 h-8 text-sm',
    lg: 'w-10 h-10 text-base',
    xl: 'w-12 h-12 text-lg'
  };

  const sizeClass = sizeClasses[size] || sizeClasses.md;
  const initials = `${user?.first_name?.charAt(0) || ''}${user?.last_name?.charAt(0) || ''}`;
  const hasValidImage = user?.profile_image && !imageError;

  return (
    <div className={`${sizeClass} bg-blue-800 rounded-full flex items-center justify-center text-white font-semibold overflow-hidden ${className}`}>
      {hasValidImage ? (
        <img 
          src={user.profile_image} 
          alt={`${user.first_name} ${user.last_name}`}
          className="w-full h-full object-cover"
          onError={() => setImageError(true)}
        />
      ) : (
        <span>{initials}</span>
      )}
    </div>
  );
};

// Layout component with responsive design
const Layout = ({ children }) => {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)

  const handleLogout = () => {
    logout()
    navigate('/login')
    setUserMenuOpen(false)
  }

  // Get dashboard path based on user role
  const getDashboardPath = () => {
    if (!user) return '/login'
    switch (user.role) {
      case 'admin': return '/admin'
      case 'agent': return '/agent'
      case 'tenant': return '/tenant'
      default: return '/login'
    }
  }

  // Close menus when route changes
  React.useEffect(() => {
    setSidebarOpen(false)
    setUserMenuOpen(false)
  }, [location.pathname])

  return (
    <div className="min-h-screen bg-gray-50 mobile-optimized no-horizontal-scroll">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200 sticky top-0 z-50 safe-area-top">
        <div className="responsive-container">
          <div className="flex items-center justify-between h-14">
            {/* Left side - Logo and mobile menu button */}
            <div className="flex items-center space-x-3">
              {/* Mobile menu button */}
              <button
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className=" p-2 rounded-md text-gray-600 hover:text-gray-900 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500 touch-target"
                aria-label="Open sidebar"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>

              {/* Logo/Brand */}
              <div className="flex-shrink-0">
                <h1 className="text-lg font-bold text-blue-800 whitespace-nowrap truncate  max-w-full sm:max-w-[250px] md:max-w-[300px]">
                  Zakaria House Agency Ltd
                </h1>
              </div>
            </div>

            {/* Desktop Navigation - Hidden on mobile */}
            <nav className="hidden lg:flex items-center space-x-4">
              <Link 
                to={getDashboardPath()} 
                className="text-gray-600 hover:text-gray-900 px-3 py-2 rounded-md text-sm font-medium transition-colors duration-200"
              >
                Dashboard
              </Link>
              {/* Show Chat link for admin and agent users */}
              {(user?.role === 'admin' || user?.role === 'agent') && (
                <Link 
                  to={`${getDashboardPath()}/chat`} 
                  className="text-gray-600 hover:text-gray-900 px-3 py-2 rounded-md text-sm font-medium transition-colors duration-200"
                >
                  Chat
                </Link>
              )}
              <Link 
                to={`${getDashboardPath()}/notifications`} 
                className="text-gray-600 hover:text-gray-900 px-3 py-2 rounded-md text-sm font-medium transition-colors duration-200"
              >
                Notifications
              </Link>
            </nav>

            {/* Right side - User menu and notifications */}
            <div className="flex items-center space-x-2">
              {/* User Welcome Message - Only show on larger screens */}
              <div className="hidden xl:block">
                <p className="text-sm text-gray-700 whitespace-nowrap">
                  Welcome, <span className="font-semibold text-blue-800">{user?.first_name} {user?.last_name}</span>
                </p>
                <p className="text-xs text-gray-500 capitalize">{user?.role}</p>
              </div>

              {/* Notification Bell */}
              <div className="relative">
                <NotificationBell />
              </div>
              
              {/* User menu */}
              <div className="relative">
                <button 
                  onClick={() => setUserMenuOpen(!userMenuOpen)}
                  className="flex items-center space-x-2 text-sm text-gray-700 hover:text-gray-900 focus:outline-none transition-colors duration-200 touch-target p-2 rounded-md hover:bg-gray-100"
                >
                  {/* UPDATED: Profile Image with Fallback to Initials */}
                  <SimpleUserAvatar user={user} size="md" />
                  
                  {/* Show user name on medium screens and up */}
                  <span className="hidden md:block text-sm whitespace-nowrap">
                    {user?.first_name} {user?.last_name}
                  </span>
                  <svg className="w-4 h-4 hidden md:block" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                
                {/* Dropdown menu */}
                {userMenuOpen && (
                  <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-200 z-50 slide-in">
                    <div className="py-2">
                      {/* Mobile user info - only show on small screens */}
                      <div className="md:hidden px-4 py-2 border-b border-gray-100">
                        <div className="flex items-center space-x-3">
                          {/* UPDATED: Profile Image in Dropdown */}
                          <SimpleUserAvatar user={user} size="md" />
                          <div>
                            <p className="text-sm font-medium text-gray-900">
                              {user?.first_name} {user?.last_name}
                            </p>
                            <p className="text-xs text-gray-500 capitalize">
                              {user?.role}
                            </p>
                          </div>
                        </div>
                      </div>
                      
                      <Link 
                        to={`${getDashboardPath()}/profile`} 
                        className="flex items-center space-x-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors duration-150"
                        onClick={() => setUserMenuOpen(false)}
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                        </svg>
                        <span>Your Profile</span>
                      </Link>
                      
                      {user?.role === 'admin' && (
                        <Link 
                          to={`${getDashboardPath()}/settings`} 
                          className="flex items-center space-x-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors duration-150"
                          onClick={() => setUserMenuOpen(false)}
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          </svg>
                          <span>System Settings</span>
                        </Link>
                      )}
                      
                      <div className="border-t border-gray-100"></div>
                      <button
                        onClick={handleLogout}
                        className="flex items-center space-x-2 w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors duration-150"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                        </svg>
                        <span>Sign out</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Mobile Navigation - Show on small screens */}
          <div className="lg:hidden border-t border-gray-200 py-2">
            <nav className="flex space-x-4 overflow-x-auto hide-scrollbar">
              <Link 
                to={getDashboardPath()} 
                className="text-gray-600 hover:text-gray-900 px-2 py-1 rounded text-sm font-medium whitespace-nowrap flex-shrink-0"
              >
                Dashboard
              </Link>
              {/* Show Chat link for admin and agent users on mobile */}
              {(user?.role === 'admin' || user?.role === 'agent') && (
                <Link 
                  to={`${getDashboardPath()}/chat`} 
                  className="text-gray-600 hover:text-gray-900 px-2 py-1 rounded text-sm font-medium whitespace-nowrap flex-shrink-0"
                >
                  Chat
                </Link>
              )}
              <Link 
                to={`${getDashboardPath()}/notifications`} 
                className="text-gray-600 hover:text-gray-900 px-2 py-1 rounded text-sm font-medium whitespace-nowrap flex-shrink-0"
              >
                Notifications
              </Link>
            </nav>
          </div>
        </div>
      </header>

      {/* Enhanced Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <div className=" fixed inset-0 z-50">
          {/* Backdrop with blur effect */}
          <div 
            className="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm transition-opacity duration-300" 
            onClick={() => setSidebarOpen(false)}
          />
          
          {/* Sidebar Panel */}
          <div className="relative flex-1 flex flex-col max-w-xs w-full bg-white shadow-xl transform transition-transform duration-300 ease-in-out">
            {/* Sidebar Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-blue-50 to-indigo-50">
              <div className="flex items-center space-x-3">
                {/* UPDATED: Profile Image in Sidebar */}
                <SimpleUserAvatar user={user} size="lg" />
                <div>
                  <h2 className="text-sm font-semibold text-gray-900">
                    {user?.first_name} {user?.last_name}
                  </h2>
                  <p className="text-xs text-gray-600 capitalize">{user?.role}</p>
                </div>
              </div>
              <button
                onClick={() => setSidebarOpen(false)}
                className="p-2 rounded-md text-gray-400 hover:text-gray-500 hover:bg-gray-100 transition-colors duration-200 touch-target"
                aria-label="Close sidebar"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Navigation Menu */}
            <div className="flex-1 overflow-y-auto py-6 px-4">
              <nav className="space-y-2">
                <Link
                  to={getDashboardPath()}
                  className="flex items-center space-x-3 px-3 py-3 rounded-lg text-base font-medium text-gray-700 hover:bg-blue-50 hover:text-blue-700 transition-colors duration-200 group"
                  onClick={() => setSidebarOpen(false)}
                >
                  <svg className="w-5 h-5 text-gray-400 group-hover:text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                  </svg>
                  <span>Dashboard</span>
                </Link>

                {/* Chat link for admin and agent users in mobile sidebar */}
                {(user?.role === 'admin' || user?.role === 'agent') && (
                  <Link
                    to={`${getDashboardPath()}/chat`}
                    className="flex items-center space-x-3 px-3 py-3 rounded-lg text-base font-medium text-gray-700 hover:bg-blue-50 hover:text-blue-700 transition-colors duration-200 group"
                    onClick={() => setSidebarOpen(false)}
                  >
                    <svg className="w-5 h-5 text-gray-400 group-hover:text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                    </svg>
                    <span>Chat</span>
                  </Link>
                )}

                <Link
                  to={`${getDashboardPath()}/notifications`}
                  className="flex items-center space-x-3 px-3 py-3 rounded-lg text-base font-medium text-gray-700 hover:bg-blue-50 hover:text-blue-700 transition-colors duration-200 group"
                  onClick={() => setSidebarOpen(false)}
                >
                  <svg className="w-5 h-5 text-gray-400 group-hover:text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                  </svg>
                  <span>Notifications</span>
                </Link>

                {user?.role === 'tenant' && (
                  <Link
                    to={`${getDashboardPath()}/payments`}
                    className="flex items-center space-x-3 px-3 py-3 rounded-lg text-base font-medium text-gray-700 hover:bg-blue-50 hover:text-blue-700 transition-colors duration-200 group"
                    onClick={() => setSidebarOpen(false)}
                  >
                    <svg className="w-5 h-5 text-gray-400 group-hover:text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1" />
                    </svg>
                    <span>Payments</span>
                  </Link>
                )}

                <Link
                  to={`${getDashboardPath()}/profile`}
                  className="flex items-center space-x-3 px-3 py-3 rounded-lg text-base font-medium text-gray-700 hover:bg-blue-50 hover:text-blue-700 transition-colors duration-200 group"
                  onClick={() => setSidebarOpen(false)}
                >
                  <svg className="w-5 h-5 text-gray-400 group-hover:text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                  <span>Profile</span>
                </Link>

                {user?.role === 'admin' && (
                  <Link
                    to={`${getDashboardPath()}/settings`}
                    className="flex items-center space-x-3 px-3 py-3 rounded-lg text-base font-medium text-gray-700 hover:bg-blue-50 hover:text-blue-700 transition-colors duration-200 group"
                    onClick={() => setSidebarOpen(false)}
                  >
                    <svg className="w-5 h-5 text-gray-400 group-hover:text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    <span>System Settings</span>
                  </Link>
                )}
              </nav>

              {/* Sidebar Footer */}
              <div className="mt-8 pt-6 border-t border-gray-200">
                <button
                  onClick={handleLogout}
                  className="flex items-center space-x-3 w-full px-3 py-3 rounded-lg text-base font-medium text-gray-700 hover:bg-red-50 hover:text-red-700 transition-colors duration-200 group"
                >
                  <svg className="w-5 h-5 text-gray-400 group-hover:text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                  </svg>
                  <span>Sign Out</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main content */}
      <main className="responsive-container py-4 safe-area-bottom">
        <div className="w-full max-w-full overflow-hidden">
          <Suspense fallback={<LoadingSpinner />}>
            {children}
          </Suspense>
        </div>
      </main>
    </div>
  )
}

// Protected Route component
const ProtectedRoute = ({ children, allowedRoles }) => {
  const { user, loading } = useAuth()
  const navigate = useNavigate()
  
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <LoadingSpinner />
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

// Public Route - redirect to dashboard if already authenticated
const PublicRoute = ({ children }) => {
  const { user, loading } = useAuth()
  
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <LoadingSpinner />
      </div>
    )
  }
  
  if (user) {
    // Redirect to appropriate dashboard based on role
    let redirectPath = '/login'
    switch (user.role) {
      case 'admin': redirectPath = '/admin'; break
      case 'agent': redirectPath = '/agent'; break
      case 'tenant': redirectPath = '/tenant'; break
      default: redirectPath = '/login'
    }
    console.log(`🔄 PublicRoute: User authenticated, redirecting to ${redirectPath}`)
    return <Navigate to={redirectPath} replace />
  }
  
  return children
}

// Dashboard Layout with nested routes
const DashboardLayout = ({ children }) => {
  return (
    <div className="w-full">
      {children}
    </div>
  )
}

// Move AppRoutes inside the providers to ensure proper context availability
function AppContent() {
  const { user, loading } = useAuth()

  // Show loading spinner while checking authentication
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <LoadingSpinner />
      </div>
    )
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
        path="/admin/*" 
        element={
          <ProtectedRoute allowedRoles={['admin']}>
            <DashboardLayout>
              <Routes>
                <Route path="/" element={<AdminDashboard />} />
                <Route path="/notifications" element={<NotificationPage />} />
                <Route path="/profile" element={<ProfilePage />} />
                <Route path="/settings" element={<SystemSettings />} />
                <Route path="/agents" element={<AgentManagement />} />
                <Route path="/chat" element={<ChatModule />} />
                <Route path="*" element={<Navigate to="/admin" replace />} />
              </Routes>
            </DashboardLayout>
          </ProtectedRoute>
        } 
      />
      
      {/* Agent Routes */}
      <Route 
        path="/agent/*" 
        element={
          <ProtectedRoute allowedRoles={['agent']}>
            <DashboardLayout>
              <Routes>
                <Route path="/" element={<AgentDashboard />} />
                <Route path="/notifications" element={<NotificationPage />} />
                <Route path="/profile" element={<ProfilePage />} />
                <Route path="/chat" element={<ChatModule />} />
                <Route path="*" element={<Navigate to="/agent" replace />} />
              </Routes>
            </DashboardLayout>
          </ProtectedRoute>
        } 
      />
      
      {/* Tenant Routes */}
      <Route 
        path="/tenant/*" 
        element={
          <ProtectedRoute allowedRoles={['tenant']}>
            <DashboardLayout>
              <Routes>
                <Route path="/" element={<TenantDashboard />} />
                <Route path="/notifications" element={<NotificationPage />} />
                <Route path="/payments" element={<TenantPayment />} />
                <Route path="/profile" element={<ProfilePage />} />
                <Route path="*" element={<Navigate to="/tenant" replace />} />
              </Routes>
            </DashboardLayout>
          </ProtectedRoute>
        } 
      />
      
      {/* Legacy dashboard routes - redirect to new structure */}
      <Route path="/admin-dashboard" element={<Navigate to="/admin" replace />} />
      <Route path="/agent-dashboard" element={<Navigate to="/agent" replace />} />
      <Route path="/tenant-dashboard" element={<Navigate to="/tenant" replace />} />
      
      {/* Default route - redirect to appropriate dashboard or login */}
      <Route 
        path="/" 
        element={
          <Navigate to={
            user ? 
              user.role === 'admin' ? '/admin' :
              user.role === 'agent' ? '/agent' :
              user.role === 'tenant' ? '/tenant' : '/login'
            : '/login'
          } replace />
        } 
      />
      
      {/* Catch-all route for undefined paths */}
      <Route 
        path="*" 
        element={
          user ? (
            <Navigate to={
              user.role === 'admin' ? '/admin' :
              user.role === 'agent' ? '/agent' :
              user.role === 'tenant' ? '/tenant' : '/login'
            } replace />
          ) : (
            <Navigate to="/login" replace />
          )
        } 
      />
      
      {/* Unauthorized route */}
      <Route 
        path="/unauthorized" 
        element={
          <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
            <div className="text-center max-w-md w-full">
              <h1 className="text-2xl font-bold text-red-600 mb-4">Unauthorized</h1>
              <p className="text-gray-600 mb-6">You don't have permission to access this page.</p>
              <Link 
                to={user ? 
                  user.role === 'admin' ? '/admin' :
                  user.role === 'agent' ? '/agent' :
                  user.role === 'tenant' ? '/tenant' : '/login'
                  : '/login'} 
                className="inline-block bg-blue-600 text-white px-6 py-3 rounded-md hover:bg-blue-700 transition-colors touch-target"
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
          <PaymentProvider>
            <AllocationProvider>
              <SalaryPaymentProvider>
                <ComplaintProvider>
                  <ReportProvider>
                    <SystemSettingsProvider>
                      <NotificationProvider>
                        <ChatProvider>
                          <AppContent />
                        </ChatProvider>
                      </NotificationProvider>
                    </SystemSettingsProvider>
                  </ReportProvider>
                </ComplaintProvider>
              </SalaryPaymentProvider>
            </AllocationProvider>
          </PaymentProvider>
        </PropertyProvider>
      </UserProvider>
    </AuthProvider>
</Router>

  )
}

export default App