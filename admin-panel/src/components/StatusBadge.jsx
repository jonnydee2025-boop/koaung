import { statusThemeFor } from '../data/statusTheme';

export default function StatusBadge({ status }) {
  const theme = statusThemeFor(status);
  return (
    <span className={`badge ${theme.badgeClass}`}>
      <span className="badge-dot" />
      {theme.label}
    </span>
  );
}
