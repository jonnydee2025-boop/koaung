import { API_BASE } from './httpClient';

export async function verifyAdminApiKey(key) {
  const res = await fetch(`${API_BASE}/api/stats`, {
    headers: { 'X-Admin-Key': key },
  });
  if (res.status === 401) {
    throw new Error('Invalid admin API key.');
  }
  if (!res.ok) {
    let detail = `${res.status} ${res.statusText}`;
    try {
      const body = await res.json();
      if (body?.detail) detail = body.detail;
    } catch {
      /* no json */
    }
    throw new Error(detail);
  }
  return res.json();
}
