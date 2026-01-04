import axios from 'axios';

/**
 * Creates an isolated Axios instance for a single authenticated session.
 * This prevents token collisions between admin / agent sessions.
 */
export const createSessionApi = (token) => {
  if (!token) return null;

  return axios.create({
    baseURL: import.meta.env.VITE_API_URL || 'https://zakaria-rental-system.onrender.com/api',
    timeout: 30000,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
  });
};
