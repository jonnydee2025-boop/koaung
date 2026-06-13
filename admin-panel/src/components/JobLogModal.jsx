import { Copy, X } from 'lucide-react';
import { useToast } from '../context/ToastContext';

export default function JobLogModal({ job, open, onClose }) {
  const { showSuccess, showError } = useToast();

  if (!open || !job) {
    return null;
  }

  const logText = (job.logs || '').trim();

  const handleCopy = async () => {
    if (!logText) {
      return;
    }
    try {
      await navigator.clipboard.writeText(logText);
      showSuccess('Log copied to clipboard.');
    } catch {
      showError('Could not copy log.');
    }
  };

  return (
    <div className="modal-overlay" role="presentation" onClick={onClose}>
      <div
        className="modal-card modal-card--calm"
        role="dialog"
        aria-labelledby="job-log-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <div>
            <h2 id="job-log-modal-title" className="modal-title">
              Job log
            </h2>
            <p className="modal-subtitle schedule-modal-subtitle">
              <span className="schedule-modal-row-ref">Row #{job.row} —</span>{' '}
              <span className="schedule-modal-job-title">{job.title || '(no title)'}</span>
            </p>
          </div>
          <button type="button" className="btn-icon" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>

        <div className="modal-log-body">
          {logText ? logText : 'No log entries.'}
        </div>

        <div className="modal-actions">
          {logText ? (
            <button type="button" className="btn btn-ghost" onClick={handleCopy}>
              <Copy size={14} />
              Copy log
            </button>
          ) : null}
          <button type="button" className="btn btn-primary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
