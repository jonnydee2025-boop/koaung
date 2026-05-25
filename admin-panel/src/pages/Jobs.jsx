import { useState, useEffect, useRef } from 'react';
import Header from '../components/Header';
import LazyJobTable from '../components/LazyJobTable';
import Pagination from '../components/Pagination';
import CollapsibleSearch from '../components/CollapsibleSearch';
import MonkFilterTab from '../components/MonkFilterTab';
import ErrorBanner from '../components/ErrorBanner';
import { RefreshCw } from 'lucide-react';
import ScheduleJobModal from '../components/ScheduleJobModal';
import { updateJobStatus, retryJobRender, scheduleJob } from '../data/api';
import { readCache, invalidateSheetCaches } from '../data/queryCache';
import { jobsPageCacheKey } from '../data/jobsCacheKeys';
import { EMPTY_COUNTS, JOBS_TOOLBAR_FILTERS } from '../data/jobsSheet';
import {
  prefetchAdjacentJobsPages,
  useJobMonks,
  useJobsPage,
} from '../hooks/useSheetData';

const PAGE_SIZE = 50;

export default function Jobs() {
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState('all');
  const [monkFilter, setMonkFilter] = useState('');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  const [actionError, setActionError] = useState('');
  const [updatingStatusRow, setUpdatingStatusRow] = useState(null);
  const [retryingRow, setRetryingRow] = useState(null);
  const [schedulingRow, setSchedulingRow] = useState(null);
  const [scheduleTarget, setScheduleTarget] = useState(null);
  const [scheduleModalError, setScheduleModalError] = useState('');

  const jobsQuery = useJobsPage({
    page,
    pageSize: PAGE_SIZE,
    status: filter,
    search: debouncedSearch,
    monk: monkFilter,
  });
  const monksQuery = useJobMonks();

  const queryKey = jobsPageCacheKey({
    page,
    pageSize: PAGE_SIZE,
    status: filter,
    search: debouncedSearch,
    monk: monkFilter,
  });

  const countsRef = useRef(EMPTY_COUNTS);
  const sheetTotalRef = useRef(null);

  const pageData = readCache(queryKey)?.data ?? null;
  if (pageData?.counts) {
    countsRef.current = pageData.counts;
  }
  if (pageData?.sheet_total != null) {
    sheetTotalRef.current = pageData.sheet_total;
  }

  const counts = pageData?.counts ?? countsRef.current;
  const sheetTotal = pageData?.sheet_total ?? sheetTotalRef.current;
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 350);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [filter, monkFilter, debouncedSearch]);

  const monkOptions = monksQuery.data?.monks ?? [];

  useEffect(() => {
    if (monkFilter && monkOptions.length > 0 && !monkOptions.includes(monkFilter)) {
      setMonkFilter('');
    }
  }, [monkFilter, monkOptions]);

  useEffect(() => {
    if (!pageData?.total_pages) return;
    if (page > pageData.total_pages) {
      setPage(pageData.page ?? pageData.total_pages);
    }
  }, [pageData?.page, pageData?.total_pages, page]);

  useEffect(() => {
    if (!pageData) return;
    prefetchAdjacentJobsPages({
      page: pageData.page ?? page,
      totalPages: pageData.total_pages ?? 1,
      pageSize: PAGE_SIZE,
      status: filter,
      search: debouncedSearch,
      monk: monkFilter,
    });
  }, [pageData, page, filter, debouncedSearch, monkFilter]);

  const filterCount = counts[filter] ?? 0;
  const items = pageData?.items ?? [];
  const total = pageData?.total ?? filterCount;
  const totalPages = pageData?.total_pages
    ?? Math.max(1, Math.ceil(filterCount / PAGE_SIZE) || 1);
  const loading = jobsQuery.loading || pageData == null;
  const error = jobsQuery.error;

  const refreshSheet = () => {
    invalidateSheetCaches();
    jobsQuery.refresh();
    monksQuery.refresh();
  };

  const handleFilterChange = (value) => {
    setFilter(value);
    requestAnimationFrame(() => {
      document.getElementById(`filter-${value}`)?.scrollIntoView({
        inline: 'nearest',
        block: 'nearest',
        behavior: 'smooth',
      });
    });
  };

  const handlePageChange = (nextPage) => {
    if (nextPage < 1 || nextPage > totalPages || nextPage === page) return;
    setPage(nextPage);
  };

  const handleRetryJob = async (job) => {
    if (!job?.row) return;
    setActionError('');
    setRetryingRow(job.row);
    try {
      await retryJobRender(job.row);
      setTimeout(refreshSheet, 1500);
    } catch (e) {
      setActionError(e.message);
    } finally {
      setRetryingRow(null);
    }
  };

  const handleScheduleOpen = (job) => {
    setScheduleModalError('');
    setScheduleTarget(job);
  };

  const handleScheduleClose = () => {
    if (schedulingRow) return;
    setScheduleTarget(null);
    setScheduleModalError('');
  };

  const handleScheduleSave = async (scheduleTimeIso) => {
    if (!scheduleTarget) return;
    setScheduleModalError('');
    setSchedulingRow(scheduleTarget.row);
    setActionError('');
    try {
      await scheduleJob(scheduleTarget.row, scheduleTimeIso);
      setScheduleTarget(null);
      refreshSheet();
    } catch (e) {
      setScheduleModalError(e.message);
      setActionError(e.message);
    } finally {
      setSchedulingRow(null);
    }
  };

  const handleStatusChange = async (job, newStatus) => {
    if (!job?.row || !newStatus) return;
    setActionError('');
    setUpdatingStatusRow(job.row);
    try {
      await updateJobStatus(job.row, newStatus);
      refreshSheet();
    } catch (e) {
      setActionError(e.message);
    } finally {
      setUpdatingStatusRow(null);
    }
  };

  const displayError = actionError || error;

  return (
    <>
      <Header
        title="Jobs"
        subtitle={
          sheetTotal != null
            ? `${sheetTotal.toLocaleString()} rows in Google Sheet`
            : 'Live from Google Sheet'
        }
      />
      <div className="page-content">
        {displayError && <ErrorBanner message={displayError} />}

        <div className="card">
          <div className="jobs-toolbar">
            <div className="jobs-toolbar-filters">
              {JOBS_TOOLBAR_FILTERS.map(([val, label]) => (
                <button
                  key={val}
                  type="button"
                  id={`filter-${val}`}
                  onClick={() => handleFilterChange(val)}
                  className={`btn btn-ghost btn-sm jobs-filter-tab${filter === val ? ' is-active' : ''}`}
                >
                  {label}
                  <span className="jobs-filter-count">
                    {counts[val]?.toLocaleString?.() ?? counts[val]}
                  </span>
                </button>
              ))}
              <MonkFilterTab
                value={monkFilter}
                options={monkOptions}
                onChange={setMonkFilter}
                statusFilter={filter}
              />
            </div>
            <div className="jobs-toolbar-actions">
              <CollapsibleSearch value={search} onChange={setSearch} />
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={refreshSheet}
                disabled={loading && !items.length}
              >
                <RefreshCw size={13} />
                Refresh
              </button>
            </div>
          </div>

          <div className="table-wrap jobs-table-wrap">
            <LazyJobTable
              jobs={items}
              loading={loading}
              filtered={items}
              showActions
              enableTitlePlayer
              onRetry={handleRetryJob}
              onStatusChange={handleStatusChange}
              onSchedule={handleScheduleOpen}
              updatingStatusRow={updatingStatusRow}
              retryingRow={retryingRow}
              schedulingRow={schedulingRow}
              disableLazyRows
            />
          </div>

          <Pagination
            page={page}
            totalPages={totalPages}
            total={total}
            pageSize={PAGE_SIZE}
            onPageChange={handlePageChange}
            disabled={loading && !items.length}
          />
        </div>
      </div>

      <ScheduleJobModal
        job={scheduleTarget}
        open={Boolean(scheduleTarget)}
        saving={schedulingRow != null}
        error={scheduleModalError}
        onClose={handleScheduleClose}
        onSave={handleScheduleSave}
      />
    </>
  );
}
