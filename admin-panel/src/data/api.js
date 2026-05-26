/**
 * Admin panel API client (re-exports grouped by domain).
 */
export { verifyAdminApiKey } from './authApi';
export { fetchStats } from './statsApi';
export {
  fetchJobs,
  fetchJobsPage,
  fetchJobMonks,
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
  fetchGeminiPrompt,
  saveGeminiPrompt,
  fetchIntervalTriggers,
  saveIntervalTriggers,
} from './settingsApi';
export { fetchBotStatus, startBot, stopBot } from './botApi';
