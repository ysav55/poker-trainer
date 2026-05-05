import React, { useState } from 'react';

export default function PlaylistAdmin({ emit }) {
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');

  function create() {
    const trimmed = name.trim();
    if (!trimmed) return;
    emit?.createPlaylist?.(trimmed);
    setCreating(false);
    setName('');
  }

  return (
    <div style={{ marginBottom: 8 }}>
      {!creating ? (
        <button
          className="btn full sm"
          onClick={() => setCreating(true)}
          disabled={!emit?.createPlaylist}
          style={{ marginBottom: 8 }}
        >+ New Playlist</button>
      ) : (
        <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
          <input
            className="field"
            autoFocus
            placeholder="Playlist name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') create(); }}
            style={{ flex: 1, fontSize: 13, padding: '6px 8px' }}
          />
          <button className="btn primary sm" onClick={create} disabled={!name.trim()}>Create</button>
          <button className="btn ghost sm" onClick={() => { setCreating(false); setName(''); }}>Cancel</button>
        </div>
      )}
    </div>
  );
}

export function PlaylistRowMenu({ playlist, emit, onClose }) {
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(playlist.name || '');

  function rename() {
    const trimmed = name.trim();
    if (!trimmed || trimmed === playlist.name) {
      onClose?.();
      return;
    }
    emit?.renamePlaylist?.(playlist.id, trimmed);
    onClose?.();
  }

  function del() {
    if (typeof window !== 'undefined' && !window.confirm(`Delete playlist "${playlist.name}"?`)) {
      onClose?.();
      return;
    }
    emit?.deletePlaylist?.(playlist.id);
    onClose?.();
  }

  if (renaming) {
    return (
      <div style={{ display: 'flex', gap: 4, padding: '4px 0', marginTop: 4 }}>
        <input
          className="field"
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') rename();
            if (e.key === 'Escape') {
              setRenaming(false);
              onClose?.();
            }
          }}
          style={{ flex: 1, fontSize: 13, padding: '6px 8px' }}
        />
        <button className="btn primary sm" onClick={rename}>Save</button>
        <button
          className="btn ghost sm"
          onClick={() => {
            setRenaming(false);
            onClose?.();
          }}
        >
          Cancel
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', gap: 4, padding: '4px 0', marginTop: 4 }}>
      <button
        className="btn sm"
        onClick={() => setRenaming(true)}
        disabled={!emit?.renamePlaylist}
        style={{ flex: 1 }}
      >
        Rename
      </button>
      <button
        className="btn sm"
        style={{ color: 'var(--bad)', flex: 1 }}
        onClick={del}
        disabled={!emit?.deletePlaylist}
      >
        Delete
      </button>
    </div>
  );
}
