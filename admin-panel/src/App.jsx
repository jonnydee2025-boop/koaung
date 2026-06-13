import { lazy, Suspense, useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import BottomNav from './components/BottomNav';
import PageLoader from './components/PageLoader';
import ErrorBoundary from './components/ErrorBoundary';
import RouteFallback from './components/RouteFallback';
import Login from './pages/Login';
import { isAuthenticated } from './data/adminAuth';
import { SETTINGS_SECTIONS } from './data/settingsSections';
import { MobileNavProvider, useMobileNav } from './context/MobileNavContext';
import { ToastProvider } from './context/ToastContext';
import { ConfirmProvider } from './context/ConfirmContext';

const Dashboard = lazy(() => import('./pages/Dashboard'));
const Jobs = lazy(() => import('./pages/Jobs'));
const Logs = lazy(() => import('./pages/Logs'));
const Settings = lazy(() => import('./pages/Settings'));

function LazyPage({ children }) {
  const location = useLocation();
  return (
    <Suspense key={location.pathname} fallback={<PageLoader />}>
      {children}
    </Suspense>
  );
}

function RequireAuth({ children }) {
  const [authed, setAuthed] = useState(isAuthenticated);

  useEffect(() => {
    const onExpire = () => setAuthed(false);
    window.addEventListener('admin-auth-expired', onExpire);
    return () => window.removeEventListener('admin-auth-expired', onExpire);
  }, []);

  if (!authed) {
    return <Login onSuccess={() => setAuthed(true)} />;
  }

  return children;
}

function AppShell() {
  const { sidebarOpen, closeSidebar } = useMobileNav();
  const location = useLocation();

  return (
    <div className={`app-layout${sidebarOpen ? ' sidebar-open' : ''}`}>
      {sidebarOpen && (
        <button
          type="button"
          className="sidebar-backdrop"
          aria-label="Close navigation menu"
          onClick={closeSidebar}
        />
      )}
      <Sidebar open={sidebarOpen} onClose={closeSidebar} />
      <div className="main-content">
        <ErrorBoundary resetKey={location.pathname}>
          <Routes>
            <Route
              path="/"
              element={
                <LazyPage>
                  <Dashboard />
                </LazyPage>
              }
            />
            <Route
              path="/jobs"
              element={
                <LazyPage>
                  <Jobs />
                </LazyPage>
              }
            />
            <Route
              path="/logs"
              element={
                <LazyPage>
                  <Logs />
                </LazyPage>
              }
            />
            <Route path="/settings" element={<Navigate to="/general" replace />} />
            {SETTINGS_SECTIONS.map(({ path }) => (
              <Route
                key={path}
                path={path}
                element={
                  <LazyPage>
                    <Settings />
                  </LazyPage>
                }
              />
            ))}
            <Route path="*" element={<RouteFallback />} />
          </Routes>
        </ErrorBoundary>
      </div>
      <BottomNav />
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <RequireAuth>
        <ToastProvider>
          <ConfirmProvider>
            <MobileNavProvider>
              <AppShell />
            </MobileNavProvider>
          </ConfirmProvider>
        </ToastProvider>
      </RequireAuth>
    </BrowserRouter>
  );
}
