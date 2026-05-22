export default function StatusBadge({ status }) {
  const map = {
    uploaded_to_yt: <span className="badge badge-green"><span className="badge-dot" />Done</span>,
    done: <span className="badge badge-green"><span className="badge-dot" />Done</span>,
    processing: <span className="badge badge-accent"><span className="badge-dot" />Rendering</span>,
    pending: <span className="badge badge-yellow"><span className="badge-dot" />Pending</span>,
    do: <span className="badge badge-yellow"><span className="badge-dot" />Do Next</span>,
    scheduled: <span className="badge badge-blue"><span className="badge-dot" />Scheduled</span>,
    failed: <span className="badge badge-red"><span className="badge-dot" />Failed</span>,
  };
  return map[status] || <span className="badge badge-muted">{status}</span>;
}
