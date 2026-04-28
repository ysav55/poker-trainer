import React, { useState, useEffect } from 'react';
import { apiFetch } from '../../lib/api';

const ROLES = ['superadmin', 'admin', 'coach', 'coached_student', 'solo_student'];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function FieldLabel({ htmlFor, children }) {
  return (
    <label
      htmlFor={htmlFor}
      className="block text-xs font-semibold tracking-wider mb-1"
      style={{ color: '#8b949e' }}
    >
      {children}
    </label>
  );
}

function TextInput({ id, value, onChange, placeholder, type = 'text', required = false, disabled = false }) {
  return (
    <input
      id={id}
      type={type}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      required={required}
      disabled={disabled}
      className="w-full rounded px-3 py-2 text-sm outline-none transition-colors"
      style={{
        background: '#0d1117',
        border: '1px solid #30363d',
        color: '#f0ece3',
        opacity: disabled ? 0.5 : 1,
      }}
      onFocus={(e) => { e.currentTarget.style.borderColor = '#d4af37'; }}
      onBlur={(e) => { e.currentTarget.style.borderColor = '#30363d'; }}
    />
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function UserForm({ onClose, onSaved }) {
  const [name, setName]         = useState('');
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole]         = useState('coached_student');
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState(null);
  const [coaches,  setCoaches]  = useState([]);
  const [coachId,  setCoachId]  = useState('');

  // Load coaches when role is coached_student
  useEffect(() => {
    if (role !== 'coached_student') {
      setCoachId('');
      setCoaches([]);
      return;
    }
    let cancelled = false;
    apiFetch('/api/admin/users?role=coach')
      .then((data) => {
        if (!cancelled) setCoaches(data?.players ?? []);
      })
      .catch(() => {
        if (!cancelled) setCoaches([]);
      });
    return () => { cancelled = true; };
  }, [role]);

  // Close on Escape key
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setSaving(true);

    try {
      const body = { display_name: name.trim(), email: email.trim(), role, password };
      if (coachId) body.coachId = coachId;

      await apiFetch('/api/admin/users', {
        method: 'POST',
        body: JSON.stringify(body),
      });

      onSaved();
      onClose();
    } catch (err) {
      setError(err.message || 'An unexpected error occurred');
    } finally {
      setSaving(false);
    }
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
        className="w-full max-w-md rounded-xl shadow-2xl flex flex-col"
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
            CREATE USER
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
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-5 py-4">
          <div className="flex flex-col gap-4">

            {/* Name */}
            <div>
              <FieldLabel htmlFor="uf-name">Name <span style={{ color: '#f85149' }}>*</span></FieldLabel>
              <TextInput
                id="uf-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Display name"
                required
              />
            </div>

            {/* Email */}
            <div>
              <FieldLabel htmlFor="uf-email">Email</FieldLabel>
              <TextInput
                id="uf-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="user@example.com"
              />
            </div>

            {/* Password */}
            <div>
              <FieldLabel htmlFor="uf-password">Password <span style={{ color: '#f85149' }}>*</span></FieldLabel>
              <TextInput
                id="uf-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Minimum 8 characters"
                required
              />
            </div>

            {/* Role */}
            <div>
              <FieldLabel htmlFor="uf-role">Role</FieldLabel>
              <select
                id="uf-role"
                data-testid="role-select"
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="w-full rounded px-3 py-2 text-sm outline-none transition-colors"
                style={{
                  background: '#0d1117',
                  border: '1px solid #30363d',
                  color: '#f0ece3',
                  cursor: 'pointer',
                }}
                onFocus={(e) => { e.currentTarget.style.borderColor = '#d4af37'; }}
                onBlur={(e) => { e.currentTarget.style.borderColor = '#30363d'; }}
              >
                {ROLES.map((r) => (
                  <option key={r} value={r} style={{ background: '#161b22' }}>
                    {r.charAt(0).toUpperCase() + r.slice(1)}
                  </option>
                ))}
              </select>
            </div>

            {/* Coach assignment — only for coached_student */}
            {role === 'coached_student' && (
              <div>
                <FieldLabel htmlFor="uf-coach">Assign Coach</FieldLabel>
                <select
                  id="uf-coach"
                  data-testid="coach-select"
                  value={coachId}
                  onChange={(e) => setCoachId(e.target.value)}
                  className="w-full rounded px-3 py-2 text-sm outline-none transition-colors"
                  style={{
                    background: '#0d1117',
                    border: '1px solid #30363d',
                    color: '#f0ece3',
                    cursor: 'pointer',
                  }}
                  onFocus={(e) => { e.currentTarget.style.borderColor = '#d4af37'; }}
                  onBlur={(e) => { e.currentTarget.style.borderColor = '#30363d'; }}
                >
                  <option value="" style={{ background: '#161b22' }}>— Unassigned —</option>
                  {coaches.map((c) => (
                    <option key={c.id} value={c.id} style={{ background: '#161b22' }}>
                      {c.display_name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Inline error */}
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
          </div>
        </form>

        {/* Footer */}
        <div
          className="flex items-center justify-end gap-3 px-5 py-4 flex-shrink-0"
          style={{ borderTop: '1px solid #30363d' }}
        >
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 rounded text-sm font-medium transition-colors"
            style={{
              background: 'none',
              border: '1px solid #30363d',
              color: '#8b949e',
              cursor: 'pointer',
              opacity: saving ? 0.5 : 1,
            }}
            onMouseEnter={(e) => { if (!saving) e.currentTarget.style.borderColor = '#6e7681'; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#30363d'; }}
          >
            Cancel
          </button>
          <button
            type="submit"
            onClick={handleSubmit}
            disabled={saving || !name.trim() || !password}
            className="px-4 py-2 rounded text-sm font-bold tracking-wider transition-colors"
            style={{
              background: saving ? 'rgba(212,175,55,0.3)' : '#d4af37',
              border: '1px solid transparent',
              color: saving ? '#6e7681' : '#0d1117',
              cursor: saving ? 'not-allowed' : 'pointer',
              opacity: (!name.trim() || !password) ? 0.4 : 1,
            }}
          >
            {saving ? 'SAVING…' : 'CREATE'}
          </button>
        </div>
      </div>
    </div>
  );
}
