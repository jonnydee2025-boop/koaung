import { fetchJobPlayerPrefs, saveJobPlayerPref } from './api';
import { invalidateCache } from './queryCache';

const LEGACY_STORAGE_KEY = 'dhamma-job-player-prefs';
const CHANGE_EVENT = 'job-player-prefs-changed';

let cache = null;
let loadPromise = null;

function rowKey(row) {
  return String(row);
}

function notify() {
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

function readLegacyLocal() {
  try {
    const raw = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function clearLegacyLocal() {
  try {
    localStorage.removeItem(LEGACY_STORAGE_KEY);
  } catch {
    // ignore
  }
}

function normalizeEntry(entry) {
  return {
    favorite: Boolean(entry?.favorite),
    remark: typeof entry?.remark === 'string' ? entry.remark : '',
  };
}

function isEmptyPref(pref) {
  return !pref.favorite && !pref.remark.trim();
}

function applyEntry(key, entry) {
  if (!cache) cache = {};
  const normalized = normalizeEntry(entry);
  if (isEmptyPref(normalized)) {
    delete cache[key];
  } else {
    cache[key] = normalized;
  }
}

async function migrateLegacyLocalPrefs() {
  const local = readLegacyLocal();
  const keys = Object.keys(local);
  if (!keys.length) {
    return;
  }

  let migrated = false;
  for (const key of keys) {
    const localEntry = normalizeEntry(local[key]);
    if (isEmptyPref(localEntry)) {
      continue;
    }
    const serverEntry = normalizeEntry(cache?.[key]);
    if (!isEmptyPref(serverEntry)) {
      continue;
    }
    await saveJobPlayerPref(Number(key), localEntry);
    applyEntry(key, localEntry);
    migrated = true;
  }

  clearLegacyLocal();
  if (migrated) {
    notify();
  }
}

export async function ensureJobPlayerPrefsLoaded() {
  if (cache) {
    return cache;
  }
  if (!loadPromise) {
    loadPromise = (async () => {
      try {
        const body = await fetchJobPlayerPrefs();
        cache = body?.prefs && typeof body.prefs === 'object' ? { ...body.prefs } : {};
        await migrateLegacyLocalPrefs();
      } catch {
        cache = readLegacyLocal();
      }
      notify();
      return cache;
    })();
  }
  return loadPromise;
}

export function readJobPlayerPrefs() {
  return cache ? { ...cache } : {};
}

export function getJobPlayerPref(row) {
  if (row == null || row === '' || !cache) {
    return { favorite: false, remark: '' };
  }
  return normalizeEntry(cache[rowKey(row)]);
}

export async function setJobFavorite(row, favorite) {
  if (row == null || row === '') return;
  await ensureJobPlayerPrefsLoaded();

  const key = rowKey(row);
  const current = getJobPlayerPref(row);
  const next = { favorite: Boolean(favorite), remark: current.remark };
  const previous = cache?.[key] ? { ...cache[key] } : null;

  applyEntry(key, next);
  notify();

  try {
    await saveJobPlayerPref(row, next);
    invalidateCache('jobs:*');
  } catch (error) {
    if (previous) {
      cache[key] = previous;
    } else {
      delete cache[key];
    }
    notify();
    throw error;
  }
}

export async function setJobRemark(row, remark) {
  if (row == null || row === '') return;
  await ensureJobPlayerPrefsLoaded();

  const key = rowKey(row);
  const current = getJobPlayerPref(row);
  const next = { favorite: current.favorite, remark: String(remark ?? '') };
  const previous = cache?.[key] ? { ...cache[key] } : null;

  applyEntry(key, next);
  notify();

  try {
    await saveJobPlayerPref(row, next);
  } catch (error) {
    if (previous) {
      cache[key] = previous;
    } else {
      delete cache[key];
    }
    notify();
    throw error;
  }
}

export function subscribeJobPlayerPrefs(callback) {
  window.addEventListener(CHANGE_EVENT, callback);
  return () => window.removeEventListener(CHANGE_EVENT, callback);
}

export function resetJobPlayerPrefsCache() {
  cache = null;
  loadPromise = null;
}

if (typeof window !== 'undefined') {
  window.addEventListener('admin-auth-expired', resetJobPlayerPrefsCache);
}
