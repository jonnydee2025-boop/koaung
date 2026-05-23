/**
 * Shared HTTP client for the admin API.
 */
import { getAdminApiKey, clearAdminApiKey } from './adminAuth';

export const API_BASE = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');

export function apiHeaders(extra = {}) {
  const headers = { ...extra };
  const key = getAdminApiKey();
  if (key) {
    headers['X-Admin-Key'] = key;
  }
  return headers;
}

export async function requestJson(url, options, label) {
  const res = await fetch(url, {
    ...options,
    headers: apiHeaders(options?.headers),
  });
  let body = null;

  try {
    body = await res.json();
  } catch {
    // Some failures have no JSON response body.
  }

  if (!res.ok) {
    if (res.status === 401) {
      clearAdminApiKey();
      window.dispatchEvent(new Event('admin-auth-expired'));
    }
    const detail = body?.detail || `${res.status} ${res.statusText}`.trim();
    throw new Error(`${label}: ${detail}`);
  }

  return body;
}
