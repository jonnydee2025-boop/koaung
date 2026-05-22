import { lazy, Suspense, useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import PageLoader from './components/PageLoader';
import Logs from './pages/Logs';
import Settings from './pages/Settings';
import Login from './pages/Login';
import { isAuthenticated } from './data/adminAuth';

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

export default function App() {
  return (
    <BrowserRouter>
      <RequireAuth>
      <div className="app-layout">
        <Sidebar />
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
      </RequireAuth>
    </BrowserRouter>
  );
}
