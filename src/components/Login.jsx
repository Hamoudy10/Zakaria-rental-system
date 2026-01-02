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

  // Login handler (SINGLE source of truth)
  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      console.log('🔐 Starting login process...');
      const result = await login(email, password);
      console.log('✅ Login result:', result);

      if (!result?.success) {
        setError(result?.message || 'Login failed');
        return;
      }

      const user = result.user;

      console.log('👤 Logged in user:', user);

      // Redirect based on role
      if (user.role === 'admin') {
        navigate('/admin-dashboard');
      } else if (user.role === 'agent') {
        navigate('/agent-dashboard');
      } else {
        navigate('/admin-dashboard'); // safe fallback
      }
    } catch (err) {
      console.error('❌ Login error:', err);
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
      <div className="w-full max-w-xs bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="p-4 text-center border-b border-gray-200">
          <div className="flex justify-center mb-2">
            <div className="w-10 h-10 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full flex items-center justify-center">
              <span className="text-white font-bold text-sm">ZR</span>
            </div>
          </div>
          <h1 className="text-lg font-bold text-gray-900">Zakaria Rentals</h1>
          <p className="text-xs text-gray-600 mt-1">
            Property Management System
          </p>
        </div>

        <div className="p-4">
          <form className="space-y-3" onSubmit={handleSubmit}>
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-600 px-3 py-2 rounded text-xs text-center">
                {error}
              </div>
            )}

            <div className="space-y-2">
              <input
                type="email"
                required
                className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
                placeholder="Email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />

              <input
                type="password"
                required
                className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2 px-3 rounded text-sm disabled:opacity-50"
            >
              {loading ? 'Logging in...' : 'Log In'}
            </button>
          </form>

          <div className="relative my-3">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-300" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="px-2 bg-white text-gray-500">OR</span>
            </div>
          </div>

          <div className="space-y-2">
            <button
              type="button"
              onClick={() => handleDemoLogin('admin@example.com', 'test123')}
              className="w-full bg-green-600 hover:bg-green-700 text-white py-2 px-3 rounded text-sm"
            >
              Login as Admin
            </button>
            <button
              type="button"
              onClick={() => handleDemoLogin('agent@example.com', 'test123')}
              className="w-full bg-blue-500 hover:bg-blue-600 text-white py-2 px-3 rounded text-sm"
            >
              Login as Agent
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
