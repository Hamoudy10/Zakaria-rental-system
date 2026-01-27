import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Mail, Lock, LogIn, AlertCircle, Building2, Loader2, XCircle, WifiOff, ShieldX, UserX } from 'lucide-react';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null); // Changed to object: { type, message }
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
        const response = await fetch(`${import.meta.env.VITE_API_URL || 'https://zakaria-rental-system.onrender.com'}/api/admin/public/company-info`);
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

  // Clear error after 15 seconds
  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(null), 15000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  // Determine error type for styling and icons
  const getErrorDetails = (message) => {
    const lowerMessage = message.toLowerCase();
    
    if (lowerMessage.includes('network') || lowerMessage.includes('internet') || lowerMessage.includes('connection')) {
      return {
        type: 'network',
        icon: WifiOff,
        title: 'Connection Error',
        color: 'orange'
      };
    }
    
    if (lowerMessage.includes('deactivated') || lowerMessage.includes('inactive') || lowerMessage.includes('disabled')) {
      return {
        type: 'inactive',
        icon: ShieldX,
        title: 'Account Inactive',
        color: 'red'
      };
    }
    
    if (lowerMessage.includes('not found') || lowerMessage.includes('no account')) {
      return {
        type: 'not_found',
        icon: UserX,
        title: 'Account Not Found',
        color: 'red'
      };
    }
    
    if (lowerMessage.includes('invalid') || lowerMessage.includes('incorrect') || lowerMessage.includes('password')) {
      return {
        type: 'credentials',
        icon: XCircle,
        title: 'Invalid Credentials',
        color: 'red'
      };
    }
    
    if (lowerMessage.includes('server') || lowerMessage.includes('500')) {
      return {
        type: 'server',
        icon: AlertCircle,
        title: 'Server Error',
        color: 'yellow'
      };
    }
    
    return {
      type: 'generic',
      icon: AlertCircle,
      title: 'Login Failed',
      color: 'red'
    };
  };

