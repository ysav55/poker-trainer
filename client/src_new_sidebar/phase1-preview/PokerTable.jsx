const { useState, useEffect, useRef, useCallback, useMemo, Fragment } = React;
const fmtChips = window.__fmtChips;
const apiFetch = window.__apiFetch;
const EquityBadge = window.__EquityBadge;
const SharedRangeOverlay = window.__SharedRangeOverlay;
const PlayerRangePanel = window.__PlayerRangePanel;
const PlayerSeat = window.P1_PlayerSeat;
const BoardCards = window.P1_BoardCards;
const BettingControls = window.P1_BettingControls;








/**
 * PokerTable — drop-in replacement for client/src/components/PokerTable.jsx.
 * Props preserved 1:1. No call-site changes required in TablePage.jsx.
 *
 * Visual redesign:
 *   - Obsidian background, rounded-rect felt (not an oval + wood rim)
 *   - Radial spotlight follows the active seat (soft violet-amber)
 *   - Hairline inner frame + FeltSide watermark monogram
 *   - Bet trails: animated dashed lines from each bettor toward the pot
 *   - Instrument Serif pot numeral
 */

const ACCENT       = '#c9a35d';
const ACCENT_DIM   = 'rgba(201,163,93,0.55)';
const ACCENT_FAINT = 'rgba(201,163,93,0.2)';
const INK          = '#f0ece3';
const INK_DIM      = 'rgba(240,236,227,0.6)';

// ── Seat placement ──────────────────────────────────────────────────────────
// The felt is a rounded rectangle ≈ 1080×700. Seat pods are ~148×150 and the
// avatar disc overlaps 30px above the pod, so we need enough vertical padding
// at the top edge. We place seats along a tight ellipse, with explicitly
// curated angle sets per player-count to (a) avoid the pot+board zone on the
// vertical centerline and (b) keep every pod fully inside the felt.
//
// Origin: felt center. Angle 0 = bottom-center (hero). Angles rotate CCW.
// Positions are authored per count — no generic ellipse fallback — so we can
// tune each case for the visual balance we want.

// Ellipse half-axes as percent of felt dimensions.
// Vertical axis is modest to prevent top-row pods clipping above the felt
// (the pod extends ~80px above its center due to avatar overflow).
const SEAT_RX_PCT = 41;  // horizontal reach — wide so seats spread
const SEAT_RY_PCT = 30;  // vertical reach — tight to keep top seats well inside

// Each seat is (angleDegrees, verticalNudgePx) — angles 0..360 CCW from bottom.
// verticalNudge lets us pull individual seats down to clear the top edge or up
// to clear the hero pod.
function seatAt(angleDeg, nudgeY = 0) {
  const r = (angleDeg * Math.PI) / 180;
  return {
    angle: angleDeg,
    left: `${50 + SEAT_RX_PCT * Math.sin(r)}%`,
    top:  `calc(${50 + SEAT_RY_PCT * Math.cos(r)}% + ${nudgeY}px)`,
  };
}

// Per-count seat tables. Element 0 is always the hero (bottom-center).
// CCW order matches poker-table convention.
const SEAT_LAYOUTS = {
  1: [ seatAt(0) ],
  2: [ seatAt(0), seatAt(180, 10) ],
  3: [ seatAt(0), seatAt(130), seatAt(-130) ],
  4: [ seatAt(0), seatAt(110), seatAt(180, 10), seatAt(-110) ],
  5: [ seatAt(0), seatAt(100), seatAt(150, 8), seatAt(-150, 8), seatAt(-100) ],
  6: [ seatAt(0), seatAt(60), seatAt(120), seatAt(180, 10), seatAt(-120), seatAt(-60) ],
  7: [ seatAt(0), seatAt(55), seatAt(110), seatAt(155, 10), seatAt(-155, 10), seatAt(-110), seatAt(-55) ],
  8: [ seatAt(0), seatAt(45), seatAt(90), seatAt(135, 8), seatAt(180, 12), seatAt(-135, 8), seatAt(-90), seatAt(-45) ],
  9: [ seatAt(0), seatAt(40), seatAt(80), seatAt(125, 6), seatAt(160, 10), seatAt(-160, 10), seatAt(-125, 6), seatAt(-80), seatAt(-40) ],
};

