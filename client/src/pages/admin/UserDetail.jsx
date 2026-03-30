import React, { useState, useEffect } from 'react';
import { apiFetch } from '../../lib/api';
import UserForm from './UserForm';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_COLORS = {
  active:    { bg: 'rgba(63,185,80,0.12)',   border: 'rgba(63,185,80,0.35)',   text: '#3fb950' },
  suspended: { bg: 'rgba(227,179,65,0.12)',  border: 'rgba(227,179,65,0.35)', text: '#e3b341' },
  archived:  { bg: 'rgba(110,118,129,0.12)', border: 'rgba(110,118,129,0.35)', text: '#6e7681' },
};

function StatusBadge({ status }) {
  const colors = STATUS_COLORS[status] || STATUS_COLORS.archived;
  return (
    <span
      className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold tracking-wider"
      style={{ background: colors.bg, border: `1px solid ${colors.border}`, color: colors.text }}
    >
      {status ? status.toUpperCase() : 'UNKNOWN'}
    </span>
  );
}

function InfoRow({ label, children }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs font-semibold tracking-wider" style={{ color: '#6e7681' }}>
        {label}
      </span>
      <div className="text-sm" style={{ color: '#f0ece3' }}>
        {children}
      </div>
    </div>
  );
}

function formatDate(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString(undefined, {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function Initials({ name }) {
  const parts = (name || '?').trim().split(/\s+/);
  const letters = parts.length >= 2
    ? parts[0][0] + parts[parts.length - 1][0]
    : (name || '?').slice(0, 2);
  return (
    <div
      className="flex items-center justify-center rounded-full flex-shrink-0 font-bold text-lg"
      style={{
        width: '56px', height: '56px',
        background: 'rgba(212,175,55,0.15)',
        border: '2px solid rgba(212,175,55,0.3)',
        color: '#d4af37',
        letterSpacing: '0.05em',
        userSelect: 'none',
      }}
    >
      {letters.toUpperCase()}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function UserDetail({ userId, onClose, onUpdated }) {
  const [user, setUser]         = useState(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);
  const [editing, setEditing]   = useState(false);

  useEffect(() => {
    if (!userId) return;
    loadUser();
  }, [userId]);

  // Close on Escape key
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape' && !editing) onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose, editing]);

  async function loadUser() {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch(`/api/admin/users/${userId}`);
      setUser(data);
    } catch (err) {
      setError(err.message || 'Failed to load user');
    } finally {
      setLoading(false);
    }
  }

  function handleSaved() {
    loadUser();
    if (onUpdated) onUpdated();
  }

  // If editing, render the form modal on top
  if (editing && user) {
    return (
      <UserForm
        user={user}
        onClose={() => setEditing(false)}
        onSaved={handleSaved}
      />
    );
  }

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(2px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* Dialog */}
      <div
        className="w-full max-w-lg rounded-xl shadow-2xl flex flex-col"
        style={{
          background: '#161b22',
          border: '1px solid #30363d',
          boxShadow: '0 8px 48px rgba(0,0,0,0.8)',
          maxHeight: '90vh',
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4 flex-shrink-0"
          style={{ borderBottom: '1px solid #30363d' }}
        >
          <span className="text-sm font-bold tracking-[0.15em]" style={{ color: '#d4af37' }}>
            USER PROFILE
          </span>
          <button
            onClick={onClose}
            className="flex items-center justify-center rounded transition-colors"
            style={{ width: '28px', height: '28px', color: '#6e7681', background: 'none', border: 'none', cursor: 'pointer' }}
            onMouseEnter={(e) => { e.currentTarget.style.color = '#f0ece3'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = '#6e7681'; }}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-5">

          {loading && (
            <div className="flex items-center justify-center py-12">
              <span className="text-sm" style={{ color: '#6e7681' }}>Loading…</span>
            </div>
          )}

          {error && (
            <div
              className="rounded px-3 py-2.5 text-sm"
              style={{
                background: 'rgba(248,81,73,0.1)',
                border: '1px solid rgba(248,81,73,0.3)',
                color: '#f85149',
              }}
            >
              {error}
            </div>
          )}

          {!loading && !error && user && (
            <div className="flex flex-col gap-5">

              {/* Avatar + name + status */}
              <div className="flex items-center gap-4">
                <Initials name={user.display_name} />
                <div className="flex flex-col gap-1.5 min-w-0">
                  <span className="text-base font-bold truncate" style={{ color: '#f0ece3' }}>
                    {user.display_name || '—'}
                  </span>
                  <div className="flex items-center gap-2 flex-wrap">
                    <StatusBadge status={user.status} />
                    {user.role && (
                      <span
                        className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium"
                        style={{ background: 'rgba(88,166,255,0.1)', border: '1px solid rgba(88,166,255,0.25)', color: '#58a6ff' }}
                      >
                        {user.role}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Divider */}
              <div style={{ height: '1px', background: '#21262d' }} />

              {/* Detail grid */}
              <div className="grid grid-cols-1 gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))' }}>
                <InfoRow label="Email">
                  {user.email || <span style={{ color: '#6e7681' }}>—</span>}
                </InfoRow>

                <InfoRow label="Last Seen">
                  {formatDate(user.last_seen || user.created_at)}
                </InfoRow>

                <InfoRow label="Created At">
                  {formatDate(user.created_at)}
                </InfoRow>

                {user.created_by_name && (
                  <InfoRow label="Created By">
                    {user.created_by_name}
                  </InfoRow>
                )}
              </div>

              {/* Roles with timestamps (if roles array provided) */}
              {Array.isArray(user.roles) && user.roles.length > 0 && (
                <>
                  <div style={{ height: '1px', background: '#21262d' }} />
                  <div>
                    <span className="text-xs font-semibold tracking-wider block mb-2" style={{ color: '#6e7681' }}>
                      ROLE HISTORY
                    </span>
                    <div className="flex flex-col gap-1.5">
                      {user.roles.map((r, i) => (
                        <div
                          key={i}
                          className="flex items-center justify-between rounded px-3 py-2"
                          style={{ background: '#0d1117', border: '1px solid #21262d' }}
                        >
                          <span
                            className="text-xs font-medium"
                            style={{
                              color: r.active ? '#58a6ff' : '#6e7681',
                              textDecoration: r.active ? 'none' : 'line-through',
                            }}
                          >
                            {r.role}
                          </span>
                          {r.assigned_at && (
                            <span className="text-xs font-mono" style={{ color: '#6e7681' }}>
                              {formatDate(r.assigned_at)}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        {!loading && !error && user && (
          <div
            className="flex items-center justify-end gap-3 px-5 py-4 flex-shrink-0"
            style={{ borderTop: '1px solid #30363d' }}
          >
            <button
              onClick={onClose}
              className="px-4 py-2 rounded text-sm font-medium transition-colors"
              style={{
                background: 'none',
                border: '1px solid #30363d',
                color: '#8b949e',
                cursor: 'pointer',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#6e7681'; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#30363d'; }}
            >
              Close
            </button>
            <button
              onClick={() => setEditing(true)}
              className="px-4 py-2 rounded text-sm font-bold tracking-wider transition-colors"
              style={{
                background: '#d4af37',
                border: '1px solid transparent',
                color: '#0d1117',
                cursor: 'pointer',
              }}
            >
              EDIT
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
