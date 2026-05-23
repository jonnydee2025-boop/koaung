import { API_BASE, requestJson } from './httpClient';

export async function fetchSettings() {
  return requestJson(`${API_BASE}/api/settings`, undefined, 'Settings failed');
}

export async function fetchRowRules() {
  return requestJson(`${API_BASE}/api/settings/row-rules`, undefined, 'Row rules failed');
}

export async function saveRowRules(rules) {
  return requestJson(
    `${API_BASE}/api/settings/row-rules`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rules }),
    },
    'Save row rules failed',
  );
}

export async function fetchDriveMediaOptions() {
  return requestJson(`${API_BASE}/api/drive/media-options`, undefined, 'Drive media failed');
}
