import React, {
  createContext,
  useState,
  useContext,
  useEffect,
  useCallback,
  useMemo
} from 'react';
import api, { authAPI } from '../services/api';

const AuthContext = createContext(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(() => localStorage.getItem('token'));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const isAuthenticated = useCallback(
    () => !!user && !!token,
    [user, token]
  );

  /* -------------------- TOKEN SYNC HELPERS -------------------- */

  const applyToken = useCallback((authToken) => {
    if (authToken) {
      api.defaults.headers.common.Authorization = `Bearer ${authToken}`;
      localStorage.setItem('token', authToken);
      setToken(authToken);
    }
  }, []);

  const clearToken = useCallback(() => {
    delete api.defaults.headers.common.Authorization;
    localStorage.removeItem('token');
    setToken(null);
  }, []);

  /* -------------------- LOGIN -------------------- */

  const login = useCallback(async (credentials) => {
  console.log('🚀 LOGIN FUNCTION START - checking if old or new version');
  console.log('🔍 Will clearToken be called before API? Check next log...');
  
    setLoading(true);
    setError(null);

    try {
      // DON'T clear token/user before API call - wait for result
      const response = await authAPI.login(credentials);
      
      // Check if response indicates success
      if (!response.data || !response.data.token || !response.data.user) {
        const message = response.data?.message || 'Invalid response from server';
        setError(message);
        return { success: false, message };
      }

      const { user: userData, token: authToken } = response.data;

      // Only clear old session and apply new one after successful login
      clearToken();
      setUser(null);
      
      applyToken(authToken);
      setUser(userData);

      console.log('✅ Login successful:', userData);
      return { success: true, user: userData };
      
    } catch (err) {
      console.error('❌ Login error:', err);
      
      // Extract error message from response
      let message = 'Login failed. Please try again.';
      
      if (err.response?.data?.message) {
        message = err.response.data.message;
      } else if (err.response?.status === 401) {
        message = 'Invalid email or password';
      } else if (err.response?.status === 403) {
        message = 'Your account has been deactivated. Please contact the administrator.';
      } else if (err.response?.status === 404) {
        message = 'Login service not available. Please try again later.';
      } else if (err.response?.status >= 500) {
        message = 'Server error. Please try again later.';
      } else if (err.code === 'ECONNABORTED' || err.message?.includes('timeout')) {
        message = 'Connection timed out. Please check your internet and try again.';
      } else if (err.message?.includes('Network') || err.message?.includes('network')) {
        message = 'Network error. Please check your internet connection.';
      } else if (err.message) {
        message = err.message;
      }
      
      setError(message);
      
      // Return error object instead of throwing
      return { success: false, message };
      
    } finally {
      setLoading(false);
    }
  }, [applyToken, clearToken]);

  /* -------------------- LOGOUT -------------------- */

  const logout = useCallback(() => {
    setUser(null);
    clearToken();
    console.log('🚪 Logged out');
  }, [clearToken]);

  /* -------------------- RESTORE SESSION -------------------- */

  const fetchCurrentUser = useCallback(async () => {
    const storedToken = localStorage.getItem('token');

    if (!storedToken) {
      setUser(null);
      setToken(null);
      setLoading(false);
      return;
    }

    setLoading(true);

    try {
      applyToken(storedToken);

      const response = await authAPI.getProfile();
      const currentUser = response.data?.user || response.data;

      setUser(currentUser);
      console.log('✅ Session restored:', currentUser);
    } catch (err) {
      console.error('❌ Failed to restore session:', err);
      setUser(null);
      clearToken();
    } finally {
      setLoading(false);
    }
  }, [applyToken, clearToken]);

  /* -------------------- UPDATE PROFILE -------------------- */

  const updateUserProfile = useCallback(async (profileData) => {
    try {
      console.log('📝 Updating user profile...');
      const response = await authAPI.updateProfile(profileData);
      
      if (response.data.success && response.data.user) {
        setUser(response.data.user);
        console.log('✅ Profile updated:', response.data.user);
        return response.data;
      }
      
      return response.data;
    } catch (err) {
      console.error('❌ Profile update error:', err);
      throw err;
    }
  }, []);

  /* -------------------- REFRESH USER DATA -------------------- */

  const refreshUser = useCallback(async () => {
    try {
      const response = await authAPI.getProfile();
      const currentUser = response.data?.user || response.data;
      setUser(currentUser);
      console.log('🔄 User data refreshed:', currentUser);
      return currentUser;
    } catch (err) {
      console.error('❌ Failed to refresh user:', err);
      throw err;
    }
  }, []);

  /* -------------------- INIT -------------------- */

  useEffect(() => {
    fetchCurrentUser();
  }, [fetchCurrentUser]);

  /* -------------------- CONTEXT VALUE -------------------- */

  const value = useMemo(() => ({
    user,
    token,
    loading,
    error,
    isAuthenticated,
    login,
    logout,
    setUser,
    setToken,
    updateUserProfile,
    refreshUser,
    clearError: () => setError(null),
  }), [
    user,
    token,
    loading,
    error,
    isAuthenticated,
    login,
    logout,
    updateUserProfile,
    refreshUser
  ]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};