function PokerTable({
  gameState,
  myId,
  isCoach = false,
  coachDisconnected = false,
  actionTimer = null,
  emit = {},
  onOpenCardPicker,
  bbView = false,
  bigBlind = 10,
  equityData = null,
  equityEnabled = false,
  sharedRange = null,
  equitySettings = null,
  tableMode = null,
  onBotRemove = null,
}) {
  // ── State ─────────────────────────────────────────────────────────────────
  const players        = gameState?.players ?? [];
  const board          = gameState?.board ?? [];
  const phase          = gameState?.phase ?? 'waiting';
  const pot            = gameState?.pot ?? 0;
  const sidePots       = gameState?.side_pots ?? [];
  const centerPot = Math.max(0, pot - players.reduce((s, p) => s + (p.total_bet_this_round ?? 0), 0));
  const isPaused       = gameState?.paused === true;
  const winner         = gameState?.winner ?? null;
  const winnerPlayer   = players?.find(p => p.id === winner);
  const winnerName     = winnerPlayer?.name ?? gameState?.winner_name ?? null;
  const showdownResult = gameState?.showdown_result ?? null;
  const isShowdown     = phase === 'showdown';
  const isScenario     = gameState?.is_scenario === true;
  const isConfigPhase  = gameState?.config_phase === true;

  const winnerIds = new Set((showdownResult?.winners ?? []).map(w => w.playerId));
  const visiblePlayers = players;
  const currentTurnId = gameState?.current_player ?? gameState?.current_turn ?? null;

  const sortedBySeat = React.useMemo(
    () => [...visiblePlayers].sort((a, b) => (a.seat ?? 0) - (b.seat ?? 0)),
    [visiblePlayers]
  );
  const myIdx = sortedBySeat.findIndex(p => p.id === myId);
  const n = sortedBySeat.length;

  // ── Equity helpers ────────────────────────────────────────────────────────
  function getPlayerEquity(player) {
    if (!equityData?.equities) return null;
    const stableId = player.stableId || player.id;
    return equityData.equities.find(e => e.playerId === stableId)?.equity ?? null;
  }
  function isEquityVisible(player) {
    if (!equityData) return false;
    if (isShowdown) return true;
    if (getPlayerEquity(player) == null) return false;
    if (isCoach) return equityEnabled;
    return equityData.showToPlayers === true;
  }

  // ── Seat positioning — rotate so hero is at seat 0 (bottom) ──────────────
  function getSeatStyle(player) {
    const playerIdx = sortedBySeat.findIndex(p => p.id === player.id);
    const effectiveMyIdx = myIdx >= 0 ? myIdx : 0;
    const relativeIdx = (playerIdx - effectiveMyIdx + n) % n;
    const layout = SEAT_LAYOUTS[n] ?? SEAT_LAYOUTS[9];
    const pos = layout[relativeIdx] ?? layout[0];
    return { left: pos.left, top: pos.top, transform: 'translate(-50%, -50%)' };
  }

  // Find active seat position for the spotlight
  const activePlayer = players.find(p => p.id === currentTurnId);
  const activeSeatPos = activePlayer ? (() => {
    const style = getSeatStyle(activePlayer);
    return { left: style.left, top: style.top };
  })() : null;

  function handleBoardCardClick(position) {
    if (onOpenCardPicker) onOpenCardPicker({ type: 'board', position });
  }
  function handleHoleCardClick(player, position) {
    if (onOpenCardPicker) onOpenCardPicker({ type: 'player', playerId: player.id, position });
  }

  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      width: '100%', height: '100%', overflow: 'hidden',
      background: 'radial-gradient(ellipse at 50% 40%, #1a1628 0%, #0a0c12 60%, #060810 100%)',
    }}>

      {/* ── Table area ────────────────────────────────────────────────── */}
      <div style={{
        flex: 1, position: 'relative',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        minHeight: 0,
      }}>

        {/* Felt surface — two-layer:
            • OUTER: positioning anchor for seats (no overflow clipping, so avatars/timer rings can extend past the felt edge)
            • INNER: clipped layer that hosts the felt background, watermark, spotlight, bet-trails */}
        <div style={{
          position: 'relative',
          width: 'min(92%, 1080px)',
          height: 'min(84%, 700px)',
        }}>

          {/* Inner clipped layer — visual felt */}
          <div style={{
            position: 'absolute', inset: 0,
            borderRadius: 180,
            background: 'radial-gradient(ellipse at 50% 40%, #1a1a22 0%, #0f1018 60%, #0a0b14 100%)',
            border: `1px solid ${ACCENT_FAINT}`,
            boxShadow: `
              0 30px 80px rgba(0,0,0,0.7),
              inset 0 0 0 1px rgba(255,255,255,0.03),
              inset 0 40px 80px rgba(201,163,93,0.04),
              inset 0 -40px 80px rgba(106,80,186,0.06)
            `,
            overflow: 'hidden',
            zIndex: 1,
          }}>
            {/* Hairline inner frame */}
            <div style={{
              position: 'absolute', inset: 12, borderRadius: 170,
              border: '1px solid rgba(201,163,93,0.1)',
              pointerEvents: 'none',
            }}/>

            {/* Radial spotlight that follows active seat */}
            {activeSeatPos && (
              <div style={{
                position: 'absolute',
                left: activeSeatPos.left, top: activeSeatPos.top,
                transform: 'translate(-50%, -50%)',
                width: 460, height: 460, borderRadius: '50%',
                background: 'radial-gradient(circle, rgba(201,163,93,0.1) 0%, rgba(201,163,93,0.04) 35%, transparent 65%)',
                pointerEvents: 'none',
                transition: 'left 500ms ease, top 500ms ease',
              }}/>
            )}

            {/* FeltSide watermark */}
            <div style={{
              position: 'absolute', inset: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              pointerEvents: 'none',
            }}>
              <span style={{
                fontFamily: "'Instrument Serif', serif",
                fontStyle: 'italic',
                fontSize: 110,
                color: 'rgba(201,163,93,0.04)',
                letterSpacing: '-0.04em',
                userSelect: 'none',
              }}>
                FeltSide
              </span>
            </div>

            {/* Bet trails — SVG lines from each bettor to center-pot */}
            <BetTrails players={players} getSeatStyle={getSeatStyle} />
          </div>

          {/* ── Board + Pot — stacked in the center of the felt ── */}
          <div style={{
            position: 'absolute',
            left: '50%', top: '45%',
            transform: 'translate(-50%, -50%)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14,
            zIndex: 4,
          }}>
            <BoardCards
              board={board}
              phase={phase}
              isCoach={isCoach}
              onCardClick={isCoach ? handleBoardCardClick : null}
            />

            {isShowdown ? (
              <WinnerBlock
                showdownResult={showdownResult}
                winnerName={winnerName}
                winner={winner}
                isCoach={isCoach}
                onNextHand={() => emit.resetHand?.()}
                bbView={bbView}
                bigBlind={bigBlind}
              />
            ) : centerPot > 0 ? (
              <PotBlock
                centerPot={centerPot}
                sidePots={sidePots}
                players={players}
                bbView={bbView}
                bigBlind={bigBlind}
              />
            ) : null}
          </div>

          {/* ── Scenario / Config badges ─────────────────────────────── */}
          {(isScenario || isConfigPhase) && (
            <div style={{
              position: 'absolute',
              left: '50%', bottom: '26%',
              transform: 'translateX(-50%)',
              display: 'flex', gap: 8,
              pointerEvents: 'none', zIndex: 3,
            }}>
              {isScenario && (
                <Pill bg="rgba(99,102,241,0.18)" fg="#a5b4fc" bd="rgba(99,102,241,0.45)">
                  SCENARIO
                </Pill>
              )}
              {isConfigPhase && !isScenario && (
                <Pill bg="rgba(245,158,11,0.18)" fg="#fbbf24" bd="rgba(245,158,11,0.45)">
                  DRILL SETUP
                </Pill>
              )}
            </div>
          )}

          {/* ── Paused overlay ──────────────────────────────────────── */}
          {isPaused && (
            <Overlay>
              <span style={{
                fontFamily: "'General Sans', sans-serif",
                fontSize: 26, fontWeight: 800,
                letterSpacing: '0.4em', color: ACCENT,
                textShadow: '0 0 24px rgba(201,163,93,0.6)',
              }}>PAUSED</span>
            </Overlay>
          )}

          {/* ── Coach Disconnected overlay ──────────────────────────── */}
          {coachDisconnected && (
            <Overlay strong>
              <span style={{
                fontFamily: "'General Sans', sans-serif",
                fontSize: 22, fontWeight: 800,
                letterSpacing: '0.3em', color: '#ef4444',
                textShadow: '0 0 20px rgba(239,68,68,0.5)',
                marginBottom: 4,
              }}>COACH OFFLINE</span>
              <span style={{
                fontFamily: "'General Sans', sans-serif",
                fontSize: 11, color: 'rgba(239,68,68,0.7)',
                letterSpacing: '0.2em',
              }}>Reconnecting…</span>
            </Overlay>
          )}

          {/* ── Player seats ──────────────────────────────────────── */}
          <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 5 }}>
            {visiblePlayers.map((player) => {
              const seatStyle = getSeatStyle(player);
              const isCurrentTurn = player.id === currentTurnId;
              const isMe = player.id === myId;
              const isWinner = isShowdown && winnerIds.has(player.id);

              return (
                <div key={player.id} style={{ pointerEvents: 'auto' }}>
                  <PlayerSeat
                    player={player}
                    isCurrentTurn={isCurrentTurn}
                    isMe={isMe}
                    isCoach={isCoach}
                    style={seatStyle}
                    onHoleCardClick={(pos) => handleHoleCardClick(player, pos)}
                    showdownResult={isShowdown ? showdownResult : null}
                    isWinner={isWinner}
                    bbView={bbView}
                    bigBlind={bigBlind}
                    sessionId={gameState?.session_id ?? null}
                    actionTimer={actionTimer}
                    equity={getPlayerEquity(player)}
                    equityVisible={isEquityVisible(player)}
                    tableMode={tableMode}
                    onBotRemove={onBotRemove}
                  />
                </div>
              );
            })}
          </div>
        </div>

        {/* Shared range overlay */}
        <SharedRangeOverlay sharedRange={sharedRange} gamePhase={phase} />

        {/* Player range panel */}
        {!isCoach && (
          <PlayerRangePanel gameState={gameState} myId={myId} equitySettings={equitySettings} />
        )}
      </div>

      {/* ── Betting controls — in-flow below table ─────────────────── */}
      <div style={{ position: 'relative', zIndex: 30, flexShrink: 0 }}>
        <BettingControls
          gameState={gameState}
          myId={myId}
          isCoach={isCoach}
          emit={emit}
          bbView={bbView}
          bigBlind={bigBlind}
          equityData={equityData}
        />
      </div>
    </div>
  );
}

