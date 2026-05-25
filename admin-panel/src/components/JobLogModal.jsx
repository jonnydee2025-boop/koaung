import { X } from 'lucide-react';

export default function JobLogModal({ job, open, onClose }) {
  if (!open || !job) {
    return null;
  }

  const logText = (job.logs || '').trim();

  return (
    <div className="modal-overlay" role="presentation" onClick={onClose}>
      <div
        className="modal-card"
        role="dialog"
        aria-labelledby="job-log-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <div>
            <h2 id="job-log-modal-title" className="modal-title">
              Job log
            </h2>
            <p className="modal-subtitle">
              Row #{job.row} — {job.title || '(no title)'}
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
          <button type="button" className="btn btn-primary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
