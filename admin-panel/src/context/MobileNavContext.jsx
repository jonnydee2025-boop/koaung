import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

const MobileNavContext = createContext(null);

export function MobileNavProvider({ children }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const openSidebar = useCallback(() => setSidebarOpen(true), []);
  const closeSidebar = useCallback(() => setSidebarOpen(false), []);
  const toggleSidebar = useCallback(() => setSidebarOpen((open) => !open), []);

  useEffect(() => {
    document.documentElement.classList.toggle('mobile-nav-open', sidebarOpen);
    return () => {
      document.documentElement.classList.remove('mobile-nav-open');
    };
  }, [sidebarOpen]);

  const value = useMemo(
    () => ({
      sidebarOpen,
      openSidebar,
      closeSidebar,
      toggleSidebar,
    }),
    [sidebarOpen, openSidebar, closeSidebar, toggleSidebar],
  );

  return (
    <MobileNavContext.Provider value={value}>{children}</MobileNavContext.Provider>
  );
}

export function useMobileNav() {
  const context = useContext(MobileNavContext);
  if (!context) {
    throw new Error('useMobileNav must be used within MobileNavProvider');
  }
  return context;
}
