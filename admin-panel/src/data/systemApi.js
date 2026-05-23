import { invalidateSheetCaches } from './queryCache';
import { API_BASE, requestJson } from './httpClient';

export async function fetchLogs(n = 120) {
  return requestJson(`${API_BASE}/api/logs?n=${n}`, undefined, 'Logs failed');
}

export async function fetchRenderStatus() {
  return requestJson(`${API_BASE}/api/render-status`, undefined, 'Render status failed');
}

export async function triggerRenderNext() {
  const result = await requestJson(`${API_BASE}/api/render-next`, { method: 'POST' }, 'Render failed');
  invalidateSheetCaches();
  return result;
}

export async function cancelRender() {
  const result = await requestJson(`${API_BASE}/api/render-cancel`, { method: 'POST' }, 'Cancel failed');
  invalidateSheetCaches();
  return result;
}

export async function shutdownServer() {
  return requestJson(`${API_BASE}/api/server/shutdown`, { method: 'POST' }, 'Shutdown failed');
}
