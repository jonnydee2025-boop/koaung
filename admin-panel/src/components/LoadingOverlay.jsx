import PageLoader from './PageLoader';

export default function LoadingOverlay({
  loading = false,
  label = 'Loading…',
  dim = true,
  className = '',
  children,
}) {
  return (
    <div
      className={[
        'loading-overlay-host',
        loading ? 'is-loading' : '',
        dim ? 'loading-overlay-host--dim' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {children}
      {loading ? (
        <div className="loading-overlay" role="presentation">
          <PageLoader variant="overlay" label={label} />
        </div>
      ) : null}
    </div>
  );
}
