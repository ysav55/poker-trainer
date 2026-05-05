import React, { useState, useMemo, useEffect } from 'react';
import { MiniCard } from './shared.jsx';
import { useHistory } from '../../hooks/useHistory.js';
import { apiFetch } from '../../lib/api.js';
import NotesPanel from './NotesPanel.jsx';
import useNotes from '../../hooks/useNotes.js';

const PHASE_LABEL = { preflop: 'preflop', flop: 'flop', turn: 'turn', river: 'river', showdown: 'showdown' };

// Server hand row → v3 HandCard shape. heroHand isn't on the list endpoint;
// shown as ghost cards. Net P&L also requires per-player join — left null
// (HandCard renders neutral for null). Phase 4 may upgrade to /api/hands/history
// with playerId for full hero-centric data.
function adaptServerHand(h, idx, total) {
  return {
    n: total - idx,
    hand_id: h.hand_id,
    phase: PHASE_LABEL[h.phase_ended] ?? h.phase_ended ?? 'unknown',
    board: Array.isArray(h.board) ? h.board : [],
    heroHand: [],
    action: h.winner_name ? `${h.winner_name} won` : 'completed',
    pot: h.final_pot ?? 0,
    net: null,
    live: false,
  };
}

export default function TabHistory({ data, tableId, onLoadReview }) {
  const { hands: serverHands, loading, fetchHands } = useHistory();
  const [notesCounts, setNotesCounts] = useState({});
  const [previewHandId, setPreviewHandId] = useState(null);
  const previewApi = useNotes(previewHandId);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Fetch on mount + whenever the table changes. Refetch when tab is reopened
  // is intentionally NOT wired — once fetched, the list is stable until the
  // hook is re-instantiated (sidebar tab switch keeps the component mounted
  // here, so this fires once per tab open in practice).
  useEffect(() => {
    if (tableId) fetchHands(tableId);
  }, [tableId, fetchHands]);

  // Batch fetch notes counts for all hands in history
  useEffect(() => {
    const handIds = (data.history ?? []).map((h) => h.hand_id).filter(Boolean);
    if (handIds.length === 0) {
      setNotesCounts({});
      return;
    }
    let cancelled = false;
    apiFetch('/api/hands/notes-counts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ handIds }),
    }).then((res) => {
      if (!cancelled) setNotesCounts(res?.counts ?? {});
    }).catch(() => { /* keep previous counts */ });
    return () => { cancelled = true; };
  }, [data.history]);

  const liveHistory = useMemo(() => {
    if (!serverHands || serverHands.length === 0) return null;
    return serverHands.map((h, i) => adaptServerHand(h, i, serverHands.length));
  }, [serverHands]);

  // Merge: prefer live history when present, fall back to fixture only when
  // fetching is in flight or empty (so the tab never renders blank).
  const tabData = useMemo(() => {
    if (liveHistory && liveHistory.length > 0) {
      return { ...data, history: liveHistory };
    }
    return data;
  }, [data, liveHistory]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await fetchHands(tableId);
    setIsRefreshing(false);
  };

  return (
    <TableHistoryView data={tabData} loading={loading} isLive={!!liveHistory} onLoadReview={onLoadReview} notesCounts={notesCounts} onOpenNotes={setPreviewHandId} previewHandId={previewHandId} previewApi={previewApi} onRefresh={handleRefresh} isRefreshing={isRefreshing} />
  );
}

