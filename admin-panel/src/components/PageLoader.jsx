export default function PageLoader({ label = 'Loading…' }) {
  return (
    <div className="page-loader" role="status" aria-live="polite">
      <div className="page-loader-spinner" />
      <span>{label}</span>
    </div>
  );
}
