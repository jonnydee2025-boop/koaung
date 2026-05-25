/**
 * Admin panel API client (re-exports grouped by domain).
 */
export { verifyAdminApiKey } from './authApi';
export { fetchStats } from './statsApi';
export {
  fetchJobs,
  fetchJobsPage,
  fetchJobMonks,
  fetchAllJobs,
  scheduleJob,
  updateJobStatus,
  retryJobRender,
  fetchJobAudioBlob,
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
  fetchRowRules,
  saveRowRules,
  fetchDriveMediaOptions,
  fetchGeminiModels,
  saveGeminiModels,
} from './settingsApi';
export { fetchBotStatus, startBot, stopBot } from './botApi';
