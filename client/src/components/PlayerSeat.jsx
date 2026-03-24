import React, { useState, useRef, useEffect } from 'react';
import Card from './Card';
import { fmtChips } from '../utils/chips';
import { apiFetch } from '../lib/api';

// ── ActionTimerRing — SVG circle ring around seat card ───────────────────────
function ActionTimerRing({ timer, playerId }) {
  const [pct, setPct] = React.useState(100);
  useEffect(() => {
    if (!timer || timer.playerId !== playerId) { setPct(100); return; }
    const { startedAt, duration } = timer;
    const update = () => {
      const elapsed = Date.now() - startedAt;
      const remaining = Math.max(0, duration - elapsed);
      setPct(Math.round((remaining / duration) * 100));
    };
    update();
    const interval = setInterval(update, 100);
    return () => clearInterval(interval);
  }, [timer, playerId]);

  if (!timer || timer.playerId !== playerId) return null;

  const radius = 20;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - pct / 100);
  const color = pct > 50 ? '#d4af37' : pct > 25 ? '#f59e0b' : '#ef4444';

  return (
    <svg
      width="44" height="44"
      style={{ position: 'absolute', top: -4, right: -4, zIndex: 10, pointerEvents: 'none' }}
    >
      <circle cx="22" cy="22" r={radius} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="3" />
      <circle
        cx="22" cy="22" r={radius} fill="none"
        stroke={color} strokeWidth="3"
        strokeDasharray={circumference}
        strokeDashoffset={dashOffset}
        strokeLinecap="round"
        transform="rotate(-90 22 22)"
        style={{ transition: 'stroke 0.3s, stroke-dashoffset 0.1s linear' }}
      />
    </svg>
  );
}

// ── BetChip — floating chip badge showing current street bet ─────────────────
function BetChip({ amount, bigBlind, bbView }) {
  if (!amount || amount <= 0) return null;
  return (
    <div style={{
      position: 'absolute',
      bottom: -26,
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: 5,
      display: 'flex',
      alignItems: 'center',
      gap: 3,
      padding: '2px 7px',
      borderRadius: 999,
      background: 'radial-gradient(ellipse at 40% 30%, #2c2410, #1a1608)',
      border: '1.5px solid rgba(212,175,55,0.55)',
      boxShadow: '0 2px 8px rgba(0,0,0,0.7), inset 0 1px 0 rgba(212,175,55,0.2)',
      whiteSpace: 'nowrap',
    }}>
      <span style={{ fontSize: 9, color: 'rgba(212,175,55,0.7)' }}>●</span>
      <span style={{ fontSize: 10, fontFamily: 'monospace', fontWeight: 700, color: '#d4af37' }}>
        {fmtChips(amount, bigBlind, bbView)}
      </span>
    </div>
  );
}

// Color mapping for action badges
const ACTION_STYLES = {
  fold:    { label: 'FOLD',   classes: 'bg-red-900/80 text-red-300 border border-red-700/60' },
  folded:  { label: 'FOLD',   classes: 'bg-red-900/80 text-red-300 border border-red-700/60' },
  check:   { label: 'CHECK',  classes: 'bg-gray-700/80 text-gray-300 border border-gray-600/60' },
  checked: { label: 'CHECK',  classes: 'bg-gray-700/80 text-gray-300 border border-gray-600/60' },
  call:    { label: 'CALL',   classes: 'bg-blue-900/80 text-blue-300 border border-blue-700/60' },
  called:  { label: 'CALL',   classes: 'bg-blue-900/80 text-blue-300 border border-blue-700/60' },
  raise:   { label: 'RAISE',  classes: 'bg-orange-900/80 text-orange-300 border border-orange-700/60' },
  raised:  { label: 'RAISE',  classes: 'bg-orange-900/80 text-orange-300 border border-orange-700/60' },
  bet:     { label: 'BET',    classes: 'bg-orange-900/80 text-orange-300 border border-orange-700/60' },
  'all-in':{ label: 'ALL-IN', classes: 'bg-purple-900/80 text-purple-300 border border-purple-700/60' },
  allin:   { label: 'ALL-IN', classes: 'bg-purple-900/80 text-purple-300 border border-purple-700/60' },
  'all_in':{ label: 'ALL-IN', classes: 'bg-purple-900/80 text-purple-300 border border-purple-700/60' },
};

