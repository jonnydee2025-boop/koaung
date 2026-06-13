import { JOB_STATUS_FILTER_KEYS } from './jobsSheet';

/** Build `/jobs` path with filter query params for deep links. */
export function buildJobsLink({ status, monk, search, row } = {}) {
  const params = new URLSearchParams();
  if (status && status !== 'all') {
    params.set('status', status);
  }
  if (monk?.trim()) {
    params.set('monk', monk.trim());
  }
  if (row != null && String(row).trim() !== '') {
    params.set('row', String(row).trim());
  } else if (search?.trim()) {
    params.set('search', search.trim());
  }
  const qs = params.toString();
  return qs ? `/jobs?${qs}` : '/jobs';
}

/** Parse Jobs URL search params into filter state. */
export function parseJobsLinkParams(searchParams) {
  const rawStatus = searchParams.get('status') || 'all';
  const status = JOB_STATUS_FILTER_KEYS.includes(rawStatus) ? rawStatus : 'all';
  const monk = searchParams.get('monk') || '';
  const rowRaw = searchParams.get('row');
  const row = rowRaw && /^\d+$/.test(rowRaw) ? Number(rowRaw) : null;
  const search = row == null ? (searchParams.get('search') || '') : '';
  return { status, monk, search, row };
}

/** Serialize filter state for `setSearchParams`. */
export function jobsLinkSearchParams({ status, monk, search, row } = {}) {
  const params = new URLSearchParams();
  if (status && status !== 'all') {
    params.set('status', status);
  }
  if (monk?.trim()) {
    params.set('monk', monk.trim());
  }
  if (row != null && String(row).trim() !== '') {
    params.set('row', String(row).trim());
  } else if (search?.trim()) {
    params.set('search', search.trim());
  }
  return params;
}
