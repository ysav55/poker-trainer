import React, { useState, useCallback, useEffect } from 'react';
import { apiFetch } from '../lib/api';

// ── Constants ──────────────────────────────────────────────────────────────────

const ORDERING_OPTIONS = [
  { value: 'sequential', label: 'Sequential' },
  { value: 'random',     label: 'Random' },
  { value: 'manual',     label: 'Manual Pick' },
];

const ADVANCE_OPTIONS = [
  { value: 'auto',   label: 'Auto-load' },
  { value: 'manual', label: 'Manual trigger' },
];

// ── Helpers ────────────────────────────────────────────────────────────────────

function sectionLabel(text) {
  return (
    <div style={{
      fontSize: 9, fontWeight: 700, letterSpacing: '0.15em',
      color: '#6e7681', textTransform: 'uppercase', marginBottom: 8,
    }}>
      {text}
    </div>
  );
}

function FieldInput({ label, value, onChange, placeholder = '' }) {
  return (
    <div className="mb-4">
      {sectionLabel(label)}
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          width: '100%', padding: '7px 10px', borderRadius: 4,
          border: '1px solid #30363d', background: '#0d1117',
          color: '#f0ece3', fontSize: 12, outline: 'none',
          boxSizing: 'border-box',
        }}
        onFocus={e => { e.target.style.borderColor = 'rgba(212,175,55,0.5)'; }}
        onBlur={e => { e.target.style.borderColor = '#30363d'; }}
      />
    </div>
  );
}

