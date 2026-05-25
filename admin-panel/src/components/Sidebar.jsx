import { useState, useEffect, useCallback } from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard, ListVideo, ScrollText, Settings,
  Bot, Play, Square, Loader
} from 'lucide-react';
import { fetchBotStatus, startBot, stopBot } from '../data/api';

const navItems = [
  { icon: LayoutDashboard, label: 'Dashboard', to: '/' },
  { icon: ListVideo,       label: 'Jobs',      to: '/jobs', badge: null },
  { icon: ScrollText,      label: 'Logs',      to: '/logs' },
  { icon: Settings,        label: 'Settings',  to: '/settings' },
];

export default function Sidebar() {
  const [online, setOnline]         = useState(null); // null = unknown
  const [toggling, setToggling]     = useState(false);
  const [error, setError]           = useState('');

  const poll = useCallback(async () => {
    try {
      const { online: o } = await fetchBotStatus();
      setOnline(o);
      setError('');
    } catch {
      setOnline(null); // API unreachable
    }
  }, []);

  // Poll bot status every 5 seconds
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
      // Re-poll after a short delay to let polling state settle
      setTimeout(poll, 800);
    } catch (e) {
      setError(e.message);
    } finally {
      setToggling(false);
    }
  };

  // Status derived values
  const statusColor   = online === null ? '#4a5568' : online ? '#22c55e' : '#ef4444';
  const statusLabel   = online === null ? 'Connecting…' : online ? 'Bot Online' : 'Bot Offline';
  const statusSub     = online === null ? 'API unreachable' : online ? 'Telegram polling' : 'Polling stopped';
  const btnLabel      = toggling ? '…' : online ? 'Stop' : 'Start';
  const BtnIcon       = toggling ? Loader : online ? Square : Play;

  return (
    <aside className="sidebar">
      {/* Logo */}
      <div className="sidebar-logo">
        <div className="logo-mark">
          <img src="/logo.jpg" alt="Dhamma Channel logo" className="logo-image" />
          <div>
            <div className="logo-text">မုဒြာ Dhamma Channel</div>
            <div className="logo-sub">Admin Panel</div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="sidebar-nav">
        <div className="nav-section-title">Navigation</div>
        {navItems.map(({ icon: Icon, label, to, badge }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
          >
            <Icon size={16} />
            {label}
            {badge !== null && badge !== undefined && (
              <span className="nav-badge">{badge}</span>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Bot control footer */}
      <div className="sidebar-footer">
        {/* Status indicator */}
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

        {/* Start / Stop button */}
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

        {/* Inline error */}
        {error && (
          <div style={{ fontSize: 11, color: 'var(--red)', marginTop: 6, textAlign: 'center' }}>
            {error}
          </div>
        )}
      </div>
    </aside>
  );
}
