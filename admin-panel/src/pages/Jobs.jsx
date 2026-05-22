import { useState, useEffect, useCallback } from 'react';
import Header from '../components/Header';
import LazyJobTable from '../components/LazyJobTable';
import Pagination from '../components/Pagination';
import { Search, RefreshCw } from 'lucide-react';
import ScheduleJobModal from '../components/ScheduleJobModal';
import { fetchJobsPage, prioritizeJob, retryJobRender, scheduleJob } from '../data/api';

const PAGE_SIZE = 100;

function CacheHint({ refreshing, updatedAt, sheetTotal }) {
  if (!updatedAt && sheetTotal == null) return null;
  return (
    <span className="cache-hint">
      {refreshing ? 'Updating…' : `Cached · ${updatedAt?.toLocaleTimeString() ?? '—'}`}
      {sheetTotal != null ? ` · ${sheetTotal.toLocaleString()} rows in sheet` : ''}
    </span>
  );
}

export default function Jobs() {
  const [items, setItems] = useState([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [sheetTotal, setSheetTotal] = useState(null);
  const [counts, setCounts] = useState({
    all: 0,
    done: 0,
    processing: 0,
    pending: 0,
    scheduled: 0,
    failed: 0,
  });

  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [updatedAt, setUpdatedAt] = useState(null);
  const [actionError, setActionError] = useState('');
  const [prioritizingRow, setPrioritizingRow] = useState(null);
  const [retryingRow, setRetryingRow] = useState(null);
  const [schedulingRow, setSchedulingRow] = useState(null);
  const [scheduleTarget, setScheduleTarget] = useState(null);
  const [scheduleModalError, setScheduleModalError] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 350);
    return () => clearTimeout(timer);
  }, [search]);

  const loadPage = useCallback(
    async (targetPage, { force = false, showFullLoader = false } = {}) => {
      if (showFullLoader) {
        setLoading(true);
      } else {
        setRefreshing(true);
      }
      setError('');

      try {
        const data = await fetchJobsPage({
          page: targetPage,
          pageSize: PAGE_SIZE,
          status: filter,
          search: debouncedSearch,
          refresh: force,
        });

        setItems(data.items);
        setPage(data.page);
        setTotalPages(data.total_pages);
        setTotal(data.total);
        setSheetTotal(data.sheet_total);
        setCounts(data.counts);
        setUpdatedAt(new Date());
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [filter, debouncedSearch],
  );

  useEffect(() => {
    setPage(1);
    loadPage(1, { showFullLoader: items.length === 0 });
  }, [filter, debouncedSearch, loadPage]);

  useEffect(() => {
    if (page === 1) {
      return;
    }
    loadPage(page, { showFullLoader: false });
  }, [page, loadPage]);

  useEffect(() => {
    const interval = setInterval(() => loadPage(page), 15000);
    return () => clearInterval(interval);
  }, [page, loadPage]);

  const refreshAll = () => {
    loadPage(page, { force: true });
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
      setTimeout(() => loadPage(page, { force: true }), 1500);
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
      await loadPage(page, { force: true });
    } catch (e) {
      setScheduleModalError(e.message);
      setActionError(e.message);
    } finally {
      setSchedulingRow(null);
    }
  };

  const handlePrioritize = async (job) => {
    setActionError('');
    setPrioritizingRow(job.row);
    try {
      await prioritizeJob(job.row);
      await loadPage(page, { force: true });
    } catch (e) {
      setActionError(e.message);
    } finally {
      setPrioritizingRow(null);
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
          <CacheHint refreshing={refreshing} updatedAt={updatedAt} sheetTotal={sheetTotal} />
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
                onClick={refreshAll}
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
              onPrioritize={handlePrioritize}
              onSchedule={handleScheduleOpen}
              prioritizingRow={prioritizingRow}
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
