import { NavLink } from 'react-router-dom';
import { LayoutDashboard, ListVideo, ScrollText, Settings } from 'lucide-react';

const TABS = [
  { to: '/', label: 'Home', icon: LayoutDashboard, end: true },
  { to: '/jobs', label: 'Jobs', icon: ListVideo },
  { to: '/logs', label: 'Logs', icon: ScrollText },
  { to: '/general', label: 'Settings', icon: Settings },
];

export default function BottomNav() {
  return (
    <nav className="bottom-nav" aria-label="Main navigation">
      {TABS.map(({ to, label, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          className={({ isActive }) => `bottom-nav-item${isActive ? ' is-active' : ''}`}
        >
          <Icon size={20} aria-hidden />
          <span>{label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
