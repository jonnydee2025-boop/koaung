import { useState, useEffect, useMemo } from 'react';
import Header from '../components/Header';
import LazyJobTable from '../components/LazyJobTable';
import Pagination from '../components/Pagination';
import CollapsibleSearch from '../components/CollapsibleSearch';
import MonkFilterTab from '../components/MonkFilterTab';
import CacheHint from '../components/CacheHint';
import ErrorBanner from '../components/ErrorBanner';
import { RefreshCw } from 'lucide-react';
import ScheduleJobModal from '../components/ScheduleJobModal';
import { updateJobStatus, retryJobRender, scheduleJob } from '../data/api';
import { invalidateSheetCaches } from '../data/queryCache';
import {
  buildJobsPageView,
  EMPTY_COUNTS,
  STATUS_FILTERS,
  uniqueMonkNames,
} from '../data/jobsSheet';
import { useJobsSheet } from '../hooks/useSheetData';

const PAGE_SIZE = 100;

export default function Jobs() {
  const sheetQuery = useJobsSheet({ pollMs: 15000 });

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

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 350);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [filter, monkFilter, debouncedSearch]);

  const allJobs = sheetQuery.data?.jobs;
  const counts = sheetQuery.data?.counts ?? EMPTY_COUNTS;
  const sheetTotal = sheetQuery.data?.sheet_total ?? null;

  const monkOptions = useMemo(() => uniqueMonkNames(allJobs ?? []), [allJobs]);

  useEffect(() => {
    if (monkFilter && !monkOptions.includes(monkFilter)) {
      setMonkFilter('');
    }
  }, [monkFilter, monkOptions]);

  const pageView = useMemo(() => {
    if (!allJobs) {
      return null;
    }
    return buildJobsPageView(allJobs, counts, {
      page,
      pageSize: PAGE_SIZE,
      status: filter,
      search: debouncedSearch,
      monkFilter,
    });
  }, [allJobs, counts, page, filter, debouncedSearch, monkFilter]);

  useEffect(() => {
    if (!pageView) return;
    if (pageView.page !== page) {
      setPage(pageView.page);
    }
  }, [pageView?.page, page, pageView]);

  const items = pageView?.items ?? [];
  const totalPages = pageView?.total_pages ?? 1;
  const total = pageView?.total ?? 0;
  const loading = sheetQuery.loading;
  const refreshing = sheetQuery.refreshing;
  const error = sheetQuery.error;
  const updatedAt = sheetQuery.updatedAt;

  const refreshSheet = () => {
    invalidateSheetCaches();
    sheetQuery.refresh();
  };

  const handleFilterChange = (value) => {
    setFilter(value);
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
        <div className="cache-bar">
          <CacheHint
            refreshing={refreshing}
            updatedAt={updatedAt}
            sheetTotal={sheetTotal}
            isStale={sheetQuery.isStale}
            mode="sheet"
          />
        </div>

        {displayError && <ErrorBanner message={displayError} />}

        <div className="card">
          <div className="jobs-toolbar">
            <div className="jobs-toolbar-filters">
              {STATUS_FILTERS.map(([val, label]) => (
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
              />
            </div>
            <div className="jobs-toolbar-actions">
              <CollapsibleSearch value={search} onChange={setSearch} />
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={refreshSheet}
                disabled={loading || refreshing}
              >
                <RefreshCw size={13} />
                Refresh
              </button>
            </div>
          </div>

          <div className="table-wrap">
            <LazyJobTable
              jobs={items}
              loading={loading}
              filtered={items}
              showActions
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
            page={pageView?.page ?? page}
            totalPages={totalPages}
            total={total}
            pageSize={PAGE_SIZE}
            onPageChange={handlePageChange}
            disabled={loading || refreshing}
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
