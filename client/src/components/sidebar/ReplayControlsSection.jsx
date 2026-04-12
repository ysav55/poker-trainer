import React, { useState, useEffect, useRef, useCallback } from 'react';
import CollapsibleSection from '../CollapsibleSection';
import { apiFetch } from '../../lib/api';

const GOLD = '#d4af37';

const SPEED_OPTIONS = [
  { label: '0.5×', ms: 2000 },
  { label: '1×',   ms: 1000 },
  { label: '2×',   ms: 500  },
  { label: '4×',   ms: 250  },
];

// ── Annotation marker ─────────────────────────────────────────────────────────

function AnnotationMarker({ index, total, text, onClick }) {
  if (total <= 0) return null;
  const pct = total > 1 ? (index / (total - 1)) * 100 : 0;
  return (
    <div
      title={text}
      onClick={(e) => { e.stopPropagation(); onClick(index); }}
      style={{
        position: 'absolute',
        left: `${pct}%`,
        top: '-2px',
        width: 8,
        height: 8,
        borderRadius: '50%',
        background: GOLD,
        border: '1px solid #0d1117',
        transform: 'translateX(-50%)',
        cursor: 'pointer',
        zIndex: 2,
      }}
    />
  );
}

// ── Add annotation dialog ─────────────────────────────────────────────────────

