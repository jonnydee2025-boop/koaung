import { invalidateSheetCaches } from './queryCache';
import { API_BASE, requestJson } from './httpClient';

export async function fetchJobs(limit = 6) {
  return requestJson(`${API_BASE}/api/jobs?limit=${limit}`, undefined, 'Jobs failed');
}

export async function fetchAllJobs({ refresh = false } = {}) {
  const params = new URLSearchParams({ full: 'true' });
  if (refresh) {
    params.set('refresh', 'true');
  }
  return requestJson(`${API_BASE}/api/jobs?${params}`, undefined, 'Jobs failed');
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
  return requestJson(`${API_BASE}/api/jobs?${params}`, undefined, 'Jobs failed');
}

export async function scheduleJob(rowNumber, scheduleTimeIso) {
  const result = await requestJson(
    `${API_BASE}/api/jobs/${rowNumber}/schedule`,
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
    `${API_BASE}/api/jobs/${rowNumber}/prioritize`,
    { method: 'POST' },
    'Prioritize failed',
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