function SelectToggle({ label, options, value, onChange }) {
  return (
    <div className="mb-4">
      {sectionLabel(label)}
      <div className="flex gap-1">
        {options.map(opt => {
          const active = value === opt.value;
          return (
            <button
              key={opt.value}
              onClick={() => onChange(opt.value)}
              style={{
                padding: '4px 10px', borderRadius: 4, fontSize: 11, fontWeight: 600,
                cursor: 'pointer', transition: 'all 0.1s',
                background: active ? 'rgba(212,175,55,0.15)' : 'none',
                border: active ? '1px solid rgba(212,175,55,0.5)' : '1px solid #30363d',
                color: active ? '#d4af37' : '#6e7681',
              }}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ScenarioRow({ entry, index, total, onRemove, onMoveUp, onMoveDown }) {
  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '7px 10px', borderRadius: 4,
        background: index % 2 === 0 ? '#0d1117' : 'rgba(255,255,255,0.015)',
        border: '1px solid #21262d', marginBottom: 4,
      }}
    >
      <span style={{ fontSize: 11, color: '#6e7681', minWidth: 20, textAlign: 'center' }}>
        {index + 1}
      </span>
      <span style={{ flex: 1, fontSize: 12, color: '#f0ece3', fontWeight: 500 }}>
        {entry.hand_id?.slice(0, 8)}…
      </span>
      {entry.phase_ended && (
        <span style={{
          fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
          padding: '2px 6px', borderRadius: 3,
          background: 'rgba(63,185,80,0.1)', border: '1px solid rgba(63,185,80,0.25)',
          color: '#3fb950',
        }}>
          {entry.phase_ended}
        </span>
      )}
      <div className="flex gap-1">
        <button
          onClick={onMoveUp}
          disabled={index === 0}
          style={{
            width: 22, height: 22, borderRadius: 3, border: '1px solid #30363d',
            background: 'none', color: '#6e7681', cursor: index === 0 ? 'not-allowed' : 'pointer',
            fontSize: 10, display: 'flex', alignItems: 'center', justifyContent: 'center',
            opacity: index === 0 ? 0.3 : 1,
          }}
          title="Move up"
        >
          ▲
        </button>
        <button
          onClick={onMoveDown}
          disabled={index === total - 1}
          style={{
            width: 22, height: 22, borderRadius: 3, border: '1px solid #30363d',
            background: 'none', color: '#6e7681', cursor: index === total - 1 ? 'not-allowed' : 'pointer',
            fontSize: 10, display: 'flex', alignItems: 'center', justifyContent: 'center',
            opacity: index === total - 1 ? 0.3 : 1,
          }}
          title="Move down"
        >
          ▼
        </button>
        <button
          onClick={onRemove}
          style={{
            width: 22, height: 22, borderRadius: 3, border: '1px solid rgba(248,81,73,0.3)',
            background: 'none', color: '#f85149', cursor: 'pointer',
            fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
          title="Remove from playlist"
        >
          ×
        </button>
      </div>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function PlaylistEditor({ playlist, onClose, onSaved }) {
  const isNew = !playlist?.playlist_id;

  const [name, setName]         = useState(playlist?.name ?? '');
  const [ordering, setOrdering] = useState('sequential');
  const [advance, setAdvance]   = useState('manual');
  const [hands, setHands]       = useState([]);
  const [handsLoading, setHandsLoading] = useState(!isNew);
  const [saving, setSaving]     = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError]       = useState(null);
  const [success, setSuccess]   = useState(false);

  // Load hands for existing playlist
  useEffect(() => {
    if (isNew) return;
    setHandsLoading(true);
    apiFetch(`/api/playlists/${playlist.playlist_id}/hands`)
      .then(data => setHands(Array.isArray(data?.hands) ? data.hands : []))
      .catch(() => setHands([]))
      .finally(() => setHandsLoading(false));
  }, [playlist?.playlist_id, isNew]);

  const handleMoveUp = useCallback((idx) => {
    setHands(prev => {
      if (idx === 0) return prev;
      const next = [...prev];
      [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
      return next;
    });
  }, []);

  const handleMoveDown = useCallback((idx) => {
    setHands(prev => {
      if (idx === prev.length - 1) return prev;
      const next = [...prev];
      [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
      return next;
    });
  }, []);

  const handleRemove = useCallback(async (handId) => {
    if (isNew) {
      setHands(prev => prev.filter(h => h.hand_id !== handId));
      return;
    }
    try {
      await apiFetch(`/api/playlists/${playlist.playlist_id}/hands/${handId}`, { method: 'DELETE' });
      setHands(prev => prev.filter(h => h.hand_id !== handId));
    } catch (err) {
      setError(err.message ?? 'Remove failed');
    }
  }, [isNew, playlist?.playlist_id]);

  const handleSave = useCallback(async () => {
    if (!name.trim()) { setError('Name is required'); return; }
    setSaving(true);
    setError(null);
    try {
      if (isNew) {
        await apiFetch('/api/playlists', {
          method: 'POST',
          body: JSON.stringify({ name: name.trim() }),
        });
      } else {
        // Playlist name update — no dedicated PATCH endpoint yet, just reflect locally
      }
      setSuccess(true);
      setTimeout(() => { onSaved?.(); }, 700);
    } catch (err) {
      setError(err.message ?? 'Save failed');
    } finally {
      setSaving(false);
    }
  }, [isNew, name, onSaved]);

  const handleDelete = useCallback(async () => {
    if (isNew || !playlist?.playlist_id) return;
    if (!window.confirm(`Delete playlist "${playlist.name}"? This cannot be undone.`)) return;
    setDeleting(true);
    try {
      await apiFetch(`/api/playlists/${playlist.playlist_id}`, { method: 'DELETE' });
      onClose?.();
      onSaved?.();
    } catch (err) {
      setError(err.message ?? 'Delete failed');
    } finally {
      setDeleting(false);
    }
  }, [isNew, playlist, onClose, onSaved]);

  return (
    <div className="flex flex-col h-full" style={{ background: '#0d1117', overflow: 'hidden' }}>
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 flex-shrink-0"
        style={{ borderBottom: '1px solid #30363d' }}
      >
        <span style={{ color: '#d4af37', fontSize: 11, fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase' }}>
          {isNew ? 'New Playlist' : 'Edit Playlist'}
        </span>
        {onClose && (
          <button
            onClick={onClose}
            style={{
              width: 28, height: 28, borderRadius: 4, border: '1px solid #30363d',
              background: 'none', color: '#6e7681', cursor: 'pointer', fontSize: 16,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = '#d4af37'; e.currentTarget.style.color = '#d4af37'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = '#30363d'; e.currentTarget.style.color = '#6e7681'; }}
          >
            ×
          </button>
        )}
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto" style={{ padding: '16px' }}>

        <FieldInput label="Name" value={name} onChange={setName} placeholder="e.g. River Decisions Vol. 1" />

        <SelectToggle
          label="Ordering"
          options={ORDERING_OPTIONS}
          value={ordering}
          onChange={setOrdering}
        />

        <SelectToggle
          label="Advance"
          options={ADVANCE_OPTIONS}
          value={advance}
          onChange={setAdvance}
        />

        {/* Scenarios */}
        <div className="mb-5">
          {sectionLabel('Scenarios')}
          {handsLoading ? (
            <div style={{ color: '#444', fontSize: 11, padding: '12px 0' }}>Loading…</div>
          ) : hands.length === 0 ? (
            <div style={{
              padding: '20px', textAlign: 'center', borderRadius: 6,
              border: '1px dashed #21262d', color: '#444', fontSize: 11,
            }}>
              No scenarios in this playlist yet.
            </div>
          ) : (
            hands.map((entry, idx) => (
              <ScenarioRow
                key={entry.hand_id}
                entry={entry}
                index={idx}
                total={hands.length}
                onMoveUp={() => handleMoveUp(idx)}
                onMoveDown={() => handleMoveDown(idx)}
                onRemove={() => handleRemove(entry.hand_id)}
              />
            ))
          )}
        </div>

        {/* Assigned To — stub */}
        <div className="mb-5">
          {sectionLabel('Assigned To')}
          <div style={{
            padding: '12px 14px', borderRadius: 6,
            background: 'rgba(110,118,129,0.05)', border: '1px dashed #30363d',
            fontSize: 11, color: '#6e7681',
          }}>
            Student &amp; group assignment coming in a future update.
          </div>
        </div>

        {/* Error / success */}
        {error && (
          <div style={{
            marginBottom: 12, padding: '8px 12px', borderRadius: 4,
            background: 'rgba(248,81,73,0.08)', border: '1px solid rgba(248,81,73,0.25)',
            fontSize: 11, color: '#f85149',
          }}>
            {error}
          </div>
        )}
        {success && (
          <div style={{
            marginBottom: 12, padding: '8px 12px', borderRadius: 4,
            background: 'rgba(63,185,80,0.08)', border: '1px solid rgba(63,185,80,0.25)',
            fontSize: 11, color: '#3fb950',
          }}>
            Saved!
          </div>
        )}
      </div>

      {/* Footer */}
      <div
        className="flex items-center justify-between px-4 py-3 flex-shrink-0"
        style={{ borderTop: '1px solid #30363d', gap: 8 }}
      >
        {!isNew && (
          <button
            onClick={handleDelete}
            disabled={deleting}
            style={{
              padding: '6px 12px', borderRadius: 4,
              border: '1px solid rgba(248,81,73,0.3)', background: 'none',
              color: '#f85149', fontSize: 11, fontWeight: 600, cursor: 'pointer',
            }}
          >
            {deleting ? 'Deleting…' : 'Delete'}
          </button>
        )}
        <div className="flex-1" />
        <button
          onClick={onClose}
          style={{
            padding: '6px 14px', borderRadius: 4,
            border: '1px solid #30363d', background: 'none',
            color: '#6e7681', fontSize: 11, fontWeight: 600, cursor: 'pointer',
          }}
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            padding: '6px 16px', borderRadius: 4,
            background: saving ? '#a07a20' : '#d4af37', color: '#000',
            border: 'none', fontSize: 11, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer',
            letterSpacing: '0.06em',
          }}
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  );
}