// ── PotBlock ─────────────────────────────────────────────────────────────────
function PotBlock({ centerPot, sidePots, players, bbView, bigBlind }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
    }}>
      <span style={{
        fontFamily: "'General Sans', sans-serif",
        fontSize: 9, fontWeight: 700,
        letterSpacing: '0.3em', color: ACCENT_DIM,
        textTransform: 'uppercase',
      }}>POT</span>
      <span style={{
        fontFamily: "'Instrument Serif', serif",
        fontSize: 34, lineHeight: 1,
        color: ACCENT,
        letterSpacing: '-0.02em',
        textShadow: `0 0 24px rgba(201,163,93,0.35)`,
      }}>
        {fmtChips(centerPot, bigBlind, bbView)}
      </span>
      {sidePots.length > 0 && (
        <div style={{
          marginTop: 6, display: 'flex', flexDirection: 'column',
          alignItems: 'center', gap: 3,
        }}>
          {sidePots.map((sp, idx) => {
            const names = sp.eligiblePlayerIds
              .map(id => players.find(p => p.id === id)?.name ?? id)
              .join(', ');
            return (
              <div key={idx} style={{
                fontSize: 10, color: INK_DIM,
                background: 'rgba(0,0,0,0.4)',
                border: `1px solid ${ACCENT_FAINT}`,
                borderRadius: 999,
                padding: '2px 9px',
                fontFamily: "'JetBrains Mono', monospace",
              }}>
                Pot {idx + 1}:{' '}
                <strong style={{ color: ACCENT }}>
                  {fmtChips(sp.amount, bigBlind, bbView)}
                </strong>
                <span style={{ marginLeft: 6, opacity: 0.7 }}>({names})</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── WinnerBlock ──────────────────────────────────────────────────────────────
function WinnerBlock({ showdownResult, winnerName, winner, isCoach, onNextHand, bbView, bigBlind }) {
  const winners = showdownResult?.winners ?? [{ playerId: winner, playerName: winnerName }];
  const description = showdownResult?.winners?.[0]?.handResult?.description;
  const potAwarded = showdownResult?.potAwarded ?? 0;
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
      padding: '10px 18px',
      background: 'rgba(14,14,22,0.6)',
      border: `1px solid ${ACCENT_DIM}`,
      borderRadius: 12,
      boxShadow: `0 0 40px rgba(201,163,93,0.25), inset 0 1px 0 rgba(255,255,255,0.05)`,
    }}>
      <span style={{
        fontFamily: "'General Sans', sans-serif",
        fontSize: 9, fontWeight: 800,
        letterSpacing: '0.38em', color: ACCENT,
        textTransform: 'uppercase',
      }}>
        {showdownResult?.splitPot ? 'SPLIT POT' : 'WINNER'}
      </span>
      {winners.map(w => (
        <span key={w.playerId} style={{
          fontFamily: "'Instrument Serif', serif",
          fontSize: 22, lineHeight: 1,
          color: '#f0d060',
          letterSpacing: '-0.01em',
          textShadow: `0 0 16px rgba(201,163,93,0.55)`,
        }}>{w.playerName}</span>
      ))}
      {description && (
        <span style={{
          fontFamily: "'General Sans', sans-serif",
          fontSize: 11, fontWeight: 500,
          color: ACCENT_DIM, letterSpacing: '0.05em',
        }}>{description}</span>
      )}
      {potAwarded > 0 && (
        <span style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 11, fontWeight: 700, color: ACCENT,
        }}>+{fmtChips(potAwarded, bigBlind, bbView)}</span>
      )}
      {isCoach && (
        <button
          onClick={onNextHand}
          style={{
            marginTop: 6,
            padding: '6px 16px',
            borderRadius: 999,
            background: `linear-gradient(180deg, ${ACCENT}, #8c6a2a)`,
            border: '1px solid rgba(255,220,150,0.5)',
            color: '#1a1208',
            fontFamily: "'General Sans', sans-serif",
            fontSize: 10, fontWeight: 800,
            letterSpacing: '0.25em', textTransform: 'uppercase',
            cursor: 'pointer',
            boxShadow: `0 4px 14px rgba(201,163,93,0.3)`,
            pointerEvents: 'auto',
          }}
        >Next Hand</button>
      )}
    </div>
  );
}

// ── Pill ─────────────────────────────────────────────────────────────────────
function Pill({ bg, fg, bd, children }) {
  return (
    <span style={{
      fontFamily: "'General Sans', sans-serif",
      fontSize: 9, fontWeight: 800,
      letterSpacing: '0.3em', textTransform: 'uppercase',
      padding: '3px 9px', borderRadius: 999,
      background: bg, color: fg,
      border: `1px solid ${bd}`,
    }}>{children}</span>
  );
}

// ── Overlay ──────────────────────────────────────────────────────────────────
function Overlay({ children, strong = false }) {
  return (
    <div style={{
      position: 'absolute', inset: 0,
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      background: strong ? 'rgba(0,0,0,0.72)' : 'rgba(0,0,0,0.55)',
      backdropFilter: 'blur(3px)',
      zIndex: 25,
      borderRadius: 180,
    }}>
      {children}
    </div>
  );
}

// ── BetTrails — SVG dashed lines from each bettor to center pot ──────────────
function BetTrails({ players, getSeatStyle }) {
  // Filter to players who have committed chips this round
  const bettors = players.filter(p => (p.total_bet_this_round ?? 0) > 0);
  if (bettors.length === 0) return null;

  return (
    <svg style={{
      position: 'absolute', inset: 0,
      width: '100%', height: '100%',
      pointerEvents: 'none', zIndex: 2,
    }}>
      <defs>
        <linearGradient id="bet-trail-grad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%"  stopColor="rgba(201,163,93,0)"/>
          <stop offset="50%" stopColor="rgba(201,163,93,0.35)"/>
          <stop offset="100%" stopColor="rgba(201,163,93,0.6)"/>
        </linearGradient>
      </defs>
      {bettors.map(p => {
        const style = getSeatStyle(p);
        // seat % strings → numeric 0..1
        const sx = parseFloat(String(style.left)) / 100;
        const sy = parseFloat(String(style.top)) / 100;
        // target: center-pot at (50%, 45%) in felt
        return (
          <line
            key={p.id}
            x1={`${sx * 100}%`} y1={`${sy * 100}%`}
            x2="50%" y2="52%"
            stroke="url(#bet-trail-grad)"
            strokeWidth="1"
            strokeDasharray="3 4"
            style={{
              animation: 'bet-trail-dash 1.2s linear infinite',
            }}
          />
        );
      })}
      <style>{`
        @keyframes bet-trail-dash {
          to { stroke-dashoffset: -14; }
        }
      `}</style>
    </svg>
  );
}

;window.P1_PokerTable = PokerTable;
