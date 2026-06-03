import { useState, useEffect, useLayoutEffect, useRef } from 'react';
import Header from '../components/Header';
import LazyJobTable from '../components/LazyJobTable';
import Pagination from '../components/Pagination';
import CollapsibleSearch from '../components/CollapsibleSearch';
import MonkFilterTab from '../components/MonkFilterTab';
import ErrorBanner from '../components/ErrorBanner';
import { RefreshCw } from 'lucide-react';
import ScheduleJobModal from '../components/ScheduleJobModal';
import { updateJobStatus, retryJobRender, scheduleJob } from '../data/api';
import { invalidateSheetCaches } from '../data/queryCache';
import { EMPTY_COUNTS, JOBS_TOOLBAR_FILTERS } from '../data/jobsSheet';
import { jobsPageCacheKey } from '../data/jobsCacheKeys';
import { useLazyVisible } from '../hooks/useLazyVisible';
import { useSheetCacheInvalidation } from '../hooks/useSheetCacheInvalidation';
import {
  prefetchAdjacentJobsPages,
  prefetchJobsFilterTab,
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
  const { ref: pageRef, isVisible } = useLazyVisible();

  const countsRef = useRef(EMPTY_COUNTS);
  const sheetTotalRef = useRef(null);
  const lastItemsRef = useRef([]);

  const jobsQuery = useJobsPage(
    {
      page,
      pageSize: PAGE_SIZE,
      status: filter,
      search: debouncedSearch,
      monk: monkFilter,
    },
    { enabled: isVisible },
  );

  const pageData = jobsQuery.data;
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

  useLayoutEffect(() => {
    setPage(1);
  }, [filter, monkFilter, debouncedSearch]);

  useSheetCacheInvalidation(jobsQuery.refresh);

  const monkOptions = pageData?.monks ?? [];

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
    if (!pageData || !isVisible) return;
    prefetchAdjacentJobsPages({
      page: pageData.page ?? page,
      totalPages: pageData.total_pages ?? 1,
      pageSize: PAGE_SIZE,
      status: filter,
      search: debouncedSearch,
      monk: monkFilter,
    });
  }, [pageData, page, filter, debouncedSearch, monkFilter, isVisible]);

  const filterCount = counts[filter] ?? 0;
  const activeQueryKey = jobsPageCacheKey({
    page,
    pageSize: PAGE_SIZE,
    status: filter,
    search: debouncedSearch,
    monk: monkFilter,
  });
  const queryMatchesTab = jobsQuery.cacheKey === activeQueryKey;
  const filterScopeActive = Boolean(monkFilter || debouncedSearch);
  const scopedTrackTotal = queryMatchesTab
    ? (pageData?.filter_total ?? counts.all ?? 0)
    : (counts.all ?? 0);
  if (queryMatchesTab && pageData?.items) {
    lastItemsRef.current = pageData.items;
  }

  const displayItems = queryMatchesTab ? (pageData?.items ?? []) : lastItemsRef.current;
  const fetching = !isVisible || !queryMatchesTab || jobsQuery.isInitialLoad || jobsQuery.loading;
  const initialLoading = fetching && displayItems.length === 0;
  const overlayLoading = fetching && displayItems.length > 0;
  const loading = initialLoading || overlayLoading;
  const items = displayItems;
  const total = queryMatchesTab ? (pageData?.total ?? filterCount) : filterCount;
  const totalPages = queryMatchesTab
    ? (pageData?.total_pages ?? Math.max(1, Math.ceil(filterCount / PAGE_SIZE) || 1))
    : Math.max(1, Math.ceil(filterCount / PAGE_SIZE) || 1);
  const error = jobsQuery.error;

  const refreshSheet = () => {
    invalidateSheetCaches();
    jobsQuery.refresh();
  };

  const handleFilterChange = (value) => {
    setPage(1);
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

  const handleScheduleSave = async (payload) => {
    if (!scheduleTarget) return;
    setScheduleModalError('');
    setSchedulingRow(scheduleTarget.row);
    setActionError('');
    try {
      await scheduleJob(scheduleTarget.row, payload);
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
          sheetTotal == null
            ? 'Live from Google Sheet'
            : filterScopeActive
              ? monkFilter
                ? `${scopedTrackTotal.toLocaleString()} tracks · ${monkFilter}${
                    debouncedSearch ? ` · search “${debouncedSearch}”` : ''
                  }`
                : `${scopedTrackTotal.toLocaleString()} matches · search “${debouncedSearch}”`
              : `${sheetTotal.toLocaleString()} rows in Google Sheet`
        }
      />
      <div ref={pageRef} className="page-content">
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
                  onMouseEnter={() =>
                    prefetchJobsFilterTab({
                      pageSize: PAGE_SIZE,
                      search: debouncedSearch,
                      monk: monkFilter,
                      status: val,
                    })
                  }
                  onFocus={() =>
                    prefetchJobsFilterTab({
                      pageSize: PAGE_SIZE,
                      search: debouncedSearch,
                      monk: monkFilter,
                      status: val,
                    })
                  }
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
                onChange={(name) => {
                  setMonkFilter(name);
                  setPage(1);
                }}
                statusFilter={filter}
              />
            </div>
            <div className="jobs-toolbar-actions">
              <CollapsibleSearch value={search} onChange={setSearch} />
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={refreshSheet}
                disabled={initialLoading}
              >
                <RefreshCw size={13} />
                Refresh
              </button>
            </div>
          </div>

          <div className="table-wrap jobs-table-wrap">
            <LazyJobTable
              jobs={items}
              initialLoading={initialLoading}
              overlayLoading={overlayLoading}
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
            disabled={fetching}
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
