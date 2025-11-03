import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';

const Login = () => {
  const [email, setEmail] = useState('admin@example.com');
  const [password, setPassword] = useState('test123');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  const { login } = useAuth();
  const navigate = useNavigate();

  // Test login with fetch
  const testLoginWithFetch = async (email, password) => {
    try {
      console.log('🔍 Testing login with fetch...');
      const response = await fetch('http://localhost:3001/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
      });
      
      const rawText = await response.text();
      console.log('📨 Raw response:', rawText);
      
      let data;
      try {
        data = JSON.parse(rawText);
        console.log('📊 Parsed JSON:', data);
      } catch (parseError) {
        console.error('❌ JSON parse error:', parseError);
        return { success: false, message: 'Invalid JSON response' };
      }
      
      return data;
    } catch (error) {
      console.error('💥 Fetch error:', error);
      return { success: false, message: error.message };
    }
  };

  // Login handler
  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      console.log('Starting login process...');
      
      // Test with fetch first
      const fetchResult = await testLoginWithFetch(email, password);
      console.log('Fetch result:', fetchResult);
      
      if (fetchResult.success) {
        // If fetch works, try with the normal login
        const result = await login(email, password);
        console.log('Normal login result:', result);
        
        if (result.success) {
          console.log('Login successful, redirecting...');
          const user = result.user;
          
          // Redirect based on user role (tenant removed)
          if (user.role === 'admin') {
            navigate('/admin-dashboard');
          } else if (user.role === 'agent') {
            navigate('/agent-dashboard');
          } else {
            // Default fallback
            navigate('/admin-dashboard');
          }
        } else {
          setError(result.message || 'Login failed');
        }
      } else {
        setError(fetchResult.message || 'Login failed');
      }
    } catch (err) {
      console.error('Login error:', err);
      setError('An unexpected error occurred during login');
    } finally {
      setLoading(false);
    }
  };

  const handleDemoLogin = (demoEmail, demoPassword) => {
    setEmail(demoEmail);
    setPassword(demoPassword);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-8 px-4 sm:px-6 lg:px-8 mobile-optimized safe-area-top safe-area-bottom">
      <div className="max-w-md w-full space-y-6">
        {/* Header */}
        <div className="text-center">
          <div className="mx-auto h-12 w-12 bg-blue-600 rounded-full flex items-center justify-center mb-4">
            <span className="text-white font-bold text-lg">ZR</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-bold text-gray-900">
            Zakaria Rental System
          </h2>
          <p className="mt-1 text-xs sm:text-sm text-gray-600">
            Sign in to your account
          </p>
        </div>
        
        {/* Demo Account Buttons - Tenant removed */}
        <div className="space-y-3">
          <h3 className="text-center text-xs sm:text-sm font-medium text-gray-700">Quick Demo Login:</h3>
          <div className="grid grid-cols-1 gap-2">
            <button
              type="button"
              onClick={() => handleDemoLogin('admin@example.com', 'test123')}
              className="w-full py-2 px-4 border border-transparent text-xs sm:text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors touch-target"
            >
              Login as Admin
            </button>
            <button
              type="button"
              onClick={() => handleDemoLogin('agent@example.com', 'test123')}
              className="w-full py-2 px-4 border border-transparent text-xs sm:text-sm font-medium rounded-md text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 transition-colors touch-target"
            >
              Login as Agent
            </button>
          </div>
        </div>

        {/* Divider */}
        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-gray-300"></div>
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="px-2 bg-gray-50 text-gray-500">Or continue with</span>
          </div>
        </div>

        {/* Login Form */}
        <form className="space-y-4" onSubmit={handleSubmit}>
          {error && (
            <div className="bg-red-100 border border-red-400 text-red-700 px-3 py-2 rounded text-xs">
              {error}
            </div>
          )}
          
          <div className="space-y-3">
            <div>
              <label htmlFor="email" className="sr-only">Email address</label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                className="appearance-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 text-xs sm:text-sm touch-target"
                placeholder="Email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="password" className="sr-only">Password</label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                className="appearance-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 text-xs sm:text-sm touch-target"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          </div>

          <div>
            <button
              type="submit"
              disabled={loading}
              className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-xs sm:text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 transition-colors touch-target"
            >
              {loading ? (
                <span className="flex items-center">
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Signing in...
                </span>
              ) : 'Sign in'}
            </button>
          </div>
          
          {/* Demo credentials info */}
          <div className="text-center text-xs text-gray-600 bg-gray-50 p-3 rounded border">
            <p className="font-medium mb-2">Demo Credentials:</p>
            <div className="space-y-1">
              <p><span className="font-medium">Admin:</span> admin@example.com | test123</p>
              <p><span className="font-medium">Agent:</span> agent@example.com | test123</p>
            </div>
          </div>
        </form>

        {/* Additional Info */}
        <div className="text-center">
          <p className="text-xs text-gray-500">
            Secure login for authorized personnel only
          </p>
        </div>
      </div>
    </div>
  );
};

export default Login;