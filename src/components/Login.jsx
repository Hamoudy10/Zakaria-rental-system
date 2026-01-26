import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Mail, Lock, LogIn, AlertCircle, Building2, Loader2 } from 'lucide-react';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showForgotMessage, setShowForgotMessage] = useState(false);
  
  // Company info state
  const [companyInfo, setCompanyInfo] = useState({
    name: 'Zakaria Housing Agency Limited',
    logo: null,
    loading: true
  });

  const { login } = useAuth();
  const navigate = useNavigate();

  // Fetch company info on mount
  useEffect(() => {
    const fetchCompanyInfo = async () => {
      try {
        const response = await fetch(`${import.meta.env.VITE_API_URL || 'https://zakaria-rental-system.onrender.com'}/api/admin/company-info`);
        const data = await response.json();
        
        if (data.success && data.data) {
          setCompanyInfo({
            name: data.data.name || 'Zakaria Housing Agency Limited',
            logo: data.data.logo || null,
            loading: false
          });
        } else {
          setCompanyInfo(prev => ({ ...prev, loading: false }));
        }
      } catch (err) {
        console.log('Could not fetch company info, using defaults');
        setCompanyInfo(prev => ({ ...prev, loading: false }));
      }
    };

    fetchCompanyInfo();
    
    // Check for remembered email
    const rememberedEmail = localStorage.getItem('rememberedEmail');
    if (rememberedEmail) {
      setEmail(rememberedEmail);
      setRememberMe(true);
    }
  }, []);

  // Login handler
  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setShowForgotMessage(false);

    try {
      console.log('🔐 Starting login process...');
      const result = await login({ email, password });
      console.log('✅ Login result:', result);

      if (!result?.success) {
        setError(result?.message || 'Login failed');
        return;
      }

      // Handle remember me
      if (rememberMe) {
        localStorage.setItem('rememberedEmail', email);
      } else {
        localStorage.removeItem('rememberedEmail');
      }

      const user = result.user;
      console.log('👤 Logged in user:', user);

      // Redirect based on role
      if (user.role === 'admin') {
        navigate('/admin-dashboard');
      } else if (user.role === 'agent') {
        navigate('/agent-dashboard');
      } else {
        navigate('/admin-dashboard');
      }
    } catch (err) {
      console.error('❌ Login error:', err);
      setError('An unexpected error occurred during login');
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = () => {
    setShowForgotMessage(true);
    setError('');
  };

  return (
    <div className="min-h-screen flex flex-col justify-center items-center bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 p-4 relative overflow-hidden">
      {/* Animated background elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-blue-500/10 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-purple-500/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }}></div>
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-blue-400/5 rounded-full blur-3xl"></div>
      </div>

      {/* Login Card */}
      <div className="w-full max-w-md relative z-10">
        <div className="bg-white/10 backdrop-blur-xl rounded-2xl shadow-2xl border border-white/20 overflow-hidden transform transition-all duration-300 hover:shadow-blue-500/10">
          
          {/* Header Section */}
          <div className="p-8 text-center bg-gradient-to-b from-white/5 to-transparent">
            {/* Logo */}
            <div className="flex justify-center mb-4">
              <div className="relative group">
                {companyInfo.loading ? (
                  <div className="w-24 h-24 rounded-full bg-white/10 flex items-center justify-center animate-pulse">
                    <Loader2 className="w-8 h-8 text-white/50 animate-spin" />
                  </div>
                ) : companyInfo.logo ? (
                  <div className="w-24 h-24 rounded-full overflow-hidden ring-4 ring-white/20 shadow-xl transform transition-all duration-300 group-hover:scale-105 group-hover:ring-blue-400/50">
                    <img 
                      src={companyInfo.logo} 
                      alt="Company Logo" 
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        e.target.style.display = 'none';
                        e.target.nextSibling.style.display = 'flex';
                      }}
                    />
                    <div className="w-full h-full bg-gradient-to-br from-blue-500 to-blue-700 items-center justify-center hidden">
                      <Building2 className="w-10 h-10 text-white" />
                    </div>
                  </div>
                ) : (
                  <div className="w-24 h-24 rounded-full bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center ring-4 ring-white/20 shadow-xl transform transition-all duration-300 group-hover:scale-105 group-hover:ring-blue-400/50">
                    <Building2 className="w-10 h-10 text-white" />
                  </div>
                )}
                {/* Glow effect */}
                <div className="absolute inset-0 rounded-full bg-blue-400/20 blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 -z-10"></div>
              </div>
            </div>

            {/* Company Name */}
            <h1 className="text-xl font-bold text-white mb-1">
              {companyInfo.name}
            </h1>
            <p className="text-blue-200/80 text-sm">
              Property Management System
            </p>
          </div>

          {/* Form Section */}
          <div className="p-8 pt-2">
            <form className="space-y-5" onSubmit={handleSubmit}>
              {/* Error Message */}
              {error && (
                <div className="bg-red-500/10 border border-red-500/30 text-red-200 px-4 py-3 rounded-xl text-sm flex items-center gap-2 animate-shake">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {/* Forgot Password Message */}
              {showForgotMessage && (
                <div className="bg-blue-500/10 border border-blue-500/30 text-blue-200 px-4 py-3 rounded-xl text-sm flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>Please contact the administrator to reset your password.</span>
                </div>
              )}

              {/* Email Input */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-blue-100/80 block">
                  Email Address
                </label>
                <div className="relative group">
                  <input
                    type="email"
                    required
                    className="w-full pl-4 pr-11 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-blue-200/30 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all duration-200 hover:bg-white/10"
                    placeholder="Enter your email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                  <div className="absolute inset-y-0 right-0 pr-3.5 flex items-center pointer-events-none">
                    <Mail className="h-5 w-5 text-blue-300/50 group-focus-within:text-blue-400 transition-colors" />
                  </div>
                </div>
              </div>

              {/* Password Input */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-blue-100/80 block">
                  Password
                </label>
                <div className="relative group">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    className="w-full pl-4 pr-20 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-blue-200/30 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all duration-200 hover:bg-white/10"
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <div className="absolute inset-y-0 right-0 pr-3.5 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="text-blue-300/50 hover:text-blue-300 transition-colors"
                    >
                      {showPassword ? (
                        <EyeOff className="h-5 w-5" />
                      ) : (
                        <Eye className="h-5 w-5" />
                      )}
                    </button>
                    <Lock className="h-5 w-5 text-blue-300/50 group-focus-within:text-blue-400 transition-colors pointer-events-none" />
                  </div>
                </div>
              </div>

              {/* Remember Me & Forgot Password */}
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 cursor-pointer group">
                  <div className="relative">
                    <input
                      type="checkbox"
                      checked={rememberMe}
                      onChange={(e) => setRememberMe(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-5 h-5 bg-white/5 border border-white/20 rounded-md peer-checked:bg-blue-500 peer-checked:border-blue-500 transition-all duration-200 flex items-center justify-center">
                      {rememberMe && (
                        <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </div>
                  </div>
                  <span className="text-sm text-blue-200/70 group-hover:text-blue-200 transition-colors">
                    Remember me
                  </span>
                </label>

                <button
                  type="button"
                  onClick={handleForgotPassword}
                  className="text-sm text-blue-400 hover:text-blue-300 transition-colors hover:underline"
                >
                  Forgot password?
                </button>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={loading}
                className="w-full relative bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white py-3.5 px-4 rounded-xl font-semibold shadow-lg shadow-blue-500/25 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 transform active:scale-[0.98] hover:shadow-xl hover:shadow-blue-500/30 group overflow-hidden"
              >
                <span className={`flex items-center justify-center gap-2 transition-all duration-200 ${loading ? 'opacity-0' : 'opacity-100'}`}>
                  <LogIn className="w-5 h-5 transition-transform group-hover:translate-x-0.5" />
                  Sign In
                </span>
                {loading && (
                  <span className="absolute inset-0 flex items-center justify-center">
                    <Loader2 className="w-5 h-5 animate-spin" />
                  </span>
                )}
                {/* Button shine effect */}
                <div className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-700 bg-gradient-to-r from-transparent via-white/10 to-transparent"></div>
              </button>
            </form>
          </div>

          {/* Footer */}
          <div className="px-8 pb-6 text-center">
            <p className="text-blue-200/40 text-xs">
              © {new Date().getFullYear()} {companyInfo.name}. All rights reserved.
            </p>
          </div>
        </div>

        {/* Security Badge */}
        <div className="mt-6 flex justify-center">
          <div className="flex items-center gap-2 text-blue-200/40 text-xs bg-white/5 px-4 py-2 rounded-full backdrop-blur-sm">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
            <span>Secured with SSL encryption</span>
          </div>
        </div>
      </div>

      {/* Custom styles for animations */}
      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          10%, 30%, 50%, 70%, 90% { transform: translateX(-4px); }
          20%, 40%, 60%, 80% { transform: translateX(4px); }
        }
        .animate-shake {
          animation: shake 0.5s ease-in-out;
        }
      `}</style>
    </div>
  );
};

export default Login;