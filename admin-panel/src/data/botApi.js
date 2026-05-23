import { API_BASE, requestJson } from './httpClient';

export async function fetchBotStatus() {
  return requestJson(`${API_BASE}/api/bot/status`, undefined, 'Bot status failed');
}

export async function startBot() {
  return requestJson(`${API_BASE}/api/bot/start`, { method: 'POST' }, 'Start failed');
}

export async function stopBot() {
  return requestJson(`${API_BASE}/api/bot/stop`, { method: 'POST' }, 'Stop failed');
}
