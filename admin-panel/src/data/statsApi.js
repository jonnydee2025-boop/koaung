import { API_BASE, requestJson } from './httpClient';

export async function fetchStats() {
  return requestJson(`${API_BASE}/api/stats`, undefined, 'Stats failed');
}