function formatStack(stack) {
  if (stack == null) return '0';
  return Number(stack).toLocaleString('en-US');
}

function EmptyCardSlot({ onClick, isCoach }) {
  return (
    <div
      className={`
        w-12 h-[4.5rem] flex-shrink-0 rounded-[5px] flex items-center justify-center
        transition-colors duration-150
        ${isCoach
          ? 'cursor-pointer hover:border-gold-500/60 hover:bg-gold-500/5'
          : 'cursor-default'}
      `}
      style={{
        border: '1.5px dashed rgba(255,255,255,0.12)',
        background: 'rgba(0,0,0,0.2)',
      }}
      onClick={onClick}
    >
      {isCoach && (
        <span className="text-gray-600 text-sm select-none">+</span>
      )}
    </div>
  );
}

export default function PlayerSeat({
  player,
  isCurrentTurn = false,
  isMe = false,
  isCoach = false,
  style = {},
  onHoleCardClick,
  showdownResult = null,
  isWinner = false,
  replayMode = null,
  bbView = false,
  bigBlind = 10,
  sessionId = null,
  actionTimer = null,
}) {
  if (!player) return null;

  // ── Stats hover card ────────────────────────────────────────────────────────
  const [isHovered, setIsHovered]         = useState(false);
  const [stats, setStats]                 = useState(null);
  const [statsLoading, setStatsLoading]   = useState(false);
  const fetchedRef                        = useRef(false);

  const isCoachSeat = player.stableId && String(player.stableId).startsWith('coach_');

  function handleMouseEnter() {
    setIsHovered(true);
    const sid = player.stableId;
    if (!sid || isCoachSeat || fetchedRef.current) return;
    fetchedRef.current = true;
    setStatsLoading(true);
    const params = sessionId ? `?sessionId=${encodeURIComponent(sessionId)}` : '';
    apiFetch(`/api/players/${encodeURIComponent(sid)}/hover-stats${params}`)
      .then(data => { setStats(data); setStatsLoading(false); })
      .catch(() => { setStatsLoading(false); });
  }

  function handleMouseLeave() {
    setIsHovered(false);
  }
  // ────────────────────────────────────────────────────────────────────────────

  const isFolded =
    player.action === 'fold' ||
    player.action === 'folded';

  const isDisconnected = player.disconnected === true;

  // Find this player's hand entry in allHands (only present at showdown)
  const isShowdown = showdownResult != null;
  const playerHandEntry = isShowdown
    ? (showdownResult.allHands ?? []).find((h) => h.playerId === player.id) ?? null
    : null;

  const actionKey = player.action?.toLowerCase?.();
  const actionStyle = actionKey ? ACTION_STYLES[actionKey] : null;

  const isReplayActive = replayMode?.active && replayMode?.current_action?.player_id === player.stableId;

  // Show cards face-up only for the local player (or at showdown).
  // Server now controls visibility: opponents arrive as 'HIDDEN' in live play.
  const showCards = isCoach || isMe;

  // Hole cards (up to 2)
  const holeCards = player.hole_cards ?? [];

  function handleCardClick(position) {
    if (onHoleCardClick) {
      onHoleCardClick(position);
    }
  }

  function renderCardSlot(position) {
    const card = holeCards[position];
    const hasCard = card != null && card !== '';

    if (!hasCard) {
      return (
        <EmptyCardSlot
          key={position}
          isCoach={isCoach}
          onClick={isCoach ? () => handleCardClick(position) : undefined}
        />
      );
    }

    // Server sends 'HIDDEN' for opponent cards in live play — always show face-down.
    if (card === 'HIDDEN') {
      return <Card key={position} card={card} hidden={true} small={false} />;
    }

    if (showCards) {
      return (
        <div key={position}>
          <Card
            card={card}
            hidden={false}
            small={false}
            onClick={isCoach ? () => handleCardClick(position) : undefined}
            className={isCoach ? 'hover:scale-105 transition-transform duration-150' : ''}
          />
        </div>
      );
    }

    // Hidden back — non-coach, non-me
    return (
      <Card
        key={position}
        card={card}
        hidden={true}
        small={false}
      />
    );
  }

  return (
    <div
      className={`
        absolute flex flex-col items-center gap-1 select-none
        ${isCurrentTurn ? 'turn-indicator rounded-xl' : ''}
        ${isFolded ? 'opacity-40' : isDisconnected ? 'opacity-50' : 'opacity-100'}
        ${isReplayActive ? 'ring-2 ring-purple-400 ring-offset-1 rounded-xl' : ''}
        transition-opacity duration-300
      `}
      style={{
        width: 140,
        ...style,
      }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* ── Badges row (dealer / blind) ── */}
      <div className="flex items-center gap-1 min-h-[18px]">
        {player.is_dealer && (
          <span
            className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black text-black leading-none"
            style={{ background: '#d4af37', boxShadow: '0 0 6px rgba(212,175,55,0.6)' }}
          >
            D
          </span>
        )}
        {player.is_small_blind && (
          <span className="px-1 py-0.5 rounded text-[9px] font-bold text-yellow-300 bg-yellow-900/50 border border-yellow-700/40 leading-none">
            SB
          </span>
        )}
        {player.is_big_blind && (
          <span className="px-1 py-0.5 rounded text-[9px] font-bold text-yellow-200 bg-yellow-800/50 border border-yellow-600/40 leading-none">
            BB
          </span>
        )}
        {player.is_all_in && (
          <span className="px-1 py-0.5 rounded text-[9px] font-bold text-purple-300 bg-purple-900/60 border border-purple-700/50 leading-none">
            ALL-IN
          </span>
        )}
      </div>

      {/* ── Seat card ── */}
      <div
        className={`
          w-full rounded-xl flex flex-col items-center gap-2 px-2 py-2
          ${isCurrentTurn
            ? 'bg-felt-800/90 border border-gold-500/60'
            : 'bg-felt-900/80 border border-white/8'}
          transition-all duration-200
        `}
        style={{
          position: 'relative',
          backdropFilter: 'blur(6px)',
          boxShadow: isWinner
            ? '0 0 12px #d4af37, 0 0 24px rgba(212,175,55,0.25)'
            : isCurrentTurn
            ? '0 4px 20px rgba(212,175,55,0.15)'
            : '0 4px 12px rgba(0,0,0,0.5)',
          borderColor: isWinner
            ? '#d4af37'
            : isCurrentTurn
            ? 'rgba(212,175,55,0.55)'
            : 'rgba(255,255,255,0.07)',
        }}
      >
        <ActionTimerRing timer={actionTimer} playerId={player.id} />
        {/* Name + "You" indicator */}
        <div className="w-full flex items-center justify-between gap-1">
          <span
            className="text-[11px] font-semibold text-gray-100 truncate flex-1 leading-none tracking-wide"
            title={player.name}
          >
            {player.name}
          </span>
          {isDisconnected ? (
            <span
              className="text-[8px] font-bold uppercase tracking-widest shrink-0 leading-none px-1 py-0.5 rounded"
              style={{ background: 'rgba(245,158,11,0.2)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.4)' }}
            >
              OFFLINE
            </span>
          ) : isMe ? (
            <span className="text-[9px] font-bold text-gold-400 uppercase tracking-widest shrink-0 leading-none">
              You
            </span>
          ) : null}
        </div>

        {/* Stack */}
        <div className="flex items-center gap-1">
          <span
            className="w-2 h-2 rounded-full shrink-0"
            style={{ background: '#d4af37', boxShadow: '0 0 4px rgba(212,175,55,0.7)' }}
          />
          <span className="text-[11px] font-mono text-gold-400 leading-none">
            {fmtChips(player.stack ?? 0, bigBlind, bbView)}
          </span>
        </div>

        {/* Hole cards */}
        <div className="flex items-center gap-1.5">
          {renderCardSlot(0)}
          {renderCardSlot(1)}
        </div>

        {/* Hand rank badge — only shown at showdown for non-folded players */}
        {playerHandEntry && !isFolded && (
          <div
            className="w-full text-center px-1.5 py-0.5 rounded-full leading-snug"
            style={{
              background: '#1a2332',
              border: `1px solid ${isWinner ? '#d4af37' : '#30363d'}`,
              color: isWinner ? '#d4af37' : '#e6edf3',
              fontSize: '10px',
              lineHeight: '1.3',
            }}
            title={playerHandEntry.handResult?.description ?? ''}
          >
            {playerHandEntry.handResult?.description ?? ''}
          </div>
        )}
      </div>

      {/* ── BetChip — current street bet floating below seat card ── */}
      <BetChip amount={player.total_bet_this_round} bigBlind={bigBlind} bbView={bbView} />

      {/* ── Action badge ── */}
      {actionStyle && (
        <div
          className={`
            px-2 py-0.5 rounded-full text-[10px] font-bold tracking-widest uppercase leading-none
            ${actionStyle.classes}
          `}
        >
          {actionStyle.label}
        </div>
      )}

      {/* ── Stats hover tooltip ── */}
      {isHovered && !isCoachSeat && player.stableId && (
        <div style={{
          position: 'absolute',
          bottom: '110%',
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 200,
          pointerEvents: 'none',
          background: '#161b22',
          border: '1px solid rgba(255,255,255,0.14)',
          borderRadius: '8px',
          padding: '10px 12px',
          minWidth: '210px',
          boxShadow: '0 8px 32px rgba(0,0,0,0.75)',
          fontSize: '11px',
          whiteSpace: 'nowrap',
        }}>
          <div style={{ color: '#e6edf3', fontWeight: 700, marginBottom: 8, fontSize: '12px' }}>
            {player.name}
          </div>

          {statsLoading && (
            <div style={{ color: '#6e7681', fontSize: '10px' }}>Loading…</div>
          )}

          {stats && (() => {
            const STAT_ROWS = [
              { label: 'VPIP',    sessKey: 'vpip_count',      allKey: 'vpip_count',      sessDen: 'hands_played', allDen: 'total_hands' },
              { label: 'PFR',     sessKey: 'pfr_count',       allKey: 'pfr_count',       sessDen: 'hands_played', allDen: 'total_hands' },
              { label: 'WTSD',    sessKey: 'wtsd_count',      allKey: 'wtsd_count',      sessDen: 'hands_played', allDen: 'total_hands' },
              { label: 'WSD',     sessKey: 'wsd_count',       allKey: 'wsd_count',       sessDen: 'wtsd_count',   allDen: 'wtsd_count'  },
              { label: '3-bet %', sessKey: 'three_bet_count', allKey: 'three_bet_count', sessDen: 'hands_played', allDen: 'total_hands' },
            ];
            const fmt = (count, denom) =>
              denom > 0 ? `${Math.round(count / denom * 100)}%` : '—';
            const s = stats.session;
            const a = stats.allTime;
            const allTimeWinning = Math.max(0, a?.net_chips ?? 0);
            return (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: '76px 56px 56px', rowGap: 4 }}>
                  <div />
                  {sessionId && <div style={{ color: '#6e7681', fontSize: '9px', letterSpacing: '0.08em', textAlign: 'right', fontWeight: 600, textTransform: 'uppercase' }}>Session</div>}
                  <div style={{ color: '#6e7681', fontSize: '9px', letterSpacing: '0.08em', textAlign: 'right', fontWeight: 600, textTransform: 'uppercase', gridColumn: sessionId ? 'auto' : '2 / span 2' }}>All-time</div>
                  {STAT_ROWS.map(({ label, sessKey, allKey, sessDen, allDen }) => (
                    <React.Fragment key={label}>
                      <div style={{ color: '#d4af37', fontWeight: 600 }}>{label}</div>
                      {sessionId && (
                        <div style={{ color: '#adbac7', textAlign: 'right', fontFamily: 'monospace' }}>
                          {s ? fmt(s[sessKey] ?? 0, s[sessDen] ?? 0) : '—'}
                        </div>
                      )}
                      <div style={{ color: '#adbac7', textAlign: 'right', fontFamily: 'monospace' }}>
                        {a ? fmt(a[allKey] ?? 0, a[allDen] ?? 0) : '—'}
                      </div>
                    </React.Fragment>
                  ))}
                </div>

                <div style={{
                  marginTop: 8,
                  borderTop: '1px solid rgba(255,255,255,0.08)',
                  paddingTop: 7,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'baseline',
                }}>
                  <span style={{ color: '#6e7681', fontWeight: 600 }}>Alltime Winning</span>
                  <span style={{
                    fontFamily: 'monospace',
                    fontWeight: 700,
                    color: allTimeWinning > 0 ? '#3fb950' : '#8b949e',
                  }}>
                    {allTimeWinning.toLocaleString()}
                  </span>
                </div>
                {(a?.total_hands ?? 0) > 0 && (
                  <div style={{ color: '#6e7681', fontSize: '10px', marginTop: 3 }}>
                    {a.total_hands} hands played
                  </div>
                )}
              </>
            );
          })()}
        </div>
      )}
    </div>
  );
}
