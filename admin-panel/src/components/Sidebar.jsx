import { useState, useEffect, useCallback } from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard, ListVideo, ScrollText,
  Bot, Play, Square, Loader, X,
} from 'lucide-react';
import { fetchBotStatus, startBot, stopBot } from '../data/api';
import { SETTINGS_SECTIONS } from '../data/settingsSections';
import { prefetchRouteData } from '../hooks/routePrefetch';
import { useConfirm } from '../context/ConfirmContext';
import { useToast } from '../context/ToastContext';

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
  const confirm = useConfirm();
  const { showSuccess, showError } = useToast();

  const poll = useCallback(async () => {
    try {
      const { online: o } = await fetchBotStatus();
      setOnline(o);
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
    if (online) {
      const ok = await confirm({
        title: 'Stop bot?',
        message:
          'Telegram polling will stop. Scheduled and repeat jobs will not run until you start the bot again.',
        confirmLabel: 'Stop bot',
        cancelLabel: 'Keep running',
        variant: 'danger',
      });
      if (!ok) {
        return;
      }
    }

    setToggling(true);
    try {
      if (online) {
        await stopBot();
        showSuccess('Bot stopped.');
      } else {
        await startBot();
        showSuccess('Bot started.');
      }
      setTimeout(poll, 800);
    } catch (e) {
      showError(e.message);
    } finally {
      setToggling(false);
    }
  };

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
        <div className="bot-status sidebar-bot-status">
          <div
            className={`status-dot${online === false ? ' offline' : ''}${online === null ? ' is-unknown' : ''}`}
          />
          <div>
            <div className="status-label">{statusLabel}</div>
            <div className="status-sub">{statusSub}</div>
          </div>
          <Bot size={14} className="sidebar-bot-icon" aria-hidden />
        </div>

        <button
          id="btn-bot-toggle"
          className={`sidebar-bot-toggle${online ? ' is-online' : ''}${online === null ? ' is-unknown' : ''}`}
          onClick={handleToggle}
          disabled={toggling || online === null}
        >
          <BtnIcon size={14} className={toggling ? 'icon-spin' : undefined} />
          {btnLabel} Bot
        </button>
      </div>
    </aside>
  );
}
