import React from 'react';
import PlayerSeat from './PlayerSeat';
import BoardCards from './BoardCards';
import { fmtChips } from '../utils/chips';

// Absolute seat positions as percentages of the container [left%, top%]
// Seat 0 = bottom-center, seats increase counter-clockwise (standard online poker)
const SEAT_POSITIONS = [
  { left: '50%',  top: '92%'  }, // 0  bottom-center
  { left: '22%',  top: '82%'  }, // 1  bottom-left
  { left: '5%',   top: '55%'  }, // 2  left
  { left: '18%',  top: '18%'  }, // 3  top-left
  { left: '38%',  top: '4%'   }, // 4  top-center-l
  { left: '62%',  top: '4%'   }, // 5  top-center-r
  { left: '82%',  top: '18%'  }, // 6  top-right
  { left: '95%',  top: '55%'  }, // 7  right
  { left: '78%',  top: '82%'  }, // 8  bottom-right
];

function formatPot(amount) {
  if (amount == null) return '0';
  return Number(amount).toLocaleString('en-US');
}

function Toast({ notification, onDismiss }) {
  return (
    <div
      className="toast-enter flex items-start gap-2 px-3 py-2 rounded-lg shadow-xl cursor-pointer"
      style={{
        background: 'rgba(15, 23, 42, 0.95)',
        border: '1px solid rgba(212,175,55,0.25)',
        backdropFilter: 'blur(8px)',
        maxWidth: 280,
      }}
      onClick={onDismiss}
    >
      <span className="text-xs text-gray-200 leading-snug flex-1">
        {notification.message ?? notification}
      </span>
      <span className="text-gray-500 text-xs shrink-0 mt-0.5">✕</span>
    </div>
  );
}

function ActionTimerBar({ timer }) {
  const [pct, setPct] = React.useState(100);
  React.useEffect(() => {
    if (!timer) return;
    const { startedAt, duration } = timer;
    const update = () => {
      const elapsed = Date.now() - startedAt;
      const remaining = Math.max(0, duration - elapsed);
      setPct(Math.round((remaining / duration) * 100));
    };
    update();
    const interval = setInterval(update, 200);
    return () => clearInterval(interval);
  }, [timer]);

  const color = pct > 50 ? '#22c55e' : pct > 25 ? '#f59e0b' : '#ef4444';
  return (
    <div style={{ width: 80, height: 3, background: 'rgba(255,255,255,0.1)', borderRadius: 2 }}>
      <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 2, transition: 'width 0.2s linear' }} />
    </div>
  );
}

// Import BettingControls lazily — it may not exist yet, guard gracefully
let BettingControls = null;
try {
  // Dynamic require fallback — we attempt to import; in Vite this will be
  // resolved at build time. We wrap in a try/catch so the file compiles
  // even if BettingControls doesn't exist yet.
  BettingControls = React.lazy(() =>
    import('./BettingControls').catch(() => ({ default: () => null }))
  );
} catch (_) {
  BettingControls = () => null;
}

