import React, { useState } from 'react';

const MAX = 500;

function timeAgo(iso) {
  if (!iso) return '';
  const ms = Date.now() - new Date(iso).getTime();
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function NoteCard({ note, editable, onEdit, onDelete }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(note.body);

  if (editing) {
    return (
      <div style={{ background: 'var(--bg-3)', border: '1px solid var(--line)', borderRadius: 6, padding: 8, marginBottom: 6 }}>
        <textarea
          className="field"
          value={draft}
          onChange={(e) => setDraft(e.target.value.slice(0, MAX))}
          rows={3}
          style={{ width: '100%', resize: 'vertical' }}
        />
        <div className="row" style={{ gap: 5, marginTop: 6 }}>
          <span style={{ flex: 1, fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink-faint)' }}>{draft.length} / {MAX}</span>
          <button className="btn ghost sm" onClick={() => { setEditing(false); setDraft(note.body); }}>Cancel</button>
          <button
            className="btn primary sm"
            disabled={!draft.trim() || draft === note.body}
            onClick={async () => { await onEdit(note.id, draft); setEditing(false); }}
          >Save</button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ background: 'var(--bg-3)', border: '1px solid var(--line)', borderRadius: 6, padding: 8, marginBottom: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--ink-dim)' }}>{note.author_name || 'Coach (deleted)'}</span>
        <span style={{ fontSize: 9, color: 'var(--ink-faint)' }}>· {timeAgo(note.updated_at || note.created_at)}</span>
        {editable && (
          <span style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
            <button className="btn sm ghost" title="Edit" onClick={() => setEditing(true)} aria-label="edit">edit</button>
            <button
              className="btn sm"
              style={{ color: 'var(--bad)' }}
              onClick={() => {
                if (typeof window !== 'undefined' && !window.confirm('Delete this note?')) return;
                onDelete(note.id);
              }}
              aria-label="delete"
            >×</button>
          </span>
        )}
      </div>
      <div style={{ fontSize: 12, color: 'var(--ink)', whiteSpace: 'pre-wrap', lineHeight: 1.4 }}>{note.body}</div>
    </div>
  );
}

export default function NotesPanel({ mode, handId, api }) {
  const editable = mode !== 'preview';
  const isPreview = mode === 'preview';
  const visible = isPreview ? (api?.notes ?? []).slice(0, 3) : (api?.notes ?? []);
  const truncated = isPreview && (api?.notes?.length ?? 0) > 3;

  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');

  if (!handId) {
    return (
      <div style={{ padding: 12, fontSize: 11, color: 'var(--ink-faint)', textAlign: 'center' }}>
        No active hand.
      </div>
    );
  }

  return (
    <div className="card">
      <div className="card-head">
        <div className="card-title">Notes</div>
        <div className="card-kicker">{(api?.notes?.length ?? 0)} note{(api?.notes?.length ?? 0) === 1 ? '' : 's'}</div>
      </div>

      {visible.length === 0 && !adding && (
        <div style={{ fontSize: 11, color: 'var(--ink-faint)', padding: '6px 0', textAlign: 'center' }}>
          {isPreview ? 'No notes on this hand.' : 'No notes yet — add one below.'}
        </div>
      )}

      {visible.map((n) => (
        <NoteCard
          key={n.id}
          note={n}
          editable={editable}
          onEdit={api.edit}
          onDelete={api.remove}
        />
      ))}

      {truncated && (
        <div style={{ fontSize: 10, color: 'var(--ink-faint)', textAlign: 'center', padding: '4px 0' }}>
          + {api.notes.length - 3} more — see more in Review
        </div>
      )}

      {editable && !adding && (
        <button
          className="btn sm full"
          style={{ marginTop: 6 }}
          onClick={() => setAdding(true)}
        >+ Add note</button>
      )}

      {editable && adding && (
        <div style={{ background: 'var(--bg-3)', border: '1px solid var(--line)', borderRadius: 6, padding: 8, marginTop: 6 }}>
          <textarea
            className="field"
            placeholder="Type a note (max 500 chars)"
            value={draft}
            onChange={(e) => setDraft(e.target.value.slice(0, MAX))}
            rows={3}
            autoFocus
            style={{ width: '100%', resize: 'vertical' }}
          />
          <div className="row" style={{ gap: 5, marginTop: 6 }}>
            <span style={{ flex: 1, fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink-faint)' }}>{draft.length} / {MAX}</span>
            <button className="btn ghost sm" onClick={() => { setAdding(false); setDraft(''); }}>Cancel</button>
            <button
              className="btn primary sm"
              disabled={!draft.trim()}
              onClick={async () => { await api.add(draft); setAdding(false); setDraft(''); }}
            >Save</button>
          </div>
        </div>
      )}
    </div>
  );
}
