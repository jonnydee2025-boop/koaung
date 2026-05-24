import { useState, useEffect, useMemo } from 'react';
import Header from '../components/Header';
import LazyJobTable from '../components/LazyJobTable';
import Pagination from '../components/Pagination';
import { Search, RefreshCw } from 'lucide-react';
import ScheduleJobModal from '../components/ScheduleJobModal';
import { updateJobStatus, retryJobRender, scheduleJob } from '../data/api';
import { invalidateSheetCaches } from '../data/queryCache';
import { buildJobsPageView, EMPTY_COUNTS } from '../data/jobsSheet';
import { useJobsSheet } from '../hooks/useSheetData';

const PAGE_SIZE = 100;

function CacheHint({ refreshing, updatedAt, sheetTotal, isStale }) {
  if (!updatedAt && sheetTotal == null) return null;
  return (
    <span className="cache-hint">
      {refreshing
        ? 'Updating…'
        : isStale
          ? 'Stale · refreshing…'
          : 'Cached · in memory'}
      {' · '}
      {updatedAt?.toLocaleTimeString() ?? '—'}
      {sheetTotal != null ? ` · ${sheetTotal.toLocaleString()} rows in sheet` : ''}
    </span>
  );
}

export default function Jobs() {
  const sheetQuery = useJobsSheet({ pollMs: 15000 });

  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState('all');
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
  }, [filter, debouncedSearch]);

  const allJobs = sheetQuery.data?.jobs;
  const counts = sheetQuery.data?.counts ?? EMPTY_COUNTS;
  const sheetTotal = sheetQuery.data?.sheet_total ?? null;

  const pageView = useMemo(() => {
    if (!allJobs) {
      return null;
    }
    return buildJobsPageView(allJobs, counts, {
      page,
      pageSize: PAGE_SIZE,
      status: filter,
      search: debouncedSearch,
    });
  }, [allJobs, counts, page, filter, debouncedSearch]);

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
          />
        </div>

        {displayError && (
          <div
            style={{
              background: 'var(--red-dim)',
              border: '1px solid rgba(239,68,68,0.3)',
              borderRadius: 8,
              padding: '10px 16px',
              marginBottom: 16,
              fontSize: 13,
              color: 'var(--red)',
            }}
          >
            ⚠ {displayError}
          </div>
        )}

        <div className="card">
          <div
            style={{
              display: 'flex',
              gap: 6,
              marginBottom: 20,
              flexWrap: 'wrap',
              alignItems: 'center',
            }}
          >
            {[
              ['all', 'All'],
              ['done', 'Done'],
              ['processing', 'Processing'],
              ['pending', 'Pending'],
              ['scheduled', 'Scheduled'],
              ['failed', 'Failed'],
            ].map(([val, label]) => (
              <button
                key={val}
                type="button"
                id={`filter-${val}`}
                onClick={() => handleFilterChange(val)}
                className="btn btn-ghost btn-sm"
                style={
                  filter === val
                    ? {
                        background: 'var(--accent-dim)',
                        color: 'var(--accent)',
                        borderColor: 'var(--accent)',
                      }
                    : {}
                }
              >
                {label}
                <span
                  style={{
                    marginLeft: 4,
                    fontSize: 10,
                    fontWeight: 700,
                    background: 'rgba(255,255,255,0.08)',
                    padding: '1px 6px',
                    borderRadius: 10,
                  }}
                >
                  {counts[val]?.toLocaleString?.() ?? counts[val]}
                </span>
              </button>
            ))}
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ position: 'relative' }}>
                <Search
                  size={13}
                  style={{
                    position: 'absolute',
                    left: 10,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    color: 'var(--text-muted)',
                  }}
                />
                <input
                  id="job-search"
                  className="form-input"
                  placeholder="Search title or monk…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  style={{ paddingLeft: 30, width: 220, fontSize: 12 }}
                />
              </div>
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
