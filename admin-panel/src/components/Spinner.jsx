export default function Spinner({ size = 'md', className = '' }) {
  return (
    <div
      className={`ui-spinner ui-spinner--${size}${className ? ` ${className}` : ''}`}
      aria-hidden="true"
    />
  );
}
