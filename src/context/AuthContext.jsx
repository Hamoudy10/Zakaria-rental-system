import React, {
  createContext,
  useState,
  useContext,
  useEffect,
  useCallback,
  useMemo,
  useRef
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
  const [loading, setLoading] = useState(true); // Only true during initial session restore
  const [error, setError] = useState(null);
  
  // Use ref to track if we're currently logging in (doesn't trigger re-renders)
  const isLoggingIn = useRef(false);

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
    console.log('🚀 LOGIN FUNCTION START');
    
    // Use ref instead of state to avoid re-renders
    isLoggingIn.current = true;
    
    // Clear any previous errors (but this won't cause unmount since loading doesn't change)
    setError(null);

    try {
      console.log('📡 Making API call...');
      const response = await authAPI.login(credentials);
      console.log('📨 API response received');
      
      // Backend returns: { success: true, token, user, message }
      const responseData = response.data;
      
      if (!responseData.success) {
        console.log('❌ Backend returned success: false');
        isLoggingIn.current = false;
        return {
          success: false,
          message: responseData.message || 'Login failed'
        };
      }
      
      const { user: userData, token: authToken } = responseData;

      // Apply new session
      applyToken(authToken);
      setUser(userData);

      console.log('✅ Login successful:', userData.email);
      isLoggingIn.current = false;
      
      return {
        success: true,
        user: userData,
        message: 'Login successful'
      };
      
    } catch (err) {
      console.error('❌ Login error:', err);
      
      // Extract error message
      let message = 'Login failed. Please try again.';
      
      if (err.response?.data?.message) {
        message = err.response.data.message;
      } else if (err.response?.status === 401) {
        message = 'Invalid email or password';
      } else if (err.response?.status === 404) {
        message = 'Login service unavailable';
      } else if (err.response?.status >= 500) {
        message = 'Server error. Please try again later.';
      } else if (err.code === 'ERR_NETWORK' || err.message?.includes('Network')) {
        message = 'Unable to connect to server. Please check your internet connection.';
      } else if (err.code === 'ECONNABORTED') {
        message = 'Request timed out. Please try again.';
      }
      
      // DON'T set error in AuthContext - let Login component handle it
      // setError(message); // REMOVED - this was causing re-renders
      
      isLoggingIn.current = false;
      
      return {
        success: false,
        message: message
      };
    }
  }, [applyToken]);

  /* -------------------- LOGOUT -------------------- */

  const logout = useCallback(() => {
    setUser(null);
    clearToken();
    setError(null);
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

    // Only set loading during initial session restore, not during login
    if (!isLoggingIn.current) {
      setLoading(true);
    }

    try {
      applyToken(storedToken);

      const response = await authAPI.getProfile();
      const currentUser = response.data?.user || response.data;

      setUser(currentUser);
      console.log('✅ Session restored:', currentUser.email);
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
      console.log('🔄 User data refreshed:', currentUser.email);
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