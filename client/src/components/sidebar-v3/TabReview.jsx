import React, { useState, useEffect, useMemo, useRef } from 'react';
import { MiniCard } from './shared.jsx';
import { useHistory } from '../../hooks/useHistory.js';

const STREET_ORDER = ['preflop', 'flop', 'turn', 'river'];
const STREET_LABEL = { preflop: 'Preflop', flop: 'Flop', turn: 'Turn', river: 'River' };

function groupActionsByStreet(actions = []) {
  const grouped = {};
  for (const a of actions) {
    if (a.is_reverted) continue;
    if (!grouped[a.street]) grouped[a.street] = [];
    grouped[a.street].push(a);
  }
  return STREET_ORDER
    .filter((s) => grouped[s]?.length > 0)
    .map((s) => ({ street: s, actions: grouped[s] }));
}

export default function TabReview({ data, emit, replay, selectedHandId, onBack }) {
  // Live review state from gameState.replay_mode (mapped via buildLiveData).
  const r = data.review;
  const reviewActive = r?.loaded;
  const cursor = r?.cursor ?? -1;
  const handId = r?.handId ?? selectedHandId ?? null;
  const phaseIsWaiting = data.gameState.phase === 'waiting';

  // Auto-load the selected hand into replay when the user lands here.
  // Three cases:
  //   1. Nothing loaded yet + phase=waiting → load directly
  //   2. Different hand already loaded → exit current replay, then load new one
  //      (without this, clicking a different hand from History silently no-ops
  //      because phase=replay blocks load_replay's phase=waiting guard)
  //   3. Same hand already loaded → no-op
  //
  // The lastRequestedRef sentinel suppresses the re-fire that would otherwise
  // happen when the exit broadcast arrives (clears r.handId, flips
  // phaseIsWaiting) — without it the effect re-emits loadReplay before the
  // first one's broadcast lands, producing a "Can only load replay between
  // hands" sync_error toast.
  const lastRequestedRef = useRef(null);
  useEffect(() => {
    if (!selectedHandId || !replay?.loadReplay) return;
    if (reviewActive && r.handId === selectedHandId) {
      lastRequestedRef.current = null;
      return;
    }
    if (lastRequestedRef.current === selectedHandId) return;

    if (reviewActive && r.handId !== selectedHandId) {
      lastRequestedRef.current = selectedHandId;
      replay.replayExit?.();
      replay.loadReplay(selectedHandId);
      return;
    }

    if (!phaseIsWaiting) return;
    lastRequestedRef.current = selectedHandId;
    replay.loadReplay(selectedHandId);
  }, [selectedHandId, replay, reviewActive, r?.handId, phaseIsWaiting]);

  // Hand detail (full actions list) — separate REST fetch since the replay
  // socket events only carry cursor/meta, not the per-action breakdown.
  const { handDetail, fetchHandDetail, clearDetail } = useHistory();
  useEffect(() => {
    if (!handId) return;
    if (handDetail?.hand_id === handId) return;
    fetchHandDetail(handId);
  }, [handId, fetchHandDetail, handDetail?.hand_id]);
  useEffect(() => () => clearDetail(), [clearDetail]);

  const streets = useMemo(
    () => groupActionsByStreet(handDetail?.actions ?? []),
    [handDetail]
  );

  // Save Branch panel state — inline picker that toggles below the tree.
  const [savePanelOpen, setSavePanelOpen] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [creatingNew, setCreatingNew] = useState(false);
  const [savedToId, setSavedToId] = useState(null);
  const savedTimerRef = useRef(null);
  // Clear pending collapse timer on unmount so setState on unmounted comp
  // doesn't fire (would log a React warning).
  useEffect(() => () => {
    if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
  }, []);

  function saveBranch({ playlistId, newName }) {
    if (!emit?.branchToDrill || !handId) return;
    if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    emit.branchToDrill({
      handId,
      playlistId: playlistId ?? undefined,
      newPlaylistName: newName ?? undefined,
      cursor: cursor >= 0 ? cursor : undefined,
    });
    setSavedToId(playlistId ?? '__new__');
    savedTimerRef.current = setTimeout(() => {
      savedTimerRef.current = null;
      setSavePanelOpen(false);
      setSavedToId(null);
      setCreatingNew(false);
      setNewPlaylistName('');
    }, 1500);
  }

  function exitAndBack() {
    if (replay?.replayExit) replay.replayExit();
    onBack();
  }

  // ── Empty / awaiting states ──────────────────────────────────────────────
  if (!handId) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: 32 }}>
        <div style={{ fontSize: 10, letterSpacing: '0.28em', textTransform: 'uppercase', color: 'var(--ink-faint)', fontWeight: 700, marginBottom: 10 }}>
          No hand loaded
        </div>
        <div style={{ color: 'var(--ink-dim)', fontSize: 12, marginBottom: 14 }}>
          Pick a hand from History to review and branch.
        </div>
        <button className="btn primary" onClick={onBack}>Open History</button>
      </div>
    );
  }

  if (selectedHandId && !reviewActive && !phaseIsWaiting) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: 28 }}>
        <div style={{ fontSize: 10, letterSpacing: '0.28em', textTransform: 'uppercase', color: 'var(--warn)', fontWeight: 700, marginBottom: 10 }}>
          Cannot load mid-hand
        </div>
        <div style={{ color: 'var(--ink-dim)', fontSize: 12, marginBottom: 14, lineHeight: 1.5 }}>
          End the current hand first, then return to Review. Replay loads only between hands.
        </div>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink-faint)', wordBreak: 'break-all', marginBottom: 14 }}>
          {handId}
        </div>
        <button className="btn" onClick={onBack}>← Back to Live</button>
      </div>
    );
  }

  if (!reviewActive) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: 28 }}>
        <div style={{ fontSize: 10, letterSpacing: '0.28em', textTransform: 'uppercase', color: 'var(--accent)', fontWeight: 700, marginBottom: 10 }}>
          Loading replay…
        </div>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink-dim)', wordBreak: 'break-all', marginBottom: 14 }}>
          {handId}
        </div>
        <button className="btn" onClick={onBack}>Cancel</button>
      </div>
    );
  }

  // ── Live replay UI ───────────────────────────────────────────────────────
  // Total non-reverted actions; cursor = current index. Highlight actions
  // up to cursor (inclusive) as "played"; the rest are dim.
  const totalActions = r.totalActions ?? streets.reduce((acc, s) => acc + s.actions.length, 0);
  const playersWithCards = (handDetail?.players ?? [])
    .filter((p) => Array.isArray(p.hole_cards) && p.hole_cards.length === 2);
  const board = Array.isArray(r.board) ? r.board : [];
  const playlists = data.playlists ?? [];

  // Coach-selected "perspective player" — the student whose decisions are
  // being reviewed. Defaults to the winner (better than nothing) but the
  // coach can swap via chips. When set, only their hole cards show in the
  // compact slot at top; the others stay collapsed but accessible.
  const winner = playersWithCards.find((p) => p.is_winner) ?? playersWithCards[0] ?? null;
  const [perspectiveId, setPerspectiveId] = useState(null);
  useEffect(() => { setPerspectiveId(null); }, [r.handId]);
  const perspective = playersWithCards.find((p) => p.player_id === perspectiveId) ?? winner;

  return (
    <>
      {/* Header */}
      <div className="card" style={{ padding: '11px 12px 10px' }}>
        <div className="row between" style={{ marginBottom: 8 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span style={{ fontFamily: 'var(--serif)', fontStyle: 'italic', fontSize: 17, color: 'var(--accent)', lineHeight: 1 }}>Replay</span>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink-faint)', letterSpacing: '0.08em' }}>
              {totalActions > 0 ? `${cursor + 1}/${totalActions}` : '—'}
            </span>
            {r.branched && (
              <span style={{ fontSize: 8, fontWeight: 800, letterSpacing: '0.18em', color: 'var(--purple)', textTransform: 'uppercase' }}>branched</span>
            )}
          </div>
          <button className="btn ghost sm" onClick={exitAndBack}>← Live</button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {perspective && (
            <>
              <div>
                <div style={{ fontSize: 8, fontWeight: 700, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginBottom: 4 }}>
                  {perspective.player_name?.split(' ')[0] ?? 'Player'}
                </div>
                <div style={{ display: 'flex' }}>
                  {perspective.hole_cards.map((c, i) => <MiniCard key={i} code={c} />)}
                </div>
              </div>
              <div style={{ width: 1, height: 30, background: 'var(--line)' }} />
            </>
          )}
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 8, fontWeight: 700, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginBottom: 4 }}>Board</div>
            <div style={{ display: 'flex' }}>
              {Array.from({ length: 5 }).map((_, i) => (
                board[i] ? <MiniCard key={i} code={board[i]} /> : <MiniCard key={i} ghost />
              ))}
            </div>
          </div>
        </div>

        {playersWithCards.length > 1 && (
          <div style={{ marginTop: 9 }}>
            <div className="lbl" style={{ marginBottom: 4 }}>Perspective</div>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {playersWithCards.map((p) => (
                <button
                  key={p.player_id}
                  className={'chip' + (perspective?.player_id === p.player_id ? ' active' : '')}
                  onClick={() => setPerspectiveId(p.player_id)}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
                >
                  {p.player_name?.split(' ')[0] ?? 'P'}
                  {p.is_winner && <span style={{ fontSize: 9 }}>★</span>}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Replay controls */}
      <div className="card" style={{ padding: '10px 12px' }}>
        <div className="card-head" style={{ marginBottom: 8 }}>
          <div className="card-title">Controls</div>
          <div className="card-kicker">
            {r.branched ? 'live from cursor' : 'cursor stepping'}
          </div>
        </div>
        <div className="row" style={{ gap: 5 }}>
          <button
            className="btn sm"
            onClick={() => replay?.replayStepBack?.()}
            disabled={!replay?.replayStepBack || cursor <= -1 || r.branched}
          >‹ Prev</button>
          <button
            className="btn sm primary full"
            onClick={() => replay?.replayStepForward?.()}
            disabled={!replay?.replayStepForward || cursor >= totalActions - 1 || r.branched}
          >Next ›</button>
          {r.branched
            ? <button className="btn sm" onClick={() => replay?.replayUnbranch?.()}>Back to Replay</button>
            : <button
                className="btn sm"
                onClick={() => replay?.replayBranch?.()}
                disabled={!replay?.replayBranch || cursor < 0}
                title="Switch to live play from this cursor (lets you redeal the rest of the hand)"
              >Play From Here</button>
          }
        </div>
        {/* Street pips — clicking jumps to first action of that street */}
        {streets.length > 0 && (
          <div className="row" style={{ gap: 4, marginTop: 10 }}>
            {streets.map((s, si) => {
              const firstIndex = streets.slice(0, si).reduce((acc, prev) => acc + prev.actions.length, 0);
              const lastIndex = firstIndex + s.actions.length - 1;
              const inThisStreet = cursor >= firstIndex && cursor <= lastIndex;
              const passed = cursor > lastIndex;
              return (
                <button
                  key={s.street}
                  onClick={() => replay?.replayJumpTo?.(firstIndex)}
                  disabled={r.branched}
                  style={{
                    flex: 1, height: 24,
                    border: `1px solid ${inThisStreet ? 'var(--accent)' : 'var(--line)'}`,
                    background: passed || inThisStreet ? 'rgba(201,163,93,0.12)' : 'transparent',
                    borderRadius: 6,
                    cursor: r.branched ? 'not-allowed' : 'pointer',
                    color: inThisStreet ? 'var(--accent-hot)' : 'var(--ink-dim)',
                    fontSize: 8, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase',
                    opacity: r.branched ? 0.5 : 1,
                  }}
                >{STREET_LABEL[s.street]}</button>
              );
            })}
          </div>
        )}
      </div>

      {/* Decision tree */}
      <div className="card" style={{ flex: 1 }}>
        <div className="card-head">
          <div className="card-title">Decision Tree</div>
          <div className="card-kicker">{streets.length} street{streets.length === 1 ? '' : 's'}</div>
        </div>
        {streets.length === 0 ? (
          <div style={{ fontSize: 11, color: 'var(--ink-faint)', textAlign: 'center', padding: '14px 8px' }}>
            Loading actions…
          </div>
        ) : (
          <div style={{ position: 'relative', paddingLeft: 12 }}>
            <div style={{ position: 'absolute', left: 3, top: 6, bottom: 6, width: 1, background: 'var(--line-strong)' }} />
            {streets.map((street, si) => {
              const offset = streets.slice(0, si).reduce((acc, prev) => acc + prev.actions.length, 0);
              return (
                <div key={street.street} style={{ marginBottom: 12 }}>
                  <div style={{ position: 'relative', fontSize: 9, fontWeight: 800, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'var(--accent)', marginBottom: 7, marginLeft: -4 }}>
                    <span style={{ position: 'absolute', left: -11, top: 4, width: 7, height: 7, borderRadius: '50%', background: 'var(--accent)' }} />
                    {STREET_LABEL[street.street]}
                  </div>
                  {street.actions.map((node, ai) => {
                    const absoluteIndex = offset + ai;
                    const isPlayed = absoluteIndex <= cursor;
                    const isCurrent = absoluteIndex === cursor;
                    return (
                      <div
                        key={absoluteIndex}
                        onClick={() => !r.branched && replay?.replayJumpTo?.(absoluteIndex)}
                        style={{
                          display: 'grid',
                          gridTemplateColumns: '70px 1fr auto',
                          alignItems: 'baseline', gap: 8,
                          padding: '5px 2px', fontSize: 12,
                          cursor: r.branched ? 'default' : 'pointer',
                          color: isCurrent ? 'var(--accent-hot)' : isPlayed ? 'var(--ink)' : 'var(--ink-faint)',
                          fontWeight: isCurrent ? 600 : 400,
                          opacity: isPlayed ? 1 : 0.6,
                          background: isCurrent ? 'rgba(201,163,93,0.06)' : 'transparent',
                          borderRadius: 4,
                        }}
                      >
                        <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink-faint)', letterSpacing: '0.04em' }}>
                          {node.player_name ?? node.player_id?.slice(0, 8) ?? '—'}
                        </span>
                        <span>
                          {node.action}
                          {node.amount > 0 && <span style={{ color: 'var(--ink-dim)', marginLeft: 4 }}>{node.amount}</span>}
                        </span>
                        {isCurrent && (
                          <span style={{ fontSize: 8, fontWeight: 800, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--accent)', padding: '2px 6px', border: '1px solid var(--accent-dim)', borderRadius: 999 }}>now</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Save Branch — inline picker */}
      <div className="card">
        <div className="card-head">
          <div className="card-title">Save Branch</div>
          <div className="card-kicker">{savedToId ? '✓ saved' : 'pick playlist'}</div>
        </div>
        {!savePanelOpen ? (
          <button
            className="btn primary full"
            onClick={() => setSavePanelOpen(true)}
            disabled={!emit?.branchToDrill}
          >Save this hand to a drill</button>
        ) : (
          <>
            {!creatingNew && playlists.length > 0 && (
              <>
                <div className="lbl">Add to existing</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 7 }}>
                  {playlists.map((pl) => (
                    <button
                      key={pl.id}
                      className={'chip' + (savedToId === pl.id ? ' active' : '')}
                      onClick={() => saveBranch({ playlistId: pl.id })}
                      disabled={savedToId !== null}
                    >
                      {pl.name}
                      <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--ink-faint)', marginLeft: 4 }}>{pl.count}</span>
                    </button>
                  ))}
                </div>
              </>
            )}
            {!creatingNew ? (
              <div className="row" style={{ gap: 5 }}>
                <button className="btn full" onClick={() => setCreatingNew(true)}>+ New Playlist</button>
                <button className="btn ghost full" onClick={() => setSavePanelOpen(false)}>Cancel</button>
              </div>
            ) : (
              <>
                <input
                  className="field"
                  placeholder="Playlist name"
                  value={newPlaylistName}
                  onChange={(e) => setNewPlaylistName(e.target.value)}
                  autoFocus
                  style={{ marginBottom: 6 }}
                />
                <div className="row" style={{ gap: 5 }}>
                  <button
                    className="btn primary full"
                    onClick={() => saveBranch({ newName: newPlaylistName.trim() })}
                    disabled={!newPlaylistName.trim()}
                  >Create & Save</button>
                  <button className="btn ghost" onClick={() => { setCreatingNew(false); setNewPlaylistName(''); }}>Back</button>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </>
  );
}
