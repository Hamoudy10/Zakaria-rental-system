import React, { createContext, useState, useContext, useEffect, useRef } from 'react';
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
  const initializedRef = useRef(false);

  useEffect(() => {
    // Only run once on mount
    if (initializedRef.current) return;
    initializedRef.current = true;
    
    const initializeAuth = async () => {
      try {
        const token = localStorage.getItem('token');
        const storedUser = localStorage.getItem('user');
        
        console.log('🔐 Initial auth check');
        
        if (token && storedUser) {
          try {
            const userData = JSON.parse(storedUser);
            console.log('🔄 Setting user from localStorage');
            setUser(userData);
            
            if (authAPI?.defaults?.headers) {
              authAPI.defaults.headers.common['Authorization'] = `Bearer ${token}`;
            }
          } catch (parseError) {
            console.error('❌ Error parsing stored user:', parseError);
            clearAuthData();
          }
        } else {
          console.log('🚫 No stored credentials found');
          setUser(null);
        }
      } catch (error) {
        console.error('❌ Auth initialization failed:', error);
        clearAuthData();
      } finally {
        console.log('✅ Auth initialization complete');
        setLoading(false);
      }
    };

    initializeAuth();
  }, []); // Empty dependency array - runs only once on mount

  const clearAuthData = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
    
    if (authAPI?.defaults?.headers) {
      delete authAPI.defaults.headers.common['Authorization'];
    }
  };

  const login = async (email, password) => {
    try {
      console.log('🔐 Attempting login');
      
      // Clear any existing auth data first
      clearAuthData();

      const credentials = { 
        email: email.trim(), 
        password: password 
      };

      const response = await authAPI.login(credentials);
      console.log('✅ Login response received');
      
      const { user, token } = response.data;

      if (!user || !token) {
        throw new Error('Invalid response from server - missing user or token');
      }
      
      // Store in localStorage
      localStorage.setItem('token', token);
      localStorage.setItem('user', JSON.stringify(user));
      
      // Set auth header for future requests
      if (authAPI?.defaults?.headers) {
        authAPI.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      }
      
      setUser(user);
      
      console.log('✅ Login successful');
      
      return { success: true, user };
    } catch (error) {
      console.error('❌ Login failed:', error);
      clearAuthData();
      
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
      
      if (authAPI?.defaults?.headers) {
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
    clearAuthData();
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