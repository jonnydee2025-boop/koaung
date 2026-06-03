import { useState, useEffect, useCallback } from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard, ListVideo, ScrollText,
  Bot, Play, Square, Loader, X,
} from 'lucide-react';
import { fetchBotStatus, startBot, stopBot } from '../data/api';
import { SETTINGS_SECTIONS } from '../data/settingsSections';
import { prefetchRouteData } from '../hooks/routePrefetch';

const primaryNavItems = [
  { icon: LayoutDashboard, label: 'Dashboard', to: '/' },
  { icon: ListVideo, label: 'Jobs', to: '/jobs', badge: null },
  { icon: ScrollText, label: 'Logs', to: '/logs' },
];

const settingsNavItems = SETTINGS_SECTIONS.map(({ icon, label, path }) => ({
  icon,
  label,
  to: path,
}));

const navItems = [...primaryNavItems, ...settingsNavItems];

export default function Sidebar({ open = false, onClose }) {
  const [online, setOnline] = useState(null);
  const [toggling, setToggling] = useState(false);
  const [error, setError] = useState('');

  const poll = useCallback(async () => {
    try {
      const { online: o } = await fetchBotStatus();
      setOnline(o);
      setError('');
    } catch {
      setOnline(null);
    }
  }, []);

  useEffect(() => {
    poll();
    const iv = setInterval(poll, 5000);
    return () => clearInterval(iv);
  }, [poll]);

  const handleToggle = async () => {
    setToggling(true);
    setError('');
    try {
      if (online) {
        await stopBot();
      } else {
        await startBot();
      }
      setTimeout(poll, 800);
    } catch (e) {
      setError(e.message);
    } finally {
      setToggling(false);
    }
  };

  const statusColor = online === null ? '#4a5568' : online ? '#22c55e' : '#ef4444';
  const statusLabel = online === null ? 'Connecting…' : online ? 'Bot Online' : 'Bot Offline';
  const statusSub = online === null ? 'API unreachable' : online ? 'Telegram polling' : 'Polling stopped';
  const btnLabel = toggling ? '…' : online ? 'Stop' : 'Start';
  const BtnIcon = toggling ? Loader : online ? Square : Play;

  return (
    <aside className={`sidebar${open ? ' is-open' : ''}`}>
      <div className="sidebar-logo">
        <div className="logo-mark">
          <img src="/logo.jpg" alt="Dhamma Channel logo" className="logo-image" />
          <div>
            <div className="logo-text">မုဒြာ Dhamma Channel</div>
            <div className="logo-sub">Admin Panel</div>
          </div>
          <button
            type="button"
            className="sidebar-close mobile-only"
            aria-label="Close navigation menu"
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </div>
      </div>

      <nav className="sidebar-nav">
        <div className="nav-section-title">Navigation</div>
        {navItems.map(({ icon: Icon, label, to, badge }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
            onClick={onClose}
            onMouseEnter={() => prefetchRouteData(to)}
            onFocus={() => prefetchRouteData(to)}
          >
            <Icon size={16} />
            {label}
            {badge !== null && badge !== undefined && (
              <span className="nav-badge">{badge}</span>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="sidebar-footer">
        <div className="bot-status" style={{ marginBottom: 10 }}>
          <div className="status-dot" style={{
            background: statusColor,
            boxShadow: `0 0 8px ${statusColor}`,
            animation: online ? 'pulse 2s infinite' : 'none',
          }} />
          <div>
            <div className="status-label">{statusLabel}</div>
            <div className="status-sub">{statusSub}</div>
          </div>
          <Bot size={14} style={{ marginLeft: 'auto', color: 'var(--text-muted)' }} />
        </div>

        <button
          id="btn-bot-toggle"
          onClick={handleToggle}
          disabled={toggling || online === null}
          style={{
            width: '100%',
            justifyContent: 'center',
            display: 'flex',
            alignItems: 'center',
            gap: 7,
            padding: '8px 14px',
            borderRadius: 6,
            border: 'none',
            fontSize: 13,
            fontWeight: 600,
            cursor: toggling || online === null ? 'not-allowed' : 'pointer',
            transition: 'all 0.2s',
            fontFamily: 'inherit',
            opacity: online === null ? 0.4 : 1,
            ...(online
              ? { background: 'rgba(239,68,68,0.15)', color: '#ef4444' }
              : { background: 'rgba(34,197,94,0.15)', color: '#22c55e' }
            ),
          }}
        >
          <BtnIcon size={14} style={toggling ? { animation: 'spin 1s linear infinite' } : {}} />
          {btnLabel} Bot
        </button>

        {error && (
          <div style={{ fontSize: 11, color: 'var(--red)', marginTop: 6, textAlign: 'center' }}>
            {error}
          </div>
        )}
      </div>
    </aside>
  );
}
