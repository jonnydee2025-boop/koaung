import { lazy, Suspense, useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import PageLoader from './components/PageLoader';
import Logs from './pages/Logs';
import Settings from './pages/Settings';
import Login from './pages/Login';
import { isAuthenticated } from './data/adminAuth';
import { MobileNavProvider, useMobileNav } from './context/MobileNavContext';

const Dashboard = lazy(() => import('./pages/Dashboard'));
const Jobs = lazy(() => import('./pages/Jobs'));

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
          <Route path="/logs" element={<Logs />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <RequireAuth>
        <MobileNavProvider>
          <AppShell />
        </MobileNavProvider>
      </RequireAuth>
    </BrowserRouter>
  );
}