function TableHistoryView({ data, loading, isLive, onLoadReview, notesCounts, onOpenNotes, previewHandId, previewApi, onRefresh, isRefreshing }) {
  const [filter, setFilter] = useState('all');
  const [expandedHandId, setExpandedHandId] = useState(null);

  const sessionPnl = data.history.filter((h) => h.net != null).reduce((a, b) => a + b.net, 0);
  const handsDone = data.history.filter((h) => !h.live).length;
  const wins = data.history.filter((h) => h.net > 0).length;
  const losses = data.history.filter((h) => h.net < 0).length;
  // For live hands, net P&L is unavailable from /api/hands list (no per-player
  // join). Hide the won/lost stat tiles to avoid lying — show pot stats only.
  const hideNetStats = isLive;

  const filtered = useMemo(
    () => data.history.filter((h) => {
      if (filter === 'all') return true;
      if (filter === 'won') return h.net > 0;
      if (filter === 'lost') return h.net < 0;
      if (filter === 'showdown') return h.phase === 'showdown';
      return true;
    }),
    [filter, data.history]
  );

  return (
    <>
      <div className="card">
        <div className="card-head">
          <div className="card-title">Session</div>
          <div className="card-kicker">{handsDone} hand{handsDone === 1 ? '' : 's'}{loading ? ' · loading…' : ''}</div>
        </div>
        {!hideNetStats && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, marginBottom: 6 }}>
            <div className="stat">
              <div className="stat-lbl">Hero Net</div>
              <div className={'stat-val serif ' + (sessionPnl >= 0 ? 'ok' : 'bad')}>
                {sessionPnl >= 0 ? '+' : ''}{sessionPnl}
              </div>
            </div>
            <div className="stat"><div className="stat-lbl">Won</div><div className="stat-val">{wins}</div></div>
            <div className="stat"><div className="stat-lbl">Lost</div><div className="stat-val">{losses}</div></div>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
          <MiniStat label="Biggest Pot" value={Math.max(0, ...data.history.map((h) => h.pot ?? 0))} />
          <MiniStat label="Hands" value={handsDone} />
        </div>
      </div>

      <div className="row" style={{ gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
        {[
          { v: 'all',      l: 'All' },
          { v: 'won',      l: 'Won' },
          { v: 'lost',     l: 'Lost' },
          { v: 'showdown', l: 'Showdown' },
        ].map((f) => (
          <span key={f.v} className={'chip' + (filter === f.v ? ' active' : ' ghost')} onClick={() => setFilter(f.v)}>{f.l}</span>
        ))}
        <button
          className="btn ghost sm"
          style={{ marginLeft: 'auto', padding: '4px 8px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}
          onClick={onRefresh}
          disabled={isRefreshing}
          title="Refresh history"
        >
          <span style={{ transform: isRefreshing ? 'rotate(180deg)' : 'none', transition: 'transform 300ms', display: 'inline-block' }}>↻</span>
        </button>
      </div>

      <div className="card" style={{ padding: '12px 12px 8px' }}>
        <div className="card-head">
          <div className="card-title">Recent Hands</div>
          <div className="card-kicker">scroll ↔ · {filtered.length}</div>
        </div>
        <div className="h-scroll">
          {filtered.map((h) => (
            <div key={h.hand_id ?? h.n} style={{ flex: '0 0 146px' }}>
              <HandCard hand={h} notesCount={notesCounts[h.hand_id] ?? 0} onClick={() => onLoadReview(h.hand_id ?? h.n)} onOpenNotes={onOpenNotes} isExpanded={expandedHandId === h.hand_id} onToggleExpand={() => setExpandedHandId(expandedHandId === h.hand_id ? null : h.hand_id)} />
              {expandedHandId === h.hand_id && (
                <HandDetailPanel hand={h} style={{ marginTop: 8, marginBottom: 8 }} />
              )}
            </div>
          ))}
        </div>
      </div>

      {previewHandId && (
        <div
          role="dialog"
          aria-label="Notes preview"
          style={{
            position: 'fixed', inset: 0, zIndex: 900,
            background: 'rgba(0,0,0,0.45)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
          onClick={() => onOpenNotes(null)}
        >
          <div
            style={{ background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 8, padding: 12, minWidth: 280, maxWidth: 420 }}
            onClick={(e) => e.stopPropagation()}
          >
            <NotesPanel mode="preview" handId={previewHandId} api={previewApi} />
            <div className="row" style={{ justifyContent: 'flex-end', marginTop: 8 }}>
              <button className="btn ghost sm" onClick={() => onOpenNotes(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function MiniStat({ label, value }) {
  return (
    <div className="stat" style={{ padding: '6px 8px' }}>
      <div className="stat-lbl" style={{ fontSize: 7 }}>{label}</div>
      <div className="stat-val" style={{ fontSize: 13 }}>{value}</div>
    </div>
  );
}

function HandCard({ hand, notesCount, onClick, onOpenNotes, isExpanded, onToggleExpand }) {
  const isLive = hand.live;
  const net = hand.net;
  const netColor = net == null ? 'var(--ink-dim)' : net >= 0 ? 'var(--ok)' : 'var(--bad)';
  return (
    <div
      onClick={onClick}
      style={{
        scrollSnapAlign: 'start',
        background: isLive ? 'rgba(201,163,93,0.08)' : 'var(--bg-3)',
        border: `1px solid ${isLive ? 'rgba(201,163,93,0.4)' : 'var(--line)'}`,
        borderRadius: 9,
        padding: '9px 10px',
        cursor: isLive ? 'default' : 'pointer',
        display: 'flex', flexDirection: 'column', gap: 6,
        transition: 'border-color 150ms, background 150ms',
      }}
      onMouseOver={(e) => !isLive && (e.currentTarget.style.borderColor = 'rgba(201,163,93,0.4)')}
      onMouseOut={(e) => !isLive && (e.currentTarget.style.borderColor = 'var(--line)')}
    >
      <div className="row between">
        <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>#{hand.n}</span>
        {isLive ? (
          <span style={{ fontSize: 8, fontWeight: 800, letterSpacing: '0.16em', color: 'var(--ok)', textTransform: 'uppercase' }}>● Live</span>
        ) : (
          <span style={{ fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 700, color: netColor }}>{net >= 0 ? '+' : ''}{net}</span>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center' }}>
        {hand.heroHand.map((c, i) => <MiniCard key={i} code={c} />)}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
        {Array.from({ length: 5 }).map((_, i) => (
          hand.board[i] ? <MiniCard key={i} code={hand.board[i]} /> : <MiniCard key={i} ghost />
        ))}
      </div>
      <div style={{ fontSize: 10, color: 'var(--ink-dim)', lineHeight: 1.35, minHeight: 26 }}>{hand.action}</div>
      <div className="row between" style={{ paddingTop: 5, borderTop: '1px solid rgba(201,163,93,0.08)' }}>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--ink-faint)' }}>{hand.phase}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink-dim)' }}>pot {hand.pot}</span>
          <button
            className="chip ghost"
            style={{ padding: '2px 5px', fontSize: 10, cursor: 'pointer', transform: isExpanded ? 'scaleY(-1)' : 'none' }}
            onClick={(e) => { e.stopPropagation(); onToggleExpand(); }}
            title={isExpanded ? 'Hide details' : 'Show details'}
          >▾</button>
          {notesCount > 0 && (
            <button
              className="chip ghost"
              style={{ padding: '2px 5px', fontSize: 10, cursor: 'pointer' }}
              onClick={(e) => { e.stopPropagation(); onOpenNotes(hand.hand_id); }}
              title={`${notesCount} note${notesCount === 1 ? '' : 's'}`}
            >📝{notesCount}</button>
          )}
        </div>
      </div>
    </div>
  );
}

function HandDetailPanel({ hand, style }) {
  return (
    <div style={{
      ...style,
      background: 'var(--bg-2)',
      border: '1px solid var(--line)',
      borderRadius: 6,
      padding: '8px 10px',
      fontSize: 10,
      lineHeight: 1.5,
      color: 'var(--ink-dim)',
    }}>
      {hand.board && hand.board.length > 0 && (
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontWeight: 600, color: 'var(--ink)', marginBottom: 4 }}>Board</div>
          <div style={{ display: 'flex', gap: 3 }}>
            {hand.board.map((c, i) => <MiniCard key={i} code={c} />)}
          </div>
        </div>
      )}
      {hand.action && (
        <div>
          <div style={{ fontWeight: 600, color: 'var(--ink)', marginBottom: 4 }}>Result</div>
          <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{hand.action}</div>
        </div>
      )}
    </div>
  );
}
