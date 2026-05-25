/**
 * Client-side filter/pagination for the Jobs tab (mirrors video_bot/api.py).
 */

const EMPTY_COUNTS = {
  all: 0,
  done: 0,
  processing: 0,
  pending: 0,
  do: 0,
  scheduled: 0,
  failed: 0,
};

function isDoneStatus(status) {
  return status === 'uploaded_to_yt' || status === 'done';
}

function isPendingStatus(status) {
  return status === 'pending';
}

export function jobMonkName(job) {
  return (job.monk || job.monk_name || '').trim();
}

/** Distinct monk names from cached sheet rows, sorted for dropdown options. */
export function uniqueMonkNames(jobs) {
  const names = new Set();
  for (const job of jobs ?? []) {
    const name = jobMonkName(job);
    if (name) {
      names.add(name);
    }
  }
  return [...names].sort((a, b) => a.localeCompare(b));
}

export function filterJobs(jobs, status, search, monkFilter = '') {
  const query = search.trim().toLowerCase();
  const monk = monkFilter.trim();
  const filtered = [];

  for (const job of jobs) {
    const jobStatus = job.status;
    if (status === 'done' && !isDoneStatus(jobStatus)) continue;
    if (status === 'processing' && jobStatus !== 'processing') continue;
    if (status === 'pending' && !isPendingStatus(jobStatus)) continue;
    if (status === 'do' && jobStatus !== 'do') continue;
    if (status === 'failed' && jobStatus !== 'failed') continue;
    if (status === 'scheduled' && jobStatus !== 'scheduled') continue;

    if (monk && jobMonkName(job) !== monk) continue;

    if (query) {
      const title = (job.title || '').toLowerCase();
      if (!title.includes(query)) continue;
    }

    filtered.push(job);
  }

  return filtered;
}

export function paginateJobs(jobs, page, pageSize) {
  const total = jobs.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize) || 1);
  let currentPage = page;

  if (total === 0) {
    currentPage = 1;
  } else if (currentPage > totalPages) {
    currentPage = totalPages;
  }
  if (currentPage < 1) {
    currentPage = 1;
  }

  const start = (currentPage - 1) * pageSize;
  const items = jobs.slice(start, start + pageSize);

  return {
    items,
    page: currentPage,
    page_size: pageSize,
    total,
    total_pages: totalPages,
  };
}

export function buildJobsPageView(
  allJobs,
  counts,
  { page, pageSize, status, search, monkFilter = '' },
) {
  const filtered = filterJobs(allJobs ?? [], status, search, monkFilter);
  const slice = paginateJobs(filtered, page, pageSize);
  return {
    ...slice,
    counts: counts ?? EMPTY_COUNTS,
    sheet_total: allJobs?.length ?? 0,
  };
}

export { EMPTY_COUNTS };
