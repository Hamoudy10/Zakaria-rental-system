import React, { createContext, useState, useContext, useEffect } from 'react';
import { authAPI } from '../services/api';

const AuthContext = createContext();

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      const token = localStorage.getItem('token');
      const storedUser = localStorage.getItem('user');
      
      console.log('🔐 TEMPORARY FIX - Auth check');
      console.log('🔐 Token exists:', !!token);
      console.log('🔐 Stored user exists:', !!storedUser);

      // TEMPORARY FIX: Skip backend verification for now
      if (token && storedUser) {
        try {
          console.log('🔄 TEMPORARY: Using stored user without backend verification');
          const userData = JSON.parse(storedUser);
          setUser(userData);
          
          // Set auth header for future requests
          if (authAPI && authAPI.defaults && authAPI.defaults.headers) {
            authAPI.defaults.headers.common['Authorization'] = `Bearer ${token}`;
          }
        } catch (parseError) {
          console.error('❌ Error parsing stored user:', parseError);
          localStorage.removeItem('token');
          localStorage.removeItem('user');
          setUser(null);
        }
      } else {
        console.log('🚫 No credentials found');
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        setUser(null);
      }
    } catch (error) {
      console.error('❌ Auth check failed:', error);
      // Clear any corrupted data
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      setUser(null);
    } finally {
      console.log('✅ Auth check complete');
      setLoading(false);
    }
  };

  const login = async (email, password) => {
    try {
      console.log('🔐 Attempting login with:', { email });
      
      // Clear any existing auth data first
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      if (authAPI && authAPI.defaults && authAPI.defaults.headers) {
        delete authAPI.defaults.headers.common['Authorization'];
      }

        // FIX: Make sure we're sending proper JSON object
      const credentials = { 
        email: email.trim(), 
        password: password 
      };
      console.log('🔄 Sending login request with credentials:', credentials);

      
      const response = await authAPI.login(credentials);
      console.log('✅ Login response received', response);
      
      const { user, token } = response;
      
      if (!user || !token) {
        throw new Error('Invalid response from server - missing user or token');
      }
      
      // Store in localStorage
      localStorage.setItem('token', token);
      localStorage.setItem('user', JSON.stringify(user));
      
      // Set auth header for future requests
      if (authAPI && authAPI.defaults && authAPI.defaults.headers) {
        authAPI.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      }
      
      setUser(user);
      
      console.log('✅ Login successful, user:', user);
      
      return { success: true, user };
    } catch (error) {
      console.error('❌ Login failed:', error);
      
      // Clear on failure
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      if (authAPI && authAPI.defaults && authAPI.defaults.headers) {
        delete authAPI.defaults.headers.common['Authorization'];
      }
      setUser(null);
      
      // Better error handling
      let errorMessage = 'Login failed';
      if (error.code === 'ERR_NETWORK') {
        errorMessage = 'Cannot connect to server. Please make sure the backend is running.';
      } else if (error.response?.data?.message) {
        errorMessage = error.response.data.message;
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      return { 
        success: false, 
        message: errorMessage 
      };
    }
  };

  const register = async (userData) => {
    try {
      const response = await authAPI.register(userData);
      const { user, token } = response;
      
      localStorage.setItem('token', token);
      localStorage.setItem('user', JSON.stringify(user));
      
      if (authAPI && authAPI.defaults && authAPI.defaults.headers) {
        authAPI.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      }
      
      setUser(user);
      
      return { success: true };
    } catch (error) {
      console.error('Registration failed:', error);
      return { 
        success: false, 
        message: error.response?.data?.message || 'Registration failed' 
      };
    }
  };

  const logout = () => {
    console.log('🚪 Logging out');
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    
    if (authAPI && authAPI.defaults && authAPI.defaults.headers) {
      delete authAPI.defaults.headers.common['Authorization'];
    }
    
    setUser(null);
  };

  const value = {
    user,
    login,
    register,
    logout,
    loading
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};