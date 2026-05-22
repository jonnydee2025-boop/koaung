/**
 * API base URL:
 * - Dev: leave VITE_API_BASE_URL empty — Vite proxy forwards /api to localhost:8000
 * - Production (nginx same-origin): leave empty — nginx proxies /api to the bot
 * - Production (split host): set VITE_API_BASE_URL=https://your-domain.com
 */
import { getAdminApiKey, clearAdminApiKey } from './adminAuth';
import { invalidateSheetCaches } from './queryCache';

const BASE = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');

function apiHeaders(extra = {}) {
  const headers = { ...extra };
  const key = getAdminApiKey();
  if (key) {
    headers['X-Admin-Key'] = key;
  }
  return headers;
}

/** Validate a key before saving it (protected route). */
export async function verifyAdminApiKey(key) {
  const res = await fetch(`${BASE}/api/stats`, {
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

async function requestJson(url, options, label) {
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

export async function fetchStats() {
  return requestJson(`${BASE}/api/stats`, undefined, 'Stats failed');
}

/** Dashboard recent jobs — plain array response. */
export async function fetchJobs(limit = 6) {
  return requestJson(`${BASE}/api/jobs?limit=${limit}`, undefined, 'Jobs failed');
}

/** Jobs tab — paginated slice of the full sheet. */
export async function scheduleJob(rowNumber, scheduleTimeIso) {
  const result = await requestJson(
    `${BASE}/api/jobs/${rowNumber}/schedule`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ schedule_time: scheduleTimeIso }),
    },
    'Schedule failed',
  );
  invalidateSheetCaches();
  return result;
}

export async function prioritizeJob(rowNumber) {
  const result = await requestJson(
    `${BASE}/api/jobs/${rowNumber}/prioritize`,
    { method: 'POST' },
    'Prioritize failed',
  );
  invalidateSheetCaches();
  return result;
}

export async function fetchJobsPage({
  page = 1,
  pageSize = 50,
  status = 'all',
  search = '',
  refresh = false,
} = {}) {
  const params = new URLSearchParams({
    page: String(page),
    page_size: String(pageSize),
    status,
    search,
  });
  if (refresh) {
    params.set('refresh', 'true');
  }
  return requestJson(`${BASE}/api/jobs?${params}`, undefined, 'Jobs failed');
}

export async function fetchLogs(n = 120) {
  return requestJson(`${BASE}/api/logs?n=${n}`, undefined, 'Logs failed');
}

export async function fetchRenderStatus() {
  return requestJson(`${BASE}/api/render-status`, undefined, 'Render status failed');
}

export async function triggerRenderNext() {
  const result = await requestJson(`${BASE}/api/render-next`, { method: 'POST' }, 'Render failed');
  invalidateSheetCaches();
  return result;
}

export async function fetchSettings() {
  return requestJson(`${BASE}/api/settings`, undefined, 'Settings failed');
}

export async function fetchBotStatus() {
  return requestJson(`${BASE}/api/bot/status`, undefined, 'Bot status failed');
}

export async function startBot() {
  return requestJson(`${BASE}/api/bot/start`, { method: 'POST' }, 'Start failed');
}

export async function stopBot() {
  return requestJson(`${BASE}/api/bot/stop`, { method: 'POST' }, 'Stop failed');
}

export async function cancelRender() {
  const result = await requestJson(`${BASE}/api/render-cancel`, { method: 'POST' }, 'Cancel failed');
  invalidateSheetCaches();
  return result;
}

export async function shutdownServer() {
  return requestJson(`${BASE}/api/server/shutdown`, { method: 'POST' }, 'Shutdown failed');
}
