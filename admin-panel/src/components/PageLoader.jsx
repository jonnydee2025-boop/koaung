import Spinner from './Spinner';

export default function PageLoader({
  label = 'Loading…',
  variant = 'page',
  hideLabel = false,
}) {
  return (
    <div
      className={`page-loader page-loader--${variant}`}
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label={hideLabel ? label : undefined}
    >
      <Spinner size={variant === 'inline' || variant === 'overlay' ? 'sm' : 'md'} />
      {!hideLabel && label ? <span className="page-loader-label">{label}</span> : null}
    </div>
  );
}