function AddAnnotationDialog({ cursor, handId, onSave, onCancel }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  const handleSave = async () => {
    if (!text.trim()) return;
    setBusy(true);
    try {
      await onSave({ cursor, handId, text: text.trim() });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="flex flex-col gap-2 p-2 rounded-lg"
      style={{ background: '#1c2128', border: `1px solid rgba(212,175,55,0.3)` }}
    >
      <div className="text-xs font-semibold" style={{ color: GOLD, letterSpacing: '0.08em' }}>
        Note at action {cursor}
      </div>
      <textarea
        autoFocus
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
        }}
      />
      <div className="flex gap-2 justify-end">
        <button
          onClick={onCancel}
          className="text-xs px-3 py-1 rounded"
          style={{ background: 'rgba(255,255,255,0.06)', color: '#8b949e', border: '1px solid #30363d' }}
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={busy || !text.trim()}
          className="text-xs px-3 py-1 rounded disabled:opacity-50"
          style={{ background: 'rgba(212,175,55,0.15)', color: GOLD, border: `1px solid rgba(212,175,55,0.4)` }}
        >
          {busy ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

/**
 * ReplayControlsSection
 *
 * Props:
 *   gameState       — full game state from server (includes replay_mode)
 *   replayMeta      — { handId, actionCount } from replay_loaded event
 *   isCoach         — whether local user is coach
 *   onStepForward   — emit replay_step_forward
 *   onStepBack      — emit replay_step_back
 *   onJumpTo        — emit replay_jump_to(cursor)
 *   onBranch        — emit replay_branch
 *   onUnbranch      — emit replay_unbranch
 *   onExit          — emit replay_exit
 */
export default function ReplayControlsSection({
  gameState,
  replayMeta,
  isCoach,
  onStepForward,
  onStepBack,
  onJumpTo,
  onBranch,
  onUnbranch,
  onExit,
}) {
  const replayMode   = gameState?.replay_mode;
  const isActive     = replayMode?.active || gameState?.phase === 'replay';
  const isBranched   = replayMode?.branched ?? false;
  const cursor       = replayMode?.cursor ?? -1;
  const actions      = replayMode?.actions ?? [];
  const actionCount  = replayMeta?.actionCount ?? actions.length;

  // Auto-play
  const [playing, setPlaying]         = useState(false);
  const [speedIdx, setSpeedIdx]       = useState(1); // default 1× = 1000ms
  const intervalRef                   = useRef(null);

  // Annotations (loaded from server if handId is known)
  const [annotations, setAnnotations] = useState([]);
  const [addingAt, setAddingAt]       = useState(null); // cursor index when adding

  const handId = replayMeta?.handId ?? replayMode?.source_hand_id;

  // Load annotations when replay starts
  useEffect(() => {
    if (!handId) { setAnnotations([]); return; }
    apiFetch(`/api/hands/${encodeURIComponent(handId)}/annotations`)
      .then((data) => setAnnotations(data?.annotations ?? []))
      .catch(() => setAnnotations([]));
  }, [handId]);

  // Auto-play: step forward on interval
  useEffect(() => {
    if (!playing || !isActive) {
      clearInterval(intervalRef.current);
      return;
    }
    const ms = SPEED_OPTIONS[speedIdx]?.ms ?? 1000;
    intervalRef.current = setInterval(() => {
      if (cursor >= actionCount - 1) {
        setPlaying(false);
      } else {
        onStepForward();
      }
    }, ms);
    return () => clearInterval(intervalRef.current);
  }, [playing, isActive, cursor, actionCount, speedIdx, onStepForward]);

  // Stop auto-play when replay exits
  useEffect(() => {
    if (!isActive) setPlaying(false);
  }, [isActive]);

  const handleSlider = useCallback((e) => {
    const val = parseInt(e.target.value, 10);
    onJumpTo(val - 1); // cursor is 0-based (with -1 = before start); slider is 0-based
  }, [onJumpTo]);

  const handleSaveAnnotation = useCallback(async ({ cursor: c, handId: hid, text }) => {
    try {
      const result = await apiFetch(`/api/hands/${encodeURIComponent(hid)}/annotations`, {
        method: 'POST',
        body: JSON.stringify({ action_index: c, text }),
      });
      setAnnotations((prev) => [...prev, result.annotation]);
    } catch (_err) {
      // graceful degradation if server endpoint not yet ready
      setAnnotations((prev) => [...prev, { action_index: c, text, id: Date.now() }]);
    }
    setAddingAt(null);
  }, []);

  const handleDeleteAnnotation = useCallback(async (id) => {
    setAnnotations((prev) => prev.filter((a) => a.id !== id));
    try {
      await apiFetch(`/api/annotations/${id}`, { method: 'DELETE' });
    } catch (_err) { /* best-effort */ }
  }, []);

  if (!isActive) return null;

  const sliderValue   = cursor + 1; // display: 0 = before start, actionCount = last action
  const displayCursor = cursor + 1; // 1-indexed for display
  const atEnd         = cursor >= actionCount - 1;
  const atStart       = cursor <= -1;

  const annotationsAtCursor = annotations.filter((a) => a.action_index === cursor);

  return (
    <CollapsibleSection
      title="REPLAY"
      defaultOpen
      titleStyle={{ color: GOLD }}
    >
      <div className="flex flex-col gap-3">

        {/* Status row */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span
              className="text-xs font-semibold px-2 py-0.5 rounded-full"
              style={{
                background: isBranched ? 'rgba(74,222,128,0.15)' : 'rgba(212,175,55,0.15)',
                color: isBranched ? '#4ade80' : GOLD,
                border: `1px solid ${isBranched ? 'rgba(74,222,128,0.4)' : 'rgba(212,175,55,0.4)'}`,
                fontSize: 10,
                letterSpacing: '0.06em',
              }}
            >
              {isBranched ? 'BRANCHED' : 'REPLAY'}
            </span>
            <span className="text-xs font-mono" style={{ color: '#8b949e' }}>
              {displayCursor} / {actionCount}
            </span>
          </div>
          {isCoach && (
            <button
              onClick={onExit}
              data-testid="replay-exit"
              className="text-xs px-2 py-1 rounded transition-colors"
              style={{ color: '#6e7681', border: '1px solid #30363d' }}
              onMouseEnter={(e) => { e.currentTarget.style.color = '#f85149'; e.currentTarget.style.borderColor = '#f85149'; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = '#6e7681'; e.currentTarget.style.borderColor = '#30363d'; }}
            >
              Exit
            </button>
          )}
        </div>

        {/* Timeline scrubber */}
        <div className="relative">
          {/* Annotation markers */}
          <div style={{ position: 'relative', height: 4, marginBottom: 8 }}>
            {annotations.map((a) => (
              <AnnotationMarker
                key={a.id ?? a.action_index}
                index={a.action_index}
                total={actionCount}
                text={a.text}
                onClick={onJumpTo}
              />
            ))}
          </div>

          <input
            data-testid="replay-scrubber"
            type="range"
            min={0}
            max={actionCount}
            value={sliderValue}
            onChange={handleSlider}
            className="w-full"
            style={{ accentColor: GOLD, cursor: 'pointer' }}
          />
          <div className="flex justify-between text-xs font-mono" style={{ color: '#4b5563', fontSize: 9 }}>
            <span>start</span>
            <span>end</span>
          </div>
        </div>

        {/* Current action info */}
        {cursor >= 0 && actions[cursor] && (
          <div
            className="text-xs px-2 py-1.5 rounded"
            style={{
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid #21262d',
              color: '#c9d1d9',
              fontFamily: 'monospace',
              fontSize: 10,
            }}
            data-testid="current-action-display"
          >
            <span style={{ color: '#8b949e' }}>#{cursor + 1} </span>
            <strong style={{ color: '#f0ece3' }}>{actions[cursor].player_name || actions[cursor].player || '?'}</strong>
            {' '}
            <span style={{ color: GOLD, textTransform: 'uppercase' }}>{actions[cursor].action}</span>
            {actions[cursor].amount ? (
              <span style={{ color: '#e3b341' }}> ${Number(actions[cursor].amount).toLocaleString()}</span>
            ) : null}
          </div>
        )}

        {/* Playback controls */}
        <div className="flex items-center gap-2">
          {/* Step back */}
          <button
            data-testid="replay-step-back"
            onClick={onStepBack}
            disabled={atStart}
            title="Step back"
            className="flex items-center justify-center rounded transition-colors disabled:opacity-30"
            style={{ width: 30, height: 30, background: '#21262d', border: '1px solid #30363d', color: '#8b949e' }}
            onMouseEnter={(e) => !atStart && (e.currentTarget.style.color = GOLD)}
            onMouseLeave={(e) => (e.currentTarget.style.color = '#8b949e')}
          >
            ◀
          </button>

          {/* Play / Pause */}
          <button
            data-testid="replay-play-pause"
            onClick={() => setPlaying((p) => !p)}
            disabled={atEnd && !playing}
            title={playing ? 'Pause' : 'Auto-play'}
            className="flex items-center justify-center rounded transition-colors disabled:opacity-30"
            style={{
              width: 34, height: 34,
              background: playing ? 'rgba(212,175,55,0.2)' : '#21262d',
              border: `1px solid ${playing ? 'rgba(212,175,55,0.5)' : '#30363d'}`,
              color: playing ? GOLD : '#8b949e',
              fontSize: 12,
            }}
          >
            {playing ? '⏸' : '▶'}
          </button>

          {/* Step forward */}
          <button
            data-testid="replay-step-forward"
            onClick={onStepForward}
            disabled={atEnd}
            title="Step forward"
            className="flex items-center justify-center rounded transition-colors disabled:opacity-30"
            style={{ width: 30, height: 30, background: '#21262d', border: '1px solid #30363d', color: '#8b949e' }}
            onMouseEnter={(e) => !atEnd && (e.currentTarget.style.color = GOLD)}
            onMouseLeave={(e) => (e.currentTarget.style.color = '#8b949e')}
          >
            ▶
          </button>

          {/* Speed */}
          <div className="flex gap-1 ml-auto">
            {SPEED_OPTIONS.map((opt, i) => (
              <button
                key={opt.label}
                onClick={() => setSpeedIdx(i)}
                className="text-xs px-1.5 py-0.5 rounded transition-colors"
                style={
                  speedIdx === i
                    ? { background: 'rgba(212,175,55,0.2)', color: GOLD, border: `1px solid rgba(212,175,55,0.4)`, fontSize: 9 }
                    : { background: 'transparent', color: '#4b5563', border: '1px solid #21262d', fontSize: 9 }
                }
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Annotation at current action */}
        {annotationsAtCursor.length > 0 && (
          <div className="flex flex-col gap-1.5">
            {annotationsAtCursor.map((a) => (
              <div
                key={a.id ?? a.action_index}
                className="text-xs px-2 py-1.5 rounded flex items-start gap-2"
                style={{ background: 'rgba(212,175,55,0.06)', border: `1px solid rgba(212,175,55,0.2)` }}
              >
                <span style={{ color: '#c9a227', flex: 1, fontSize: 10 }}>{a.text}</span>
                {isCoach && (
                  <button
                    onClick={() => handleDeleteAnnotation(a.id)}
                    style={{ color: '#4b5563', fontSize: 10, background: 'none', border: 'none', cursor: 'pointer', flexShrink: 0 }}
                    onMouseEnter={(e) => { e.currentTarget.style.color = '#f85149'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = '#4b5563'; }}
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Add annotation */}
        {isCoach && cursor >= 0 && (
          addingAt === cursor ? (
            <AddAnnotationDialog
              cursor={cursor}
              handId={handId}
              onSave={handleSaveAnnotation}
              onCancel={() => setAddingAt(null)}
            />
          ) : (
            <button
              data-testid="add-annotation-btn"
              onClick={() => setAddingAt(cursor)}
              className="text-xs px-2 py-1.5 rounded w-full text-left transition-colors"
              style={{ color: '#6e7681', border: '1px dashed #30363d', background: 'transparent' }}
              onMouseEnter={(e) => { e.currentTarget.style.color = GOLD; e.currentTarget.style.borderColor = `rgba(212,175,55,0.4)`; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = '#6e7681'; e.currentTarget.style.borderColor = '#30363d'; }}
            >
              + Add note at action {cursor + 1}
            </button>
          )
        )}

        {/* Branch / Unbranch */}
        {isCoach && (
          <div className="flex gap-2">
            {isBranched ? (
              <button
                data-testid="replay-unbranch"
                onClick={onUnbranch}
                className="flex-1 text-xs py-1.5 rounded font-semibold uppercase tracking-wider transition-opacity hover:opacity-80"
                style={{ background: 'rgba(88,166,255,0.12)', border: '1px solid rgba(88,166,255,0.35)', color: '#58a6ff' }}
              >
                ← Back to Replay
              </button>
            ) : (
              <button
                data-testid="replay-branch"
                onClick={onBranch}
                className="flex-1 text-xs py-1.5 rounded font-semibold uppercase tracking-wider transition-opacity hover:opacity-80"
                style={{ background: 'rgba(74,222,128,0.1)', border: '1px solid rgba(74,222,128,0.3)', color: '#4ade80' }}
              >
                ▶ Branch & Play
              </button>
            )}
          </div>
        )}
      </div>
    </CollapsibleSection>
  );
}
