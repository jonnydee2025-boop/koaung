export default function ErrorBanner({ message, className = '' }) {
  if (!message) {
    return null;
  }

  return (
    <div className={`error-banner${className ? ` ${className}` : ''}`.trim()} role="alert">
      ⚠ {message}
    </div>
  );
}
