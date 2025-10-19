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
      
      console.log('Auth check - Token exists:', !!token);
      console.log('Auth check - Stored user exists:', !!storedUser);
      
      // If no token or user, clear and exit
      if (!token || !storedUser) {
        console.log('No token or user found, clearing auth');
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        setUser(null);
        setLoading(false);
        return;
      }

      // Validate token structure (basic check)
      try {
        const tokenParts = token.split('.');
        if (tokenParts.length !== 3) {
          throw new Error('Invalid token format');
        }
      } catch (tokenError) {
        console.error('Token format invalid:', tokenError);
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        setUser(null);
        setLoading(false);
        return;
      }

      // Try to validate token with backend
      try {
        // Set auth header for all future requests
        authAPI.defaults.headers.common['Authorization'] = `Bearer ${token}`;
        
        // Verify token with backend (you might need to create this endpoint)
        const response = await authAPI.get('/verify-token');
        console.log('Token validation response:', response.data);
        
        const userData = JSON.parse(storedUser);
        setUser(userData);
      } catch (validationError) {
        console.error('Token validation failed:', validationError);
        // Token is invalid, clear everything
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        delete authAPI.defaults.headers.common['Authorization'];
        setUser(null);
      }
    } catch (error) {
      console.error('Auth check failed:', error);
      // Clear any corrupted data
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  const login = async (email, password) => {
    try {
      console.log('Attempting login with:', { email });
      
      // Clear any existing auth headers
      delete authAPI.defaults.headers.common['Authorization'];
      
      const response = await authAPI.post('/login', { email, password });
      console.log('Login response:', response.data);
      
      const { user, token } = response.data;
      
      // Validate data before storing
      if (!user || !token) {
        throw new Error('Invalid response from server');
      }
      
      // Store in localStorage
      localStorage.setItem('token', token);
      localStorage.setItem('user', JSON.stringify(user));
      
      // Set auth header for future requests
      authAPI.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      
      setUser(user);
      
      console.log('Login successful, user stored:', user);
      
      return { success: true, user };
    } catch (error) {
      console.error('Login failed:', error);
      // Clear on failure
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      delete authAPI.defaults.headers.common['Authorization'];
      
      const errorMessage = error.response?.data?.message || 
                          error.message || 
                          'Login failed';
      return { 
        success: false, 
        message: errorMessage 
      };
    }
  };

  const register = async (userData) => {
    try {
      const response = await authAPI.post('/register', userData);
      const { user, token } = response.data;
      
      localStorage.setItem('token', token);
      localStorage.setItem('user', JSON.stringify(user));
      authAPI.defaults.headers.common['Authorization'] = `Bearer ${token}`;
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
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    delete authAPI.defaults.headers.common['Authorization'];
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