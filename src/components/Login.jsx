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

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      console.log('Starting login process...');
      
      const result = await login(email, password);
      console.log('Login result:', result);
      
      if (result.success) {
        console.log('Login successful, redirecting...');
        
        // Use the user from the result instead of localStorage
        const user = result.user;
        
        // Redirect based on user role
        if (user.role === 'admin') {
          navigate('/admin');
        } else if (user.role === 'agent') {
          navigate('/agent');
        } else {
          navigate('/tenant');
        }
      } else {
        setError(result.message || 'Login failed');
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
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
            Zakaria Rental System
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            Sign in to your account
          </p>
        </div>
        
        {/* Demo Account Buttons */}
        <div className="space-y-3">
          <h3 className="text-center text-sm font-medium text-gray-700">Quick Demo Login:</h3>
          <div className="grid grid-cols-1 gap-2">
            <button
              type="button"
              onClick={() => handleDemoLogin('admin@example.com', 'test123')}
              className="w-full py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              Login as Admin
            </button>
            <button
              type="button"
              onClick={() => handleDemoLogin('agent@example.com', 'test123')}
              className="w-full py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
            >
              Login as Agent
            </button>
            <button
              type="button"
              onClick={() => handleDemoLogin('tenant@example.com', 'test123')}
              className="w-full py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-purple-600 hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500"
            >
              Login as Tenant
            </button>
          </div>
        </div>

        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          {error && (
            <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
              {error}
            </div>
          )}
          <div className="rounded-md shadow-sm -space-y-px">
            <div>
              <input
                type="email"
                required
                className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-t-md focus:outline-none focus:ring-primary-500 focus:border-primary-500 focus:z-10 sm:text-sm"
                placeholder="Email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div>
              <input
                type="password"
                required
                className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-b-md focus:outline-none focus:ring-primary-500 focus:border-primary-500 focus:z-10 sm:text-sm"
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
              className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:opacity-50"
            >
              {loading ? 'Signing in...' : 'Sign in'}
            </button>
          </div>
          
          {/* Demo credentials info */}
          <div className="text-center text-sm text-gray-600 bg-gray-50 p-3 rounded border">
            <p className="font-medium mb-2">Demo Credentials:</p>
            <div className="space-y-1 text-xs">
              <p><span className="font-medium">Admin:</span> admin@example.com | test123</p>
              <p><span className="font-medium">Agent:</span> agent@example.com | test123</p>
              <p><span className="font-medium">Tenant:</span> tenant@example.com | test123</p>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

export default Login;