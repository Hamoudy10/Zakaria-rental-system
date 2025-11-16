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
    <div className="min-h-screen flex flex-col justify-center items-center bg-gray-50 p-4 safe-area-top safe-area-bottom">
      {/* Main Login Card - Extremely Compact */}
      <div className="w-full max-w-xs bg-white rounded-lg shadow-sm border border-gray-200">
        {/* Header - Very Compact */}
        <div className="p-4 text-center border-b border-gray-200">
          <div className="flex justify-center mb-2">
            <div className="w-10 h-10 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full flex items-center justify-center">
              <span className="text-white font-bold text-sm">ZR</span>
            </div>
          </div>
          <h1 className="text-lg font-bold text-gray-900">Zakaria Rentals</h1>
          <p className="text-xs text-gray-600 mt-1">Property Management System</p>
        </div>

        {/* Form Section - Ultra Compact */}
        <div className="p-4">
          <form className="space-y-3" onSubmit={handleSubmit}>
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-600 px-3 py-2 rounded text-xs text-center">
                {error}
              </div>
            )}
            
            <div className="space-y-2">
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2 px-3 rounded font-medium text-sm transition-colors disabled:opacity-50"
            >
              {loading ? 'Logging in...' : 'Log In'}
            </button>
          </form>

          {/* Divider - Minimal Space */}
          <div className="relative my-3">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-300"></div>
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="px-2 bg-white text-gray-500">OR</span>
            </div>
          </div>

          {/* Quick Login Buttons - Compact */}
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => handleDemoLogin('admin@example.com', 'test123')}
              className="w-full bg-green-600 hover:bg-green-700 text-white py-2 px-3 rounded text-sm font-medium transition-colors"
            >
              Login as Admin
            </button>
            <button
              type="button"
              onClick={() => handleDemoLogin('agent@example.com', 'test123')}
              className="w-full bg-blue-500 hover:bg-blue-600 text-white py-2 px-3 rounded text-sm font-medium transition-colors"
            >
              Login as Agent
            </button>
          </div>
        </div>
      </div>

      {/* Demo Info - Very Compact */}
      <div className="w-full max-w-xs mt-3 bg-white rounded-lg border border-gray-200 p-3">
        <div className="text-center">
          <p className="text-xs text-gray-600 font-medium mb-2">Demo Credentials</p>
          <div className="text-xs text-gray-500 space-y-1">
            <div className="flex justify-between">
              <span>Admin:</span>
              <code className="bg-gray-100 px-1 rounded">admin@example.com</code>
            </div>
            <div className="flex justify-between">
              <span>Agent:</span>
              <code className="bg-gray-100 px-1 rounded">agent@example.com</code>
            </div>
            <div className="text-center">
              <span>Password: </span>
              <code className="bg-gray-100 px-1 rounded">test123</code>
            </div>
          </div>
        </div>
      </div>

      {/* Footer - Minimal */}
      <div className="w-full max-w-xs text-center mt-3">
        <p className="text-xs text-gray-400">
          &copy; {new Date().getFullYear()} Zakaria Rentals
        </p>
      </div>
    </div>
  );
};

export default Login;