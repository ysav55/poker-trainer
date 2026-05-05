import { useState, useCallback, useEffect } from 'react';
import { apiFetch } from '../lib/api';
import ScenarioPickerModal from './ScenarioPickerModal';

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

// ── Shared sub-components ──────────────────────────────────────────────────────

function SectionLabel({ text }) {
  return (
    <div style={{
      fontSize: 9, fontWeight: 700, letterSpacing: '0.15em',
      color: '#6e7681', textTransform: 'uppercase', marginBottom: 6,
    }}>
      {text}
    </div>
  );
}

function SelectToggle({ label, options, value, onChange }) {
  return (
    <div className="mb-4">
      <SectionLabel text={label} />
      <div className="flex gap-1 flex-wrap">
        {options.map(opt => {
          const active = value === opt.value;
          return (
            <button
              key={opt.value}
              onClick={() => onChange(opt.value)}
              style={{
                padding: '4px 10px', borderRadius: 4, fontSize: 11, fontWeight: 600,
                cursor: 'pointer',
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

function TagEditor({ tags, onChange }) {
  const [input, setInput] = useState('');

  function commit() {
    const val = input.trim().toLowerCase();
    if (val && !tags.includes(val)) onChange([...tags, val]);
    setInput('');
  }

  return (
    <div className="mb-4">
      <SectionLabel text="Tags" />
      <div className="flex flex-wrap gap-1 mb-2">
        {tags.map(t => (
          <span
            key={t}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              padding: '2px 8px', borderRadius: 12, fontSize: 10, fontWeight: 600,
              background: 'rgba(212,175,55,0.1)', border: '1px solid rgba(212,175,55,0.25)',
              color: '#d4af37',
            }}
          >
            {t}
            <button
              onClick={() => onChange(tags.filter(x => x !== t))}
              style={{ background: 'none', border: 'none', color: '#d4af37', cursor: 'pointer', fontSize: 12, lineHeight: 1, padding: 0 }}
            >
              ×
            </button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); commit(); } }}
          placeholder="Add tag…"
          style={{
            flex: 1, padding: '5px 8px', borderRadius: 4, fontSize: 11,
            border: '1px solid #30363d', background: '#0d1117', color: '#f0ece3', outline: 'none',
          }}
          onFocus={e => { e.target.style.borderColor = 'rgba(212,175,55,0.5)'; }}
          onBlur={e => { e.target.style.borderColor = '#30363d'; commit(); }}
        />
      </div>
    </div>
  );
}

// ── Item row ───────────────────────────────────────────────────────────────────

function ItemRow({ item, index, total, onMoveUp, onMoveDown, onRemove }) {
  const scenario = item.scenario ?? {};
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
        {scenario.name ?? `Scenario ${item.scenario_id?.slice(0, 8)}…`}
      </span>
      {scenario.player_count && (
        <span style={{
          fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
          padding: '2px 6px', borderRadius: 3,
          background: 'rgba(110,118,129,0.1)', border: '1px solid #30363d',
          color: '#6e7681',
        }}>
          {scenario.player_count}p
        </span>
      )}
      <div className="flex gap-1">
        <button
          onClick={onMoveUp}
          disabled={index === 0}
          title="Move up"
          style={{
            width: 22, height: 22, borderRadius: 3, border: '1px solid #30363d',
            background: 'none', color: '#6e7681', cursor: index === 0 ? 'not-allowed' : 'pointer',
            fontSize: 10, display: 'flex', alignItems: 'center', justifyContent: 'center',
            opacity: index === 0 ? 0.3 : 1,
          }}
        >▲</button>
        <button
          onClick={onMoveDown}
          disabled={index === total - 1}
          title="Move down"
          style={{
            width: 22, height: 22, borderRadius: 3, border: '1px solid #30363d',
            background: 'none', color: '#6e7681', cursor: index === total - 1 ? 'not-allowed' : 'pointer',
            fontSize: 10, display: 'flex', alignItems: 'center', justifyContent: 'center',
            opacity: index === total - 1 ? 0.3 : 1,
          }}
        >▼</button>
        <button
          onClick={onRemove}
          title="Remove"
          style={{
            width: 22, height: 22, borderRadius: 3, border: '1px solid rgba(248,81,73,0.3)',
            background: 'none', color: '#f85149', cursor: 'pointer',
            fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >×</button>
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

/**
 * PlaylistEditor — create or edit a playlist using the new scenario-builder schema.
 *
 * Props:
 *   playlist  {object|null}  — existing playlist row, or null for new
 *   onClose   {() => void}
 *   onSaved   {() => void}
 */
export default function PlaylistEditor({ playlist, onClose, onSaved }) {
  const isNew = !playlist?.playlist_id;
  const playlistId = playlist?.playlist_id ?? null;

  // ── Form state ────────────────────────────────────────────────────────────
  const [name, setName]           = useState(playlist?.name ?? '');
  const [ordering, setOrdering]   = useState(playlist?.ordering ?? 'sequential');
  const [advanceMode, setAdvance] = useState(playlist?.advance_mode ?? 'manual');
  const [tags, setTags]           = useState(Array.isArray(playlist?.tags) ? playlist.tags : []);

  // ── Items state ───────────────────────────────────────────────────────────
  const [items, setItems]               = useState([]);
  const [itemsLoading, setItemsLoading] = useState(!isNew);

  // ── UI state ──────────────────────────────────────────────────────────────
  const [showPicker, setShowPicker] = useState(false);
  const [saving, setSaving]     = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError]       = useState(null);
  const [success, setSuccess]   = useState(false);

  // ── Load items for existing playlist ─────────────────────────────────────
  useEffect(() => {
    if (isNew || !playlistId) return;
    setItemsLoading(true);
    apiFetch(`/api/playlists/${playlistId}/items`)
      .then(data => setItems(Array.isArray(data?.items) ? data.items : []))
      .catch(() => setItems([]))
      .finally(() => setItemsLoading(false));
  }, [playlistId, isNew]);

  // ── Reorder helper — saves positions to server after local move ───────────
  const saveOrder = useCallback(async (reordered, id) => {
    const orderPayload = reordered.map((item, idx) => ({ id: item.id, position: idx }));
    try {
      await apiFetch(`/api/playlists/${id}/items/reorder`, {
        method: 'POST',
        body: JSON.stringify({ items: orderPayload }),
      });
    } catch {
      // non-fatal — local order already updated, server will re-sync on next load
    }
  }, []);

  const handleMoveUp = useCallback((idx) => {
    if (idx === 0) return;
    setItems(prev => {
      const next = [...prev];
      [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
      if (playlistId) saveOrder(next, playlistId);
      return next;
    });
  }, [playlistId, saveOrder]);

  const handleMoveDown = useCallback((idx) => {
    setItems(prev => {
      if (idx === prev.length - 1) return prev;
      const next = [...prev];
      [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
      if (playlistId) saveOrder(next, playlistId);
      return next;
    });
  }, [playlistId, saveOrder]);

  const handleRemove = useCallback(async (item) => {
    if (isNew) {
      setItems(prev => prev.filter(i => i.id !== item.id));
      return;
    }
    try {
      await apiFetch(`/api/playlists/${playlistId}/items/${item.id}`, { method: 'DELETE' });
      setItems(prev => prev.filter(i => i.id !== item.id));
    } catch (err) {
      setError(err.message ?? 'Remove failed');
    }
  }, [isNew, playlistId]);

  // ── Save ──────────────────────────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    if (!name.trim()) { setError('Name is required'); return; }
    setSaving(true);
    setError(null);
    try {
      if (isNew) {
        // Step 1: create with name
        const created = await apiFetch('/api/playlists', {
          method: 'POST',
          body: JSON.stringify({ name: name.trim() }),
        });
        const newId = created?.playlist_id ?? created?.id;
        // Step 2: patch new columns if server returned an id
        if (newId) {
          await apiFetch(`/api/playlists/${newId}`, {
            method: 'PATCH',
            body: JSON.stringify({ ordering, advance_mode: advanceMode, tags }),
          });
        }
      } else {
        await apiFetch(`/api/playlists/${playlistId}`, {
          method: 'PATCH',
          body: JSON.stringify({ name: name.trim(), ordering, advance_mode: advanceMode, tags }),
        });
      }
      setSuccess(true);
      setTimeout(() => onSaved?.(), 700);
    } catch (err) {
      setError(err.message ?? 'Save failed');
    } finally {
      setSaving(false);
    }
  }, [isNew, name, ordering, advanceMode, tags, playlistId, onSaved]);

  // ── Soft delete ───────────────────────────────────────────────────────────
  const handleDelete = useCallback(async () => {
    if (isNew || !playlistId) return;
    if (!window.confirm(`Delete playlist "${playlist.name}"?`)) return;
    setDeleting(true);
    try {
      await apiFetch(`/api/playlists/${playlistId}/soft`, { method: 'DELETE' });
      onClose?.();
      onSaved?.();
    } catch (err) {
      setError(err.message ?? 'Delete failed');
    } finally {
      setDeleting(false);
    }
  }, [isNew, playlistId, playlist?.name, onClose, onSaved]);

  // ── Render ────────────────────────────────────────────────────────────────

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
          >×</button>
        )}
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto" style={{ padding: '16px' }}>

        {/* Name */}
        <div className="mb-4">
          <SectionLabel text="Name" />
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="e.g. River Decisions Vol. 1"
            style={{
              width: '100%', padding: '7px 10px', borderRadius: 4, boxSizing: 'border-box',
              border: '1px solid #30363d', background: '#0d1117', color: '#f0ece3',
              fontSize: 12, outline: 'none',
            }}
            onFocus={e => { e.target.style.borderColor = 'rgba(212,175,55,0.5)'; }}
            onBlur={e => { e.target.style.borderColor = '#30363d'; }}
          />
        </div>

        <SelectToggle label="Ordering" options={ORDERING_OPTIONS} value={ordering} onChange={setOrdering} />
        <SelectToggle label="Advance"  options={ADVANCE_OPTIONS}  value={advanceMode} onChange={setAdvance} />

        <TagEditor tags={tags} onChange={setTags} />

        {/* Stats row — only for existing playlists */}
        {!isNew && (
          <div className="mb-4 flex gap-4" style={{ fontSize: 11, color: '#6e7681' }}>
            <span>{items.length} scenario{items.length !== 1 ? 's' : ''}</span>
            {playlist?.play_count != null && (
              <span>{playlist.play_count} drill run{playlist.play_count !== 1 ? 's' : ''}</span>
            )}
          </div>
        )}

        {/* Scenarios list */}
        <div className="mb-5">
          <div className="flex items-center justify-between mb-2">
            <SectionLabel text="Scenarios" />
            <button
              onClick={() => setShowPicker(true)}
              style={{
                padding: '3px 10px', borderRadius: 3, fontSize: 10, fontWeight: 600,
                border: '1px solid #30363d', background: 'none', color: '#8b949e',
                cursor: 'pointer',
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = '#d4af37'; e.currentTarget.style.color = '#d4af37'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = '#30363d'; e.currentTarget.style.color = '#8b949e'; }}
            >
              + Add
            </button>
          </div>

          {itemsLoading ? (
            <div style={{ color: '#444', fontSize: 11, padding: '12px 0' }}>Loading…</div>
          ) : items.length === 0 ? (
            <div style={{
              padding: '20px', textAlign: 'center', borderRadius: 6,
              border: '1px dashed #21262d', color: '#444', fontSize: 11,
            }}>
              No scenarios in this playlist yet.
            </div>
          ) : (
            items.map((item, idx) => (
              <ItemRow
                key={item.id}
                item={item}
                index={idx}
                total={items.length}
                onMoveUp={() => handleMoveUp(idx)}
                onMoveDown={() => handleMoveDown(idx)}
                onRemove={() => handleRemove(item)}
              />
            ))
          )}
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

      {/* Scenario picker modal */}
      {showPicker && playlistId && (
        <ScenarioPickerModal
          playlistId={playlistId}
          onClose={() => setShowPicker(false)}
          onAdded={(newItems) => {
            setItems(prev => [...prev, ...newItems]);
            setShowPicker(false);
          }}
        />
      )}

      {/* Footer */}
      <div
        className="flex items-center justify-between px-4 py-3 flex-shrink-0"
        style={{ borderTop: '1px solid #30363d' }}
      >
        {!isNew ? (
          <button
            onClick={handleDelete}
            disabled={deleting}
            style={{
              padding: '6px 12px', borderRadius: 4,
              border: '1px solid rgba(248,81,73,0.3)', background: 'none',
              color: '#f85149', fontSize: 11, fontWeight: 600,
              cursor: deleting ? 'not-allowed' : 'pointer',
            }}
          >
            {deleting ? 'Deleting…' : 'Delete'}
          </button>
        ) : <div />}
        <div className="flex gap-2">
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
              border: 'none', fontSize: 11, fontWeight: 700,
              cursor: saving ? 'not-allowed' : 'pointer', letterSpacing: '0.06em',
            }}
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
