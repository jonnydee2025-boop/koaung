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

export async function fetchGeminiModels() {
  return requestJson(`${API_BASE}/api/settings/gemini-models`, undefined, 'Gemini models failed');
}

export async function saveGeminiModels(payload) {
  return requestJson(
    `${API_BASE}/api/settings/gemini-models`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    },
    'Save Gemini models failed',
  );
}

export async function fetchGeminiPrompt() {
  return requestJson(`${API_BASE}/api/settings/gemini-prompt`, undefined, 'Gemini prompt failed');
}

export async function saveGeminiPrompt(payload) {
  return requestJson(
    `${API_BASE}/api/settings/gemini-prompt`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    },
    'Save Gemini prompt failed',
  );
}

export async function fetchIntervalTriggers() {
  return requestJson(
    `${API_BASE}/api/settings/interval-triggers`,
    undefined,
    'Interval triggers failed',
  );
}

export async function saveIntervalTriggers(triggers) {
  return requestJson(
    `${API_BASE}/api/settings/interval-triggers`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ triggers }),
    },
    'Save interval triggers failed',
  );
}
