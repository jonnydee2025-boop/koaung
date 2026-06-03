import { Navigate, useLocation } from 'react-router-dom';

/** Unknown paths — avoid blank screen on typos or stale bookmarks. */
export default function RouteFallback() {
  const { pathname } = useLocation();

  if (pathname === '/settings' || pathname.startsWith('/settings/')) {
    return <Navigate to="/general" replace />;
  }

  return <Navigate to="/" replace />;
}
