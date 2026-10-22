// Where the backend API lives. Set VITE_API_BASE_URL at build time, e.g. in Vercel:
//   VITE_API_BASE_URL=https://your-api.onrender.com/api
// Falls back to the local dev server. Trailing slashes are removed.
export const API_BASE_URL: string = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:5125/api').replace(/\/+$/, '');
