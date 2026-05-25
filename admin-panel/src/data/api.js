/**
 * Admin panel API client (re-exports grouped by domain).
 */
export { verifyAdminApiKey } from './authApi';
export { fetchStats } from './statsApi';
export {
  fetchJobs,
  fetchAllJobs,
  scheduleJob,
  updateJobStatus,
  retryJobRender,
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
} from './settingsApi';
export { fetchBotStatus, startBot, stopBot } from './botApi';
