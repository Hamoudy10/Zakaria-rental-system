const STORAGE_KEY = 'auth:sessions';

export const getSessions = () => {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
  } catch {
    return {};
  }
};

export const getSession = (sessionId) => {
  return getSessions()[sessionId] || null;
};

export const saveSession = (sessionId, data) => {
  const sessions = getSessions();
  sessions[sessionId] = data;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
};

export const removeSession = (sessionId) => {
  const sessions = getSessions();
  delete sessions[sessionId];
  localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
};
