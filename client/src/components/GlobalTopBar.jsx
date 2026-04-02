import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext.jsx';

const ROLE_PILL = {
  coach:      { label: 'Coach',      bg: 'rgba(212,175,55,0.15)', color: '#d4af37', border: 'rgba(212,175,55,0.4)' },
  admin:      { label: 'Admin',      bg: 'rgba(59,130,246,0.15)', color: '#60a5fa', border: 'rgba(59,130,246,0.4)' },
  superadmin: { label: 'Admin',      bg: 'rgba(59,130,246,0.2)',  color: '#93c5fd', border: 'rgba(59,130,246,0.5)' },
  player:     { label: 'Student',    bg: 'rgba(34,197,94,0.12)',  color: '#4ade80', border: 'rgba(34,197,94,0.35)' },
  trial:      { label: 'Trial',      bg: 'rgba(100,116,139,0.15)', color: '#94a3b8', border: 'rgba(100,116,139,0.4)' },
  moderator:  { label: 'Moderator',  bg: 'rgba(139,92,246,0.12)', color: '#a78bfa', border: 'rgba(139,92,246,0.35)' },
  referee:    { label: 'Referee',    bg: 'rgba(100,116,139,0.15)', color: '#94a3b8', border: 'rgba(100,116,139,0.4)' },
};

/**
 * GlobalTopBar — sticky top bar for all authenticated lobby-style pages.
 *
 * Props:
 *   chipBalance {number|null}  — chip bank; null/undefined → shows "N/A"
 *   pageTitle   {string?}      — optional page title shown in center (omit for lobby)
 *   onBack      {fn?}          — if provided, shows a ← back button
 */
export default function GlobalTopBar({ chipBalance, pageTitle, onBack }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  const role = user?.role ?? 'player';
  const pill = ROLE_PILL[role] ?? ROLE_PILL.player;

  const initials = user?.name
    ? user.name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()
    : '?';

  const chipDisplay =
    chipBalance != null
      ? `🪙 ${Number(chipBalance).toLocaleString()}`
      : '🪙 N/A';

  // Close dropdown when clicking outside
  useEffect(() => {
    const handler = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <header
      className="flex items-center justify-between px-4 shrink-0 z-20"
      style={{
        height: 48,
        background: 'rgba(6,10,15,0.97)',
        borderBottom: '1px solid #21262d',
        backdropFilter: 'blur(8px)',
        position: 'sticky',
        top: 0,
      }}
    >
      {/* Left: logo + optional back + page title */}
      <div className="flex items-center gap-3">
        {onBack && (
          <button
            onClick={onBack}
            className="text-xs px-2 py-1 rounded transition-colors"
            style={{ color: '#8b949e', border: '1px solid #30363d' }}
          >
            ← Lobby
          </button>
        )}
        <button
          onClick={() => navigate('/lobby')}
          className="text-sm font-bold tracking-wide"
          style={{ color: '#d4af37' }}
        >
          ♠ POKER TRAINER
        </button>

        {pageTitle && (
          <>
            <span style={{ color: '#30363d' }}>·</span>
            <span className="text-sm font-medium" style={{ color: '#e6edf3' }}>
              {pageTitle}
            </span>
          </>
        )}
      </div>

      {/* Right: chip bank + role pill + avatar dropdown */}
      <div className="flex items-center gap-3">
        {/* Chip bank */}
        <span className="text-sm tabular-nums" style={{ color: '#8b949e' }}>
          {chipDisplay}
        </span>

        {/* Role pill */}
        <span
          className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-widest"
          style={{
            background: pill.bg,
            color: pill.color,
            border: `1px solid ${pill.border}`,
          }}
        >
          {pill.label}
        </span>

        {/* Avatar + dropdown */}
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setMenuOpen((o) => !o)}
            className="flex items-center gap-2 rounded-full px-2 py-1 transition-colors"
            style={{ border: '1px solid #30363d', background: 'rgba(255,255,255,0.04)' }}
          >
            <div
              className="flex items-center justify-center w-6 h-6 rounded-full text-[10px] font-bold"
              style={{ background: '#21262d', color: '#d4af37' }}
            >
              {initials}
            </div>
            <span className="text-xs hidden sm:inline" style={{ color: '#e6edf3' }}>
              {user?.name ?? 'User'}
            </span>
            <span className="text-[10px]" style={{ color: '#8b949e' }}>▾</span>
          </button>

          {menuOpen && (
            <div
              className="absolute right-0 mt-1 w-44 rounded-lg overflow-hidden z-50"
              style={{
                background: '#161b22',
                border: '1px solid #30363d',
                boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
                top: '100%',
              }}
            >
              <MenuItem
                label="Settings"
                onClick={() => { navigate('/settings'); setMenuOpen(false); }}
              />
              <div style={{ borderTop: '1px solid #30363d' }} />
              <MenuItem
                label="Log Out"
                color="#f87171"
                onClick={() => { logout(); navigate('/login'); }}
              />
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

function MenuItem({ label, color, onClick }) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left px-4 py-2.5 text-sm transition-colors"
      style={{ color: color ?? '#e6edf3', background: 'transparent' }}
      onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
    >
      {label}
    </button>
  );
}
