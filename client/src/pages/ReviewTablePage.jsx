import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext.jsx';
import { apiFetch } from '../lib/api.js';
import PokerTable from '../components/PokerTable.jsx';

const GOLD = '#d4af37';
const STREET_ORDER = ['preflop', 'flop', 'turn', 'river'];

// ── Helpers ───────────────────────────────────────────────────────────────────

function streetLabel(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : 'Preflop';
}

function actionLabel(action) {
  if (!action) return '';
  const name = action.player_name || action.player || '?';
  const act  = (action.action || '').toUpperCase();
  const amt  = action.amount ? ` ${Number(action.amount).toLocaleString()}` : '';
  return `${name} ${act}${amt}`;
}

/**
 * Build a fake gameState for PokerTable at cursor position.
 * Shows board cards through the current street, player hole cards always visible.
 */
function buildGameState(hand, cursor) {
  if (!hand) return null;

  const actionsUpTo = cursor >= 0 ? hand.actions.slice(0, cursor + 1) : [];
  const currentAction = cursor >= 0 ? hand.actions[cursor] : null;
  const currentStreet = currentAction?.street ?? 'preflop';

  // Board cards revealed per street
  const boardByStreet = {
    preflop: [],
    flop:    hand.board?.slice(0, 3) ?? [],
    turn:    hand.board?.slice(0, 4) ?? [],
    river:   hand.board?.slice(0, 5) ?? [],
  };
  const board = boardByStreet[currentStreet] ?? [];

  // Pot: sum all bet amounts up to cursor
  let pot = 0;
  for (const a of actionsUpTo) {
    if (a.amount) pot += Number(a.amount);
  }

  // Players: always show all, stacks are starting stacks (static — we don't recompute)
  const players = (hand.players ?? []).map((p, i) => ({
    id:         p.player_id ?? `p${i}`,
    name:       p.player_name ?? p.name ?? `Player ${i + 1}`,
    stack:      p.stack ?? p.starting_stack ?? 0,
    hole_cards: p.hole_cards ?? [],
    seat:       p.seat ?? i,
    position:   p.position ?? '',
    folded:     false,
    is_active:  false,
  }));

  return {
    players,
    board,
    phase:           currentStreet,
    pot,
    side_pots:       [],
    current_player:  null,
    winner:          null,
    showdown_result: null,
    is_scenario:     false,
    config_phase:    false,
    paused:          false,
  };
}

// ── Timeline ──────────────────────────────────────────────────────────────────

