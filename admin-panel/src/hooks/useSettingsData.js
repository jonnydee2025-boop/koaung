import { useCallback, useMemo } from 'react';
import {
  fetchDriveMediaOptions,
  fetchGeminiModels,
  fetchRowRules,
  fetchSettings,
} from '../data/api';
import {
  SETTINGS_GENERAL_CACHE_KEY,
  SETTINGS_GEMINI_CACHE_KEY,
  SETTINGS_ROW_RULES_CACHE_KEY,
} from '../data/settingsCacheKeys';
import { useCachedQuery } from './useCachedQuery';

const SETTINGS_TTL = 60000;

function transformSettings(data) {
  if (!data) return null;
  return {
    sheetName: data.sheet_name,
    tmpRoot: data.tmp_root,
    ffmpegBin: data.ffmpeg_bin,
    ffprobeBin: data.ffprobe_bin,
    backgroundVideoFolder: data.background_video_folder,
    enableAudioEnhance: data.enable_audio_enhance,
    apiPort: data.api_port,
  };
}

export function useCachedGeneralSettings(options = {}) {
  const enabled = options.enabled ?? true;
  const query = useCachedQuery(SETTINGS_GENERAL_CACHE_KEY, fetchSettings, {
    ttlMs: SETTINGS_TTL,
    enabled,
  });

  const cfg = useMemo(() => transformSettings(query.data), [query.data]);
  const meta = useMemo(
    () => ({
      geminiConfigured: Boolean(query.data?.gemini_api_key_configured),
      geminiKeyCount: query.data?.gemini_models?.api_key_count ?? 0,
    }),
    [query.data],
  );

  return {
    ...query,
    cfg,
    meta,
    isInitialLoad: enabled && query.loading && cfg == null,
  };
}

export function useCachedGeminiSettings(options = {}) {
  const enabled = options.enabled ?? true;
  const fetcher = useCallback(() => fetchGeminiModels(), []);
  const query = useCachedQuery(SETTINGS_GEMINI_CACHE_KEY, fetcher, {
    ttlMs: SETTINGS_TTL,
    enabled,
  });

  return {
    ...query,
    isInitialLoad: enabled && query.loading && query.data == null,
  };
}

async function fetchRowRulesBundle() {
  const [rulesData, media] = await Promise.all([
    fetchRowRules(),
    fetchDriveMediaOptions(),
  ]);
  return { rulesData, media };
}

export function useCachedRowRulesSettings(options = {}) {
  const enabled = options.enabled ?? true;
  const fetcher = useCallback(() => fetchRowRulesBundle(), []);
  const query = useCachedQuery(SETTINGS_ROW_RULES_CACHE_KEY, fetcher, {
    ttlMs: SETTINGS_TTL,
    enabled,
  });

  return {
    ...query,
    isInitialLoad: enabled && query.loading && query.data == null,
  };
}
