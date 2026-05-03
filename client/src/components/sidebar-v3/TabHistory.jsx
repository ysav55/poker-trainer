import React, { useState, useMemo, useEffect } from 'react';
import { MiniCard } from './shared.jsx';
import { useHistory } from '../../hooks/useHistory.js';

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

  // Fetch on mount + whenever the table changes. Refetch when tab is reopened
  // is intentionally NOT wired — once fetched, the list is stable until the
  // hook is re-instantiated (sidebar tab switch keeps the component mounted
  // here, so this fires once per tab open in practice).
  useEffect(() => {
    if (tableId) fetchHands(tableId);
  }, [tableId, fetchHands]);

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

  return (
    <TableHistoryView data={tabData} loading={loading} isLive={!!liveHistory} onLoadReview={onLoadReview} />
  );
}

function TableHistoryView({ data, loading, isLive, onLoadReview }) {
  const [filter, setFilter] = useState('all');

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

      <div className="row" style={{ gap: 4, flexWrap: 'wrap' }}>
        {[
          { v: 'all',      l: 'All' },
          { v: 'won',      l: 'Won' },
          { v: 'lost',     l: 'Lost' },
          { v: 'showdown', l: 'Showdown' },
        ].map((f) => (
          <span key={f.v} className={'chip' + (filter === f.v ? ' active' : ' ghost')} onClick={() => setFilter(f.v)}>{f.l}</span>
        ))}
      </div>

      <div className="card" style={{ padding: '12px 12px 8px' }}>
        <div className="card-head">
          <div className="card-title">Recent Hands</div>
          <div className="card-kicker">scroll ↔ · {filtered.length}</div>
        </div>
        <div className="h-scroll">
          {filtered.map((h) => <HandCard key={h.hand_id ?? h.n} hand={h} onClick={() => onLoadReview(h.hand_id ?? h.n)} />)}
        </div>
      </div>
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

function HandCard({ hand, onClick }) {
  const isLive = hand.live;
  const net = hand.net;
  const netColor = net == null ? 'var(--ink-dim)' : net >= 0 ? 'var(--ok)' : 'var(--bad)';
  return (
    <div
      onClick={onClick}
      style={{
        flex: '0 0 146px',
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
        <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink-dim)' }}>pot {hand.pot}</span>
      </div>
    </div>
  );
}