function Timeline({ actions, cursor, onJumpTo }) {
  const [open, setOpen] = useState({ preflop: true, flop: true, turn: true, river: true });

  const grouped = useMemo(() => {
    const groups = {};
    for (const [i, a] of actions.entries()) {
      const street = a.street ?? 'preflop';
      if (!groups[street]) groups[street] = [];
      groups[street].push({ ...a, _index: i });
    }
    return groups;
  }, [actions]);

  return (
    <div className="flex flex-col gap-0.5">
      {STREET_ORDER.map((street) => {
        const items = grouped[street];
        if (!items || items.length === 0) return null;
        const isOpen = open[street] ?? true;
        const hasActive = items.some((a) => a._index === cursor);
        return (
          <div key={street}>
            {/* Street header */}
            <button
              onClick={() => setOpen((o) => ({ ...o, [street]: !isOpen }))}
              className="w-full flex items-center gap-2 px-2 py-1 rounded text-left transition-colors"
              style={{
                background: hasActive ? 'rgba(212,175,55,0.08)' : 'rgba(255,255,255,0.02)',
                border: `1px solid ${hasActive ? 'rgba(212,175,55,0.25)' : '#21262d'}`,
              }}
            >
              <span
                className="text-[10px] font-black uppercase tracking-widest"
                style={{ color: hasActive ? GOLD : '#6e7681' }}
              >
                {isOpen ? '▾' : '▸'} {streetLabel(street)}
              </span>
              <span className="text-[9px] ml-auto" style={{ color: '#4b5563' }}>
                {items.length} action{items.length !== 1 ? 's' : ''}
              </span>
            </button>

            {/* Action rows */}
            {isOpen && (
              <div className="ml-2 mt-0.5 flex flex-col gap-0.5">
                {items.map((a) => {
                  const isCurrent = a._index === cursor;
                  return (
                    <button
                      key={a._index}
                      onClick={() => onJumpTo(a._index)}
                      className="w-full text-left px-2 py-1 rounded flex items-center gap-2 transition-colors"
                      style={{
                        background: isCurrent ? 'rgba(212,175,55,0.15)' : 'transparent',
                        border: `1px solid ${isCurrent ? 'rgba(212,175,55,0.4)' : 'transparent'}`,
                      }}
                      onMouseEnter={(e) => {
                        if (!isCurrent) e.currentTarget.style.background = 'rgba(255,255,255,0.03)';
                      }}
                      onMouseLeave={(e) => {
                        if (!isCurrent) e.currentTarget.style.background = 'transparent';
                      }}
                    >
                      {isCurrent && (
                        <span style={{ color: GOLD, fontSize: 8, flexShrink: 0 }}>■</span>
                      )}
                      <span
                        className="text-xs truncate"
                        style={{ color: isCurrent ? '#f0ece3' : '#8b949e', fontSize: 11 }}
                      >
                        {actionLabel(a)}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Annotation section ────────────────────────────────────────────────────────

function AnnotationSection({ handId, cursor, isCoach, annotations, onAnnotationAdded, onAnnotationDeleted }) {
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);

  const atCursor = useMemo(
    () => annotations.filter((a) => a.action_index === cursor),
    [annotations, cursor]
  );

  const handleSave = async () => {
    if (!text.trim() || cursor < 0) return;
    setSaving(true);
    try {
      const result = await apiFetch(`/api/hands/${encodeURIComponent(handId)}/annotations`, {
        method: 'POST',
        body: JSON.stringify({ action_index: cursor, text: text.trim() }),
      });
      onAnnotationAdded(result.annotation);
      setText('');
    } catch (_) {
      // graceful degradation
      onAnnotationAdded({ id: Date.now(), action_index: cursor, text: text.trim() });
      setText('');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    onAnnotationDeleted(id);
    try { await apiFetch(`/api/annotations/${id}`, { method: 'DELETE' }); } catch (_) {}
  };

  return (
    <div className="flex flex-col gap-2">
      <div
        className="text-[10px] font-black uppercase tracking-widest"
        style={{ color: GOLD }}
      >
        Annotation
      </div>

      {cursor < 0 && (
        <p className="text-xs" style={{ color: '#4b5563', fontSize: 10 }}>
          Step forward to see or add notes.
        </p>
      )}

      {cursor >= 0 && atCursor.length === 0 && (
        <p className="text-xs" style={{ color: '#4b5563', fontSize: 10 }}>
          No notes at action {cursor + 1}.
        </p>
      )}

      {atCursor.map((a) => (
        <div
          key={a.id ?? a.action_index}
          className="text-xs px-2 py-1.5 rounded flex items-start gap-2"
          style={{ background: 'rgba(212,175,55,0.06)', border: `1px solid rgba(212,175,55,0.2)` }}
        >
          <span style={{ color: '#c9a227', flex: 1, fontSize: 11, lineHeight: 1.5 }}>{a.text}</span>
          {isCoach && (
            <button
              onClick={() => handleDelete(a.id)}
              style={{ color: '#4b5563', fontSize: 10, background: 'none', border: 'none', cursor: 'pointer', flexShrink: 0, paddingTop: 1 }}
              onMouseEnter={(e) => { e.currentTarget.style.color = '#f85149'; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = '#4b5563'; }}
            >
              ✕
            </button>
          )}
        </div>
      ))}

      {isCoach && cursor >= 0 && (
        <>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Add a coaching note…"
            rows={2}
            className="w-full text-xs rounded px-2 py-1.5 resize-none outline-none"
            style={{
              background: '#0d1117',
              border: '1px solid #30363d',
              color: '#e6edf3',
              caretColor: GOLD,
              fontSize: 11,
            }}
            onFocus={(e) => { e.target.style.borderColor = 'rgba(212,175,55,0.5)'; }}
            onBlur={(e) => { e.target.style.borderColor = '#30363d'; }}
          />
          <button
            onClick={handleSave}
            disabled={saving || !text.trim()}
            className="w-full text-xs py-1.5 rounded font-semibold uppercase tracking-wider transition-opacity disabled:opacity-40"
            style={{
              background: 'rgba(212,175,55,0.15)',
              color: GOLD,
              border: `1px solid rgba(212,175,55,0.4)`,
            }}
          >
            {saving ? 'Saving…' : 'Save Note'}
          </button>
        </>
      )}
    </div>
  );
}

// ── Step controls bar ─────────────────────────────────────────────────────────

function StepControls({ cursor, actionCount, onFirst, onPrev, onNext, onLast, onScrub }) {
  const atStart = cursor <= -1;
  const atEnd   = cursor >= actionCount - 1;

  const [playing, setPlaying] = useState(false);
  const intervalRef = useRef(null);

  // Auto-play
  useEffect(() => {
    if (!playing) { clearInterval(intervalRef.current); return; }
    intervalRef.current = setInterval(() => {
      if (cursor >= actionCount - 1) {
        setPlaying(false);
      } else {
        onNext();
      }
    }, 800);
    return () => clearInterval(intervalRef.current);
  }, [playing, cursor, actionCount, onNext]);

  useEffect(() => {
    if (atEnd) setPlaying(false);
  }, [atEnd]);

  const btnStyle = (disabled) => ({
    width: 32, height: 32,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    borderRadius: 6,
    background: '#21262d',
    border: '1px solid #30363d',
    color: disabled ? '#2d333b' : '#8b949e',
    cursor: disabled ? 'default' : 'pointer',
    fontSize: 11,
    transition: 'color 0.15s, border-color 0.15s',
  });

  return (
    <div
      className="flex flex-col gap-2 px-4 pb-3 pt-2 shrink-0"
      style={{ borderTop: '1px solid #21262d', background: 'rgba(6,10,15,0.97)' }}
    >
      {/* Scrubber row */}
      <div className="flex items-center gap-3">
        <span className="text-xs font-mono tabular-nums shrink-0" style={{ color: '#4b5563', fontSize: 10, minWidth: 48 }}>
          {cursor + 1} / {actionCount}
        </span>
        <input
          type="range"
          min={0}
          max={actionCount}
          value={cursor + 1}
          onChange={(e) => onScrub(parseInt(e.target.value, 10) - 1)}
          className="flex-1"
          style={{ accentColor: GOLD, cursor: 'pointer' }}
        />
      </div>

      {/* Button row */}
      <div className="flex items-center justify-center gap-2">
        <button
          style={btnStyle(atStart)}
          disabled={atStart}
          title="First"
          onClick={onFirst}
          onMouseEnter={(e) => !atStart && (e.currentTarget.style.color = GOLD)}
          onMouseLeave={(e) => (e.currentTarget.style.color = atStart ? '#2d333b' : '#8b949e')}
        >
          |◁
        </button>
        <button
          style={btnStyle(atStart)}
          disabled={atStart}
          title="Previous"
          onClick={onPrev}
          onMouseEnter={(e) => !atStart && (e.currentTarget.style.color = GOLD)}
          onMouseLeave={(e) => (e.currentTarget.style.color = atStart ? '#2d333b' : '#8b949e')}
        >
          ◁
        </button>
        <button
          style={{
            ...btnStyle(atEnd && !playing),
            width: 40, height: 40,
            background: playing ? 'rgba(212,175,55,0.2)' : '#21262d',
            border: `1px solid ${playing ? 'rgba(212,175,55,0.5)' : '#30363d'}`,
            color: playing ? GOLD : (atEnd && !playing) ? '#2d333b' : '#8b949e',
            fontSize: 13,
          }}
          disabled={atEnd && !playing}
          title={playing ? 'Pause' : 'Play'}
          onClick={() => setPlaying((p) => !p)}
        >
          {playing ? '⏸' : '▶'}
        </button>
        <button
          style={btnStyle(atEnd)}
          disabled={atEnd}
          title="Next"
          onClick={onNext}
          onMouseEnter={(e) => !atEnd && (e.currentTarget.style.color = GOLD)}
          onMouseLeave={(e) => (e.currentTarget.style.color = atEnd ? '#2d333b' : '#8b949e')}
        >
          ▷
        </button>
        <button
          style={btnStyle(atEnd)}
          disabled={atEnd}
          title="Last"
          onClick={onLast}
          onMouseEnter={(e) => !atEnd && (e.currentTarget.style.color = GOLD)}
          onMouseLeave={(e) => (e.currentTarget.style.color = atEnd ? '#2d333b' : '#8b949e')}
        >
          ▷|
        </button>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ReviewTablePage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const handId   = searchParams.get('handId');
  const isCoach  = user?.role === 'coach' || user?.role === 'admin' || user?.role === 'superadmin';

  const [hand, setHand]           = useState(null);
  const [annotations, setAnnotations] = useState([]);
  const [cursor, setCursor]       = useState(-1);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState(null);

  // Load hand data
  useEffect(() => {
    if (!handId) { setLoading(false); return; }
    setLoading(true);
    Promise.all([
      apiFetch(`/api/hands/${encodeURIComponent(handId)}`),
      apiFetch(`/api/hands/${encodeURIComponent(handId)}/annotations`),
    ])
      .then(([handData, annotationData]) => {
        setHand(handData);
        setAnnotations(annotationData?.annotations ?? []);
      })
      .catch((e) => setError(e?.message ?? 'Failed to load hand'))
      .finally(() => setLoading(false));
  }, [handId]);

  const actions     = hand?.actions ?? [];
  const actionCount = actions.length;

  // Step handlers
  const goFirst = useCallback(() => setCursor(-1), []);
  const goPrev  = useCallback(() => setCursor((c) => Math.max(-1, c - 1)), []);
  const goNext  = useCallback(() => setCursor((c) => Math.min(actionCount - 1, c + 1)), [actionCount]);
  const goLast  = useCallback(() => setCursor(actionCount - 1), [actionCount]);
  const goTo    = useCallback((idx) => setCursor(Math.max(-1, Math.min(actionCount - 1, idx))), [actionCount]);

  // Simulate gameState at cursor
  const gameState = useMemo(() => buildGameState(hand, cursor), [hand, cursor]);

  // Annotation handlers
  const handleAnnotationAdded = useCallback((annotation) => {
    setAnnotations((prev) => [...prev, annotation]);
  }, []);

  const handleAnnotationDeleted = useCallback((id) => {
    setAnnotations((prev) => prev.filter((a) => a.id !== id));
  }, []);

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#0d1117' }}>
        <span className="text-sm" style={{ color: '#4b5563' }}>Loading hand…</span>
      </div>
    );
  }

  if (error || !handId) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4" style={{ background: '#0d1117' }}>
        <span className="text-sm" style={{ color: '#f85149' }}>
          {error ?? 'No hand selected. Open a hand from the hand history.'}
        </span>
        <button
          onClick={() => navigate(-1)}
          className="text-xs px-3 py-1.5 rounded"
          style={{ background: '#21262d', color: '#8b949e', border: '1px solid #30363d' }}
        >
          ← Go back
        </button>
      </div>
    );
  }

  const handNumber = hand?.hand_number ?? hand?.hand_id ?? handId;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        width: '100vw',
        background: '#0d1117',
        overflow: 'hidden',
      }}
    >
      {/* Top bar */}
      <header
        className="flex items-center justify-between px-4 shrink-0"
        style={{
          height: 44,
          background: 'rgba(6,10,15,0.97)',
          borderBottom: '1px solid #21262d',
          backdropFilter: 'blur(8px)',
        }}
      >
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="text-xs px-2 py-1 rounded transition-colors"
            style={{ color: '#8b949e', border: '1px solid #30363d' }}
            onMouseEnter={(e) => { e.currentTarget.style.color = '#e6edf3'; e.currentTarget.style.borderColor = '#6e7681'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = '#8b949e'; e.currentTarget.style.borderColor = '#30363d'; }}
          >
            ← Back
          </button>
          <span className="text-sm font-bold tracking-wide" style={{ color: GOLD }}>
            ♠ POKER TRAINER
          </span>
          <span style={{ color: '#30363d' }}>·</span>
          <span className="text-sm font-medium" style={{ color: '#e6edf3' }}>
            Review Table
          </span>
          <span style={{ color: '#30363d' }}>·</span>
          <span className="text-xs font-mono" style={{ color: '#8b949e' }}>
            Hand #{handNumber}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span
            className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-widest"
            style={{
              background: 'rgba(59,130,246,0.12)',
              color: '#60a5fa',
              border: '1px solid rgba(59,130,246,0.3)',
            }}
          >
            Review
          </span>
        </div>
      </header>

      {/* Body: table + review panel */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0, overflow: 'hidden' }}>

        {/* Left: table + controls */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ flex: 1, minHeight: 0 }}>
            <PokerTable
              gameState={gameState}
              myId={null}
              isCoach={false}
              emit={{}}
            />
          </div>
          <StepControls
            cursor={cursor}
            actionCount={actionCount}
            onFirst={goFirst}
            onPrev={goPrev}
            onNext={goNext}
            onLast={goLast}
            onScrub={goTo}
          />
        </div>

        {/* Right: review panel */}
        <div
          style={{
            width: 280,
            flexShrink: 0,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            borderLeft: '1px solid #21262d',
            background: '#0d1117',
          }}
        >
          {/* Timeline */}
          <div
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: '12px 12px 8px',
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
            }}
          >
            <div
              className="text-[10px] font-black uppercase tracking-widest"
              style={{ color: GOLD, flexShrink: 0 }}
            >
              Timeline
            </div>
            <Timeline
              actions={actions}
              cursor={cursor}
              onJumpTo={goTo}
            />
          </div>

          {/* Divider */}
          <div style={{ borderTop: '1px solid #21262d', margin: '0 12px' }} />

          {/* Annotation section */}
          <div style={{ padding: '12px', flexShrink: 0, maxHeight: '45%', overflowY: 'auto' }}>
            <AnnotationSection
              handId={handId}
              cursor={cursor}
              isCoach={isCoach}
              annotations={annotations}
              onAnnotationAdded={handleAnnotationAdded}
              onAnnotationDeleted={handleAnnotationDeleted}
            />
          </div>

          {/* Prev/Next hand nav */}
          <div
            className="flex gap-2 px-3 py-2 shrink-0"
            style={{ borderTop: '1px solid #21262d' }}
          >
            <button
              onClick={() => navigate(-1)}
              className="flex-1 text-xs py-1.5 rounded transition-colors"
              style={{ color: '#6e7681', border: '1px solid #21262d', background: 'transparent' }}
              onMouseEnter={(e) => { e.currentTarget.style.color = '#e6edf3'; e.currentTarget.style.borderColor = '#6e7681'; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = '#6e7681'; e.currentTarget.style.borderColor = '#21262d'; }}
            >
              ← Prev Hand
            </button>
            <button
              onClick={() => navigate(-1)}
              className="flex-1 text-xs py-1.5 rounded transition-colors"
              style={{ color: '#6e7681', border: '1px solid #21262d', background: 'transparent' }}
              onMouseEnter={(e) => { e.currentTarget.style.color = '#e6edf3'; e.currentTarget.style.borderColor = '#6e7681'; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = '#6e7681'; e.currentTarget.style.borderColor = '#21262d'; }}
            >
              Next Hand →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
