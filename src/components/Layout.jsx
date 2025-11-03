// src/components/Layout.jsx
import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import NotificationBell from './NotificationBell';

const Layout = ({ children }) => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/login');
    setUserMenuOpen(false);
  };

  // Get dashboard path based on user role
  const getDashboardPath = () => {
    if (!user) return '/login';
    switch (user.role) {
      case 'admin': return '/admin-dashboard';
      case 'agent': return '/agent-dashboard';
      case 'tenant': return '/tenant-dashboard';
      default: return '/login';
    }
  };

  // Close menus when route changes
  React.useEffect(() => {
    setSidebarOpen(false);
    setUserMenuOpen(false);
  }, [location.pathname]);

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
                className="lg:hidden p-2 rounded-md text-gray-600 hover:text-gray-900 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500 touch-target"
                aria-label="Open sidebar"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>

              {/* Logo/Brand */}
              <div className="flex-shrink-0">
                <h1 className="text-lg font-bold text-blue-800 whitespace-nowrap truncate max-w-[150px] xs:max-w-none">
                  Zakaria Rental System
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
              <Link 
                to={`${getDashboardPath()}/notifications`} 
                className="text-gray-600 hover:text-gray-900 px-3 py-2 rounded-md text-sm font-medium transition-colors duration-200"
              >
                Notifications
              </Link>
              {user?.role === 'tenant' && (
                <Link 
                  to={`${getDashboardPath()}/payments`} 
                  className="text-gray-600 hover:text-gray-900 px-3 py-2 rounded-md text-sm font-medium transition-colors duration-200"
                >
                  Payments
                </Link>
              )}
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
                  <div className="w-8 h-8 bg-blue-800 rounded-full flex items-center justify-center text-white font-semibold text-sm">
                    {user?.first_name?.charAt(0)}{user?.last_name?.charAt(0)}
                  </div>
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
                        onClick={() => setUserMenuOpen(false)}
                      >
                        Your Profile
                      </Link>
                      <Link 
                        to={`${getDashboardPath()}/settings`} 
                        className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors duration-150"
                        onClick={() => setUserMenuOpen(false)}
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
              <Link 
                to={`${getDashboardPath()}/notifications`} 
                className="text-gray-600 hover:text-gray-900 px-2 py-1 rounded text-sm font-medium whitespace-nowrap flex-shrink-0"
              >
                Notifications
              </Link>
              {user?.role === 'tenant' && (
                <Link 
                  to={`${getDashboardPath()}/payments`} 
                  className="text-gray-600 hover:text-gray-900 px-2 py-1 rounded text-sm font-medium whitespace-nowrap flex-shrink-0"
                >
                  Payments
                </Link>
              )}
              <Link 
                to={`${getDashboardPath()}/profile`} 
                className="text-gray-600 hover:text-gray-900 px-2 py-1 rounded text-sm font-medium whitespace-nowrap flex-shrink-0"
              >
                Profile
              </Link>
            </nav>
          </div>
        </div>
      </header>

      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <div className="lg:hidden fixed inset-0 flex z-40">
          <div 
            className="fixed inset-0 bg-gray-600 bg-opacity-75" 
            onClick={() => setSidebarOpen(false)}
          />
          <div className="relative flex-1 flex flex-col max-w-xs w-full bg-white">
            <div className="absolute top-0 right-0 -mr-12 pt-2">
              <button
                onClick={() => setSidebarOpen(false)}
                className="ml-1 flex items-center justify-center h-10 w-10 rounded-full focus:outline-none focus:ring-2 focus:ring-inset focus:ring-white touch-target"
              >
                <span className="sr-only">Close sidebar</span>
                <svg className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="flex-1 h-0 pt-5 pb-4 overflow-y-auto">
              <div className="flex-shrink-0 flex items-center px-4 mb-6">
                <h1 className="text-lg font-bold text-blue-800">
                  Zakaria Rental System
                </h1>
              </div>
              <nav className="mt-5 px-2 space-y-1">
                <Link
                  to={getDashboardPath()}
                  className="flex items-center px-3 py-2 text-base font-medium text-gray-900 rounded-lg hover:bg-gray-100"
                  onClick={() => setSidebarOpen(false)}
                >
                  Dashboard
                </Link>
                <Link
                  to={`${getDashboardPath()}/notifications`}
                  className="flex items-center px-3 py-2 text-base font-medium text-gray-900 rounded-lg hover:bg-gray-100"
                  onClick={() => setSidebarOpen(false)}
                >
                  Notifications
                </Link>
                {user?.role === 'tenant' && (
                  <Link
                    to={`${getDashboardPath()}/payments`}
                    className="flex items-center px-3 py-2 text-base font-medium text-gray-900 rounded-lg hover:bg-gray-100"
                    onClick={() => setSidebarOpen(false)}
                  >
                    Payments
                  </Link>
                )}
                <Link
                  to={`${getDashboardPath()}/profile`}
                  className="flex items-center px-3 py-2 text-base font-medium text-gray-900 rounded-lg hover:bg-gray-100"
                  onClick={() => setSidebarOpen(false)}
                >
                  Profile
                </Link>
                <Link
                  to={`${getDashboardPath()}/settings`}
                  className="flex items-center px-3 py-2 text-base font-medium text-gray-900 rounded-lg hover:bg-gray-100"
                  onClick={() => setSidebarOpen(false)}
                >
                  Settings
                </Link>
              </nav>
            </div>
            <div className="flex-shrink-0 flex border-t border-gray-200 p-4">
              <div className="flex items-center">
                <div className="w-8 h-8 bg-blue-800 rounded-full flex items-center justify-center text-white font-semibold text-sm">
                  {user?.first_name?.charAt(0)}{user?.last_name?.charAt(0)}
                </div>
                <div className="ml-3">
                  <p className="text-sm font-medium text-gray-900">
                    {user?.first_name} {user?.last_name}
                  </p>
                  <p className="text-xs font-medium text-gray-500 capitalize">
                    {user?.role}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main content */}
      <main className="responsive-container py-4 safe-area-bottom">
        <div className="w-full max-w-full overflow-hidden">
          {children}
        </div>
      </main>
    </div>
  );
};

export default Layout;