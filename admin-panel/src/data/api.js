/**
 * Admin panel API client (re-exports grouped by domain).
 */
export { verifyAdminApiKey } from './authApi';
export { fetchStats } from './statsApi';
export {
  fetchJobsPage,
  fetchJobMonks,
  scheduleJob,
  updateJobStatus,
  retryJobRender,
  fetchJobAudioBlob,
  jobAudioStreamUrl,
  fetchJobPlayerPrefs,
  saveJobPlayerPref,
} from './jobsApi';
export {
  fetchLogs,
  fetchRenderStatus,
  triggerRenderNext,
  cancelRender,
  shutdownServer,
} from './systemApi';
export {
  fetchSettings,
  fetchRowRulesBundle,
  saveRowRules,
  fetchDriveMediaOptions,
  fetchGeminiModels,
  saveGeminiModels,
} from './settingsApi';
export { fetchBotStatus, startBot, stopBot } from './botApi';