export default function PokerTable({
  gameState,
  myId,
  isCoach = false,
  coachDisconnected = false,
  actionTimer = null,
  emit = {},
  onOpenCardPicker,
  bbView = false,
  bigBlind = 10,
  onToggleBBView,
}) {
  // ── Derived state ──────────────────────────────────────────────────────────
  const players        = gameState?.players ?? [];
  const board          = gameState?.board ?? [];
  const phase          = gameState?.phase ?? 'waiting';
  const pot            = gameState?.pot ?? 0;
  const sidePots       = gameState?.side_pots ?? [];
  const isPaused       = gameState?.paused === true;
  const winner         = gameState?.winner ?? null;   // socket ID string or null
  const winnerPlayer   = players?.find(p => p.id === winner);
  const winnerName     = winnerPlayer?.name ?? gameState?.winner_name ?? null;
  const winnerPot      = winner?.amount ?? pot;
  const notifications  = gameState?.notifications ?? [];
  const showdownResult = gameState?.showdown_result ?? null;
  const isShowdown     = phase === 'showdown';
  const isScenario    = gameState?.is_scenario === true;
  const isConfigPhase = gameState?.config_phase === true;

  // Build a Set of winner player ids for quick lookup
  const winnerIds = new Set(
    (showdownResult?.winners ?? []).map((w) => w.playerId)
  );

  // All seated players are visible (coach now has a real seat)
  const visiblePlayers = players;

  // Current turn player id
  const currentTurnId = gameState?.current_player ?? gameState?.current_turn ?? null;

  // Find my seat offset for POV rotation
  const myPlayer = visiblePlayers.find(p => p.id === myId) ?? null;
  // For coach (no seat / seat=-1), mySeat=0 means no rotation
  const mySeat = (myPlayer?.seat != null && myPlayer.seat >= 0) ? myPlayer.seat : 0;

  // ── Helpers ────────────────────────────────────────────────────────────────
  function getSeatStyle(seatIndex) {
    // Rotate so myId's seat appears at position 0 (bottom-center)
    const rotated = (seatIndex - mySeat + SEAT_POSITIONS.length) % SEAT_POSITIONS.length;
    const pos = SEAT_POSITIONS[rotated] ?? SEAT_POSITIONS[0];
    return {
      left: pos.left,
      top: pos.top,
      transform: 'translate(-50%, -50%)',
    };
  }

  function handleHoleCardClick(player, position) {
    if (onOpenCardPicker) {
      onOpenCardPicker({
        type: 'player',
        playerId: player.id,
        position,
      });
    }
  }

  function handleBoardCardClick(position) {
    if (onOpenCardPicker) {
      onOpenCardPicker({ type: 'board', position });
    }
  }

  // ── Pot display ────────────────────────────────────────────────────────────
  const totalSidePots = sidePots.reduce((acc, sp) => acc + (sp.amount ?? 0), 0);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex-1 relative flex flex-col overflow-hidden">
      {/* ── Notifications (top-right, max 3) ──────────────────────────────── */}
      <div className="absolute top-3 right-3 z-40 flex flex-col gap-2 pointer-events-none">
        {notifications.slice(-3).map((n, i) => (
          <div key={i} className="pointer-events-auto">
            <Toast notification={n} onDismiss={() => {}} />
          </div>
        ))}
      </div>

      {/* ── Table container — fills available space ──────────────────────── */}
      <div className="flex-1 relative flex items-center justify-center">
        {/* Oval felt table */}
        <div
          className="table-felt relative"
          style={{
            width: '70vw',
            height: '45vh',
            borderRadius: '50%',
          }}
        >
          {/* ── Board cards — top center of oval ────────────────────────── */}
          <div className="absolute top-[18%] left-1/2 -translate-x-1/2">
            <BoardCards
              board={board}
              phase={phase}
              isCoach={isCoach}
              onCardClick={handleBoardCardClick}
            />
          </div>

          {/* ── Pot display — center of oval ────────────────────────────── */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-1 pointer-events-none">
            {winnerName ? (
              <div className="flex flex-col items-center gap-1">
                <span
                  className="text-xs font-semibold tracking-widest uppercase"
                  style={{ color: '#d4af37' }}
                >
                  WINNER
                </span>
                <span
                  className="text-base font-bold tracking-wide"
                  style={{ color: '#f0d060', textShadow: '0 0 12px rgba(212,175,55,0.7)' }}
                >
                  {winnerName}
                </span>
                <span className="text-xs font-mono" style={{ color: '#d4af37' }}>
                  +{fmtChips(winnerPot, bigBlind, bbView)}
                </span>
              </div>
            ) : pot > 0 ? (
              <div className="flex flex-col items-center gap-0.5">
                <span
                  className="text-[11px] font-semibold tracking-[0.2em] uppercase"
                  style={{ color: 'rgba(212,175,55,0.6)' }}
                >
                  POT
                </span>
                <span
                  className="text-lg font-bold font-mono leading-none"
                  style={{ color: '#d4af37', textShadow: '0 0 10px rgba(212,175,55,0.5)' }}
                >
                  {fmtChips(pot, bigBlind, bbView)}
                </span>
                {sidePots.length > 0 && (
                  <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                    {sidePots.map((sp, idx) => {
                      const eligibleNames = sp.eligiblePlayerIds
                        .map(id => gameState.players.find(p => p.id === id)?.name ?? id)
                        .join(', ');
                      return (
                        <div key={idx} style={{ fontSize: 11, color: 'var(--color-text-muted, #888)', background: 'rgba(0,0,0,0.35)', borderRadius: 6, padding: '2px 10px' }}>
                          Pot {idx + 1}: <strong style={{ color: 'var(--color-gold, #d4af37)' }}>{fmtChips(sp.amount, bigBlind, bbView)}</strong>
                          <span style={{ marginLeft: 6, opacity: 0.75 }}>({eligibleNames})</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : null}
          </div>

          {/* ── Phase label — bottom center of oval ─────────────────────── */}
          {phase && phase !== 'waiting' && phase !== 'replay' && (
            <div className="absolute bottom-[14%] left-1/2 -translate-x-1/2">
              <span
                className="text-[10px] font-semibold tracking-[0.3em] uppercase"
                style={{ color: 'rgba(212,175,55,0.45)' }}
              >
                {phase}
              </span>
            </div>
          )}

          {/* ── BB view toggle ───────────────────────────────────────── */}
          {onToggleBBView && (
            <button
              onClick={onToggleBBView}
              className="absolute top-2 right-3 z-10 text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded transition-colors"
              style={{
                background: bbView ? 'rgba(88,166,255,0.2)' : 'rgba(255,255,255,0.07)',
                color: bbView ? '#58a6ff' : 'rgba(255,255,255,0.35)',
                border: `1px solid ${bbView ? 'rgba(88,166,255,0.5)' : 'rgba(255,255,255,0.1)'}`,
              }}
              title="Toggle between chip count and big-blind view"
            >
              {bbView ? 'BB' : 'Chips'}
            </button>
          )}

          {/* ── Replay / Branched badges ─────────────────────────────── */}
          {gameState?.replay_mode?.active && !gameState?.replay_mode?.branched && (
            <div className="absolute bottom-[30%] left-1/2 -translate-x-1/2 pointer-events-none">
              <span className="px-2 py-0.5 text-xs rounded bg-blue-600 text-white font-bold uppercase">
                REPLAY
              </span>
            </div>
          )}
          {gameState?.replay_mode?.branched && (
            <div className="absolute bottom-[30%] left-1/2 -translate-x-1/2 pointer-events-none">
              <span className="px-2 py-0.5 text-xs rounded bg-amber-600 text-white font-bold uppercase">
                BRANCHED
              </span>
            </div>
          )}

          {/* ── Scenario / Drill badges ──────────────────────────────── */}
          {(isScenario || isConfigPhase) && (
            <div className="absolute bottom-[22%] left-1/2 -translate-x-1/2 flex gap-2 pointer-events-none">
              {isScenario && (
                <span
                  className="text-[9px] font-black tracking-[0.3em] uppercase px-2 py-0.5 rounded-full"
                  style={{
                    background: 'rgba(99,102,241,0.2)',
                    color: '#a5b4fc',
                    border: '1px solid rgba(99,102,241,0.4)',
                  }}
                >
                  SCENARIO
                </span>
              )}
              {isConfigPhase && !isScenario && (
                <span
                  className="text-[9px] font-black tracking-[0.3em] uppercase px-2 py-0.5 rounded-full"
                  style={{
                    background: 'rgba(245,158,11,0.2)',
                    color: '#fbbf24',
                    border: '1px solid rgba(245,158,11,0.4)',
                  }}
                >
                  DRILL SETUP
                </span>
              )}
            </div>
          )}

          {/* ── Paused overlay ──────────────────────────────────────────── */}
          {isPaused && (
            <div
              className="absolute inset-0 rounded-[50%] flex items-center justify-center z-20"
              style={{
                background: 'rgba(0,0,0,0.55)',
                backdropFilter: 'blur(3px)',
              }}
            >
              <span
                className="text-2xl font-black tracking-[0.4em] uppercase"
                style={{ color: '#d4af37', textShadow: '0 0 20px rgba(212,175,55,0.5)' }}
              >
                PAUSED
              </span>
            </div>
          )}

          {/* ── Coach Disconnected overlay ──────────────────────────────── */}
          {coachDisconnected && (
            <div
              className="absolute inset-0 rounded-[50%] flex flex-col items-center justify-center z-25"
              style={{
                background: 'rgba(0,0,0,0.7)',
                backdropFilter: 'blur(4px)',
              }}
            >
              <span
                className="text-xl font-black tracking-[0.3em] uppercase mb-1"
                style={{ color: '#ef4444', textShadow: '0 0 20px rgba(239,68,68,0.5)' }}
              >
                COACH OFFLINE
              </span>
              <span className="text-xs tracking-widest" style={{ color: 'rgba(239,68,68,0.7)' }}>
                Reconnecting…
              </span>
            </div>
          )}

          {/* ── Action Timer ───────────────────────────────────────────────── */}
          {actionTimer && !isPaused && (
            <div className="absolute bottom-[6%] left-1/2 -translate-x-1/2">
              <ActionTimerBar timer={actionTimer} />
            </div>
          )}
          {actionTimer && isPaused && (
            <div className="absolute bottom-[6%] left-1/2 -translate-x-1/2">
              <span className="text-[9px] tracking-widest uppercase" style={{ color: 'rgba(212,175,55,0.4)' }}>
                TIMER PAUSED
              </span>
            </div>
          )}

          {/* ── Showdown banner ─────────────────────────────────────────── */}
          {isShowdown && !isPaused && (
            <div
              className="absolute left-1/2 -translate-x-1/2 z-30 flex flex-col items-center gap-2 px-5 py-3 rounded-2xl pointer-events-auto"
              style={{
                top: '38%',
                background: 'rgba(0,0,0,0.85)',
                border: '1px solid #d4af37',
                boxShadow: '0 0 24px rgba(212,175,55,0.25)',
                backdropFilter: 'blur(8px)',
                minWidth: 220,
                maxWidth: 340,
              }}
            >
              {/* Header */}
              <span
                className="text-[10px] font-black tracking-[0.35em] uppercase leading-none"
                style={{ color: '#d4af37' }}
              >
                {showdownResult?.splitPot ? 'SPLIT POT' : 'WINNER'}
              </span>

              {/* Winner name(s) */}
              <div className="flex flex-col items-center gap-0.5">
                {(showdownResult?.winners ?? [{ playerId: winner, playerName: winnerName }]).map((w) => (
                  <span
                    key={w.playerId}
                    className="text-base font-bold tracking-wide leading-tight text-center"
                    style={{ color: '#f0d060', textShadow: '0 0 12px rgba(212,175,55,0.6)' }}
                  >
                    {w.playerName}
                  </span>
                ))}
              </div>

              {/* Winning hand description — use first winner's hand */}
              {showdownResult?.winners[0]?.handResult?.description && (
                <span
                  className="text-[11px] font-semibold text-center leading-snug"
                  style={{ color: 'rgba(212,175,55,0.85)' }}
                >
                  {showdownResult.winners[0].handResult.description}
                </span>
              )}

              {/* Pot awarded */}
              {(showdownResult?.potAwarded ?? 0) > 0 && (
                <span
                  className="text-[11px] font-mono leading-none"
                  style={{ color: 'rgba(212,175,55,0.65)' }}
                >
                  +{Number(showdownResult.potAwarded).toLocaleString('en-US')} chips
                </span>
              )}

              {/* Next Hand button — coach only */}
              {isCoach && (
                <button
                  className="btn-gold mt-1 px-4 py-1.5 text-[11px] tracking-widest uppercase"
                  onClick={() => emit.resetHand?.()}
                >
                  Next Hand
                </button>
              )}
            </div>
          )}
        </div>

        {/* ── Player seats — absolutely positioned around the oval ──────── */}
        {/* We need a full-size container for absolute seat positioning */}
        <div className="absolute inset-0 pointer-events-none">
          {visiblePlayers.map((player) => {
            const seatIndex = player.seat ?? 0;
            const seatStyle = getSeatStyle(seatIndex);
            const isCurrentTurn = player.id === currentTurnId;
            const isMe = player.id === myId;

            const isWinner = isShowdown && winnerIds.has(player.id);

            return (
              <div key={player.id} className="pointer-events-auto">
                <PlayerSeat
                  player={player}
                  isCurrentTurn={isCurrentTurn}
                  isMe={isMe}
                  isCoach={isCoach}
                  style={seatStyle}
                  onHoleCardClick={(position) => handleHoleCardClick(player, position)}
                  showdownResult={isShowdown ? showdownResult : null}
                  isWinner={isWinner}
                  replayMode={gameState?.replay_mode ?? null}
                  bbView={bbView}
                  bigBlind={bigBlind}
                />
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Betting controls — outside/below the oval ─────────────────────── */}
      <div className="relative z-30 flex-shrink-0">
        <React.Suspense fallback={null}>
          {BettingControls && !(gameState?.replay_mode?.active && !gameState?.replay_mode?.branched) && (
            <BettingControls
              gameState={gameState}
              myId={myId}
              isCoach={isCoach}
              emit={emit}
              bbView={bbView}
              bigBlind={bigBlind}
            />
          )}
        </React.Suspense>
      </div>
    </div>
  );
}
