import { invalidateSheetCaches } from './queryCache';
import { API_BASE, requestJson } from './httpClient';

export async function fetchJobs(limit = 6) {
  return requestJson(`${API_BASE}/api/jobs?limit=${limit}`, undefined, 'Jobs failed');
}

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

export async function fetchAllJobs({ refresh = false } = {}) {
  const params = new URLSearchParams({ full: 'true' });
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
