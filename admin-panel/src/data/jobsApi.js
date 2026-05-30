import { invalidateSheetCaches } from './queryCache';
import { clearAdminApiKey, getAdminApiKey } from './adminAuth';
import { API_BASE, apiHeaders, requestJson } from './httpClient';

export async function fetchJobsPage({
  page = 1,
  pageSize = 50,
  status = 'all',
  search = '',
  monk = '',
  refresh = false,
} = {}) {
  const params = new URLSearchParams({
    page: String(page),
    page_size: String(pageSize),
    status,
    search,
    monk,
  });
  if (refresh) {
    params.set('refresh', 'true');
  }
  return requestJson(`${API_BASE}/api/jobs?${params}`, undefined, 'Jobs failed');
}

export async function fetchCalendarEvents(year, month, { refresh = false } = {}) {
  const params = new URLSearchParams({
    year: String(year),
    month: String(month),
  });
  if (refresh) {
    params.set('refresh', 'true');
  }
  return requestJson(
    `${API_BASE}/api/jobs/calendar?${params}`,
    undefined,
    'Calendar failed',
  );
}

export async function fetchJobMonks({ refresh = false } = {}) {
  const params = new URLSearchParams();
  if (refresh) {
    params.set('refresh', 'true');
  }
  const query = params.toString();
  const url = query
    ? `${API_BASE}/api/jobs/monks?${query}`
    : `${API_BASE}/api/jobs/monks`;
  return requestJson(url, undefined, 'Monks failed');
}

export async function scheduleJob(rowNumber, payload) {
  const result = await requestJson(
    `${API_BASE}/api/jobs/${rowNumber}/schedule`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    },
    'Schedule failed',
  );
  invalidateSheetCaches();
  return result;
}

export async function updateJobStatus(rowNumber, status) {
  const result = await requestJson(
    `${API_BASE}/api/jobs/${rowNumber}/status`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    },
    'Status update failed',
  );
  invalidateSheetCaches();
  return result;
}

export async function retryJobRender(rowNumber) {
  const result = await requestJson(
    `${API_BASE}/api/jobs/${rowNumber}/retry`,
    { method: 'POST' },
    'Retry failed',
  );
  invalidateSheetCaches();
  return result;
}

export function jobAudioStreamUrl(rowNumber) {
  const params = new URLSearchParams();
  const key = getAdminApiKey();
  if (key) {
    params.set('admin_key', key);
  }
  const query = params.toString();
  const base = `${API_BASE}/api/jobs/${rowNumber}/audio`;
  return query ? `${base}?${query}` : base;
}

export async function fetchJobAudioBlob(rowNumber) {
  const res = await fetch(`${API_BASE}/api/jobs/${rowNumber}/audio`, {
    headers: apiHeaders(),
  });

  if (!res.ok) {
    let detail = `${res.status} ${res.statusText}`.trim();
    try {
      const body = await res.json();
      if (body?.detail) {
        detail = body.detail;
      }
    } catch {
      // Some failures have no JSON response body.
    }
    if (res.status === 401) {
      clearAdminApiKey();
      window.dispatchEvent(new Event('admin-auth-expired'));
    }
    throw new Error(`Audio failed: ${detail}`);
  }

  return res.blob();
}
