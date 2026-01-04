import React, { createContext, useContext, useState } from 'react';
import { authAPI } from '../services/api';
import { saveSession, removeSession, getSession } from '../auth/sessionStorage';

const SessionAuthContext = createContext(null);

export const useSessionAuth = (sessionId) => {
  const ctx = useContext(SessionAuthContext);
  if (!ctx) throw new Error('useSessionAuth must be used inside SessionAuthProvider');
  return ctx(sessionId);
};

export const SessionAuthProvider = ({ children }) => {
  const [_, forceRender] = useState(0);

  const refresh = () => forceRender(x => x + 1);

  const getSessionAuth = (sessionId) => {
    const session = getSession(sessionId);

    return {
      user: session?.user || null,
      token: session?.token || null,
      isAuthenticated: !!session?.token,

      async login(credentials) {
        const res = await authAPI.login(credentials);
        saveSession(sessionId, res.data);
        refresh();
        return res.data;
      },

      logout() {
        removeSession(sessionId);
        refresh();
      }
    };
  };

  return (
    <SessionAuthContext.Provider value={getSessionAuth}>
      {children}
    </SessionAuthContext.Provider>
  );
};
