const STORAGE_KEY = 'videobot_admin_api_key';

/** Key from session (production) or .env in local dev only. */
export function getAdminApiKey() {
  const stored = sessionStorage.getItem(STORAGE_KEY);
  if (stored) {
    return stored;
  }
  if (import.meta.env.DEV && import.meta.env.VITE_ADMIN_API_KEY) {
    return import.meta.env.VITE_ADMIN_API_KEY;
  }
  return '';
}

export function setAdminApiKey(key) {
  sessionStorage.setItem(STORAGE_KEY, String(key).trim());
}

export function clearAdminApiKey() {
  sessionStorage.removeItem(STORAGE_KEY);
}

export function isAuthenticated() {
  return Boolean(getAdminApiKey());
}