// Login handler
const handleSubmit = async (e) => {
  e.preventDefault();
  console.log('📝 FORM SUBMITTED - preventDefault called');
  
  // Clear previous errors
  setError(null);
  setShowForgotMessage(false);
  
  // Validate inputs
  if (!email.trim()) {
    console.log('❌ Validation failed: no email');
    setError({
      type: 'validation',
      title: 'Email Required',
      message: 'Please enter your email address'
    });
    return;
  }
  
  if (!password) {
    console.log('❌ Validation failed: no password');
    setError({
      type: 'validation',
      title: 'Password Required',
      message: 'Please enter your password'
    });
    return;
  }
  
  // Basic email format validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email.trim())) {
    console.log('❌ Validation failed: invalid email format');
    setError({
      type: 'validation',
      title: 'Invalid Email',
      message: 'Please enter a valid email address'
    });
    return;
  }

  setLoading(true);
  console.log('🔐 Starting login process...');

  try {
    const result = await login({ email: email.trim().toLowerCase(), password });
    console.log('📦 Login result:', result);

    if (!result.success) {
      console.log('⚠️ Login failed, setting error state...');
      
      // Determine error details for better UX
      const errorDetails = getErrorDetails(result.message);
      
      setError({
        type: errorDetails.type,
        title: errorDetails.title,
        message: result.message,
        icon: errorDetails.icon,
        color: errorDetails.color
      });
      
      setLoading(false);
      console.log('✅ Error state set, returning (NO NAVIGATION)');
      return; // <-- IMPORTANT: Should stop here
    }

    console.log('✅ Login successful, proceeding to navigate...');

    // Handle remember me
    if (rememberMe) {
      localStorage.setItem('rememberedEmail', email.trim().toLowerCase());
    } else {
      localStorage.removeItem('rememberedEmail');
    }

    const user = result.user;
    console.log('👤 Logged in user:', user);

    // Redirect based on role
    if (user.role === 'admin') {
      console.log('🚀 Navigating to admin dashboard...');
      navigate('/admin-dashboard');
    } else if (user.role === 'agent') {
      console.log('🚀 Navigating to agent dashboard...');
      navigate('/agent-dashboard');
    } else {
      console.log('🚀 Navigating to admin dashboard (default)...');
      navigate('/admin-dashboard');
    }
  } catch (err) {
    console.error('❌ Unexpected login error:', err);
    
    setError({
      type: 'unexpected',
      title: 'Unexpected Error',
      message: 'An unexpected error occurred. Please try again.',
      icon: AlertCircle,
      color: 'red'
    });
  } finally {
    setLoading(false);
    console.log('🏁 handleSubmit finally block - loading set to false');
  }
};

  const handleForgotPassword = (e) => {
    e.preventDefault();
    setShowForgotMessage(true);
    setError(null);
  };

  const clearError = () => {
    setError(null);
  };

  // Get error styling based on color
  const getErrorStyles = (color) => {
    switch (color) {
      case 'orange':
        return {
          bg: 'bg-orange-500/20',
          border: 'border-orange-500/50',
          text: 'text-orange-200',
          subtext: 'text-orange-300/90',
          iconColor: 'text-orange-400'
        };
      case 'yellow':
        return {
          bg: 'bg-yellow-500/20',
          border: 'border-yellow-500/50',
          text: 'text-yellow-200',
          subtext: 'text-yellow-300/90',
          iconColor: 'text-yellow-400'
        };
      default:
        return {
          bg: 'bg-red-500/20',
          border: 'border-red-500/50',
          text: 'text-red-200',
          subtext: 'text-red-300/90',
          iconColor: 'text-red-400'
        };
    }
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
              {/* Error Message - Enhanced */}
              {error && (
                <div 
                  className={`${getErrorStyles(error.color).bg} border ${getErrorStyles(error.color).border} ${getErrorStyles(error.color).text} px-4 py-3 rounded-xl text-sm animate-shake`}
                  role="alert"
                >
                  <div className="flex items-start gap-3">
                    {error.icon ? (
                      <error.icon className={`w-5 h-5 flex-shrink-0 mt-0.5 ${getErrorStyles(error.color).iconColor}`} />
                    ) : (
                      <AlertCircle className={`w-5 h-5 flex-shrink-0 mt-0.5 ${getErrorStyles(error.color).iconColor}`} />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold">{error.title}</p>
                      <p className={`${getErrorStyles(error.color).subtext} text-xs mt-1`}>{error.message}</p>
                      
                      {/* Helpful hints based on error type */}
                      {error.type === 'credentials' && (
                        <p className="text-xs mt-2 opacity-75">
                          💡 Check your email and password, then try again.
                        </p>
                      )}
                      {error.type === 'network' && (
                        <p className="text-xs mt-2 opacity-75">
                          💡 Check your internet connection and try again.
                        </p>
                      )}
                      {error.type === 'inactive' && (
                        <p className="text-xs mt-2 opacity-75">
                          💡 Contact your administrator to reactivate your account.
                        </p>
                      )}
                      {error.type === 'server' && (
                        <p className="text-xs mt-2 opacity-75">
                          💡 The server is experiencing issues. Please try again in a few minutes.
                        </p>
                      )}
                    </div>
                    <button 
                      type="button"
                      onClick={clearError}
                      className={`${getErrorStyles(error.color).subtext} hover:text-white transition-colors p-1`}
                      aria-label="Dismiss error"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                </div>
              )}

              {/* Forgot Password Message */}
              {showForgotMessage && (
                <div className="bg-blue-500/20 border border-blue-500/50 text-blue-200 px-4 py-3 rounded-xl text-sm flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="font-medium">Password Reset</p>
                    <p className="text-blue-300/90 text-xs mt-1">Please contact the administrator to reset your password.</p>
                  </div>
                  <button 
                    type="button"
                    onClick={() => setShowForgotMessage(false)}
                    className="text-blue-300 hover:text-white transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
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
                    className={`w-full pl-4 pr-11 py-3 bg-white/5 border rounded-xl text-white placeholder-blue-200/30 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all duration-200 hover:bg-white/10 ${
                      error && (error.type === 'validation' && error.title.includes('Email')) || error?.type === 'not_found' || error?.type === 'credentials'
                        ? 'border-red-500/50 bg-red-500/5' 
                        : 'border-white/10'
                    }`}
                    placeholder="Enter your email"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      if (error) setError(null);
                    }}
                    disabled={loading}
                    autoComplete="email"
                  />
                  <div className="absolute inset-y-0 right-0 pr-3.5 flex items-center pointer-events-none">
                    <Mail className={`h-5 w-5 transition-colors ${
                      error && (error.type === 'validation' && error.title.includes('Email')) || error?.type === 'not_found' || error?.type === 'credentials'
                        ? 'text-red-400' 
                        : 'text-blue-300/50 group-focus-within:text-blue-400'
                    }`} />
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
                    className={`w-full pl-4 pr-20 py-3 bg-white/5 border rounded-xl text-white placeholder-blue-200/30 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all duration-200 hover:bg-white/10 ${
                      error && (error.type === 'validation' && error.title.includes('Password')) || error?.type === 'credentials'
                        ? 'border-red-500/50 bg-red-500/5' 
                        : 'border-white/10'
                    }`}
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      if (error) setError(null);
                    }}
                    disabled={loading}
                    autoComplete="current-password"
                  />
                  <div className="absolute inset-y-0 right-0 pr-3.5 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="text-blue-300/50 hover:text-blue-300 transition-colors disabled:opacity-50"
                      tabIndex={-1}
                      disabled={loading}
                    >
                      {showPassword ? (
                        <EyeOff className="h-5 w-5" />
                      ) : (
                        <Eye className="h-5 w-5" />
                      )}
                    </button>
                    <Lock className={`h-5 w-5 pointer-events-none transition-colors ${
                      error && (error.type === 'validation' && error.title.includes('Password')) || error?.type === 'credentials'
                        ? 'text-red-400' 
                        : 'text-blue-300/50 group-focus-within:text-blue-400'
                    }`} />
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
                      disabled={loading}
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
                  className="text-sm text-blue-400 hover:text-blue-300 transition-colors hover:underline disabled:opacity-50"
                  disabled={loading}
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
                  <span className="absolute inset-0 flex items-center justify-center gap-2">
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span className="text-sm">Signing in...</span>
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