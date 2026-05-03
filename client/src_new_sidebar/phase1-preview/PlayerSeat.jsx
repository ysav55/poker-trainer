const { useState, useEffect, useRef, useCallback, useMemo, Fragment } = React;
const fmtChips = window.__fmtChips;
const apiFetch = window.__apiFetch;
const EquityBadge = window.__EquityBadge;
const SharedRangeOverlay = window.__SharedRangeOverlay;
const PlayerRangePanel = window.__PlayerRangePanel;
const Card = window.P1_Card;






/**
 * PlayerSeat — drop-in replacement for client/src/components/PlayerSeat.jsx.
 * Props preserved 1:1; behavior preserved. Visuals redesigned.
 */

// ── Palette ──────────────────────────────────────────────────────────────────
const ACCENT        = '#c9a35d';
const ACCENT_DIM    = 'rgba(201,163,93,0.55)';
const ACCENT_FAINT  = 'rgba(201,163,93,0.18)';
const INK           = '#f0ece3';
const INK_DIM       = 'rgba(240,236,227,0.62)';
const CARD_BG       = 'rgba(20,23,30,0.88)';
const CARD_BG_ACTIVE = 'rgba(28,24,40,0.92)';

// ── ActionTimerRing — arc around avatar ──────────────────────────────────────
function ActionTimerRing({ timer, playerId, size = 64 }) {
  const [pct, setPct] = useState(100);
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

  const radius = size / 2 - 3;
  const circ = 2 * Math.PI * radius;
  const offset = circ * (1 - pct / 100);
  const color = pct > 50 ? ACCENT : pct > 25 ? '#f59e0b' : '#ef4444';

  return (
    <svg
      width={size} height={size}
      style={{ position: 'absolute', top: -3, left: -3, pointerEvents: 'none' }}
    >
      <circle
        cx={size/2} cy={size/2} r={radius}
        fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="2.5"
      />
      <circle
        cx={size/2} cy={size/2} r={radius}
        fill="none" stroke={color} strokeWidth="2.5"
        strokeDasharray={circ} strokeDashoffset={offset}
        strokeLinecap="round"
        transform={`rotate(-90 ${size/2} ${size/2})`}
        style={{
          transition: 'stroke 0.3s, stroke-dashoffset 0.1s linear',
          filter: `drop-shadow(0 0 4px ${color})`,
        }}
      />
    </svg>
  );
}

// ── BetChip — chip stack + amount pill floating toward the pot ───────────────
function BetChip({ amount, bigBlind, bbView }) {
  if (!amount || amount <= 0) return null;
  // Rough chip count — 1 per BB, capped
  const chipCount = Math.min(6, Math.max(1, Math.round(amount / (bigBlind || 1))));
  return (
    <div style={{
      position: 'absolute',
      bottom: -34,
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: 5,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 2,
      pointerEvents: 'none',
    }}>
      <div style={{
        position: 'relative', width: 18, height: 10,
      }}>
        {Array.from({ length: chipCount }).map((_, i) => (
          <div key={i} style={{
            position: 'absolute', left: 0, bottom: i * 2,
            width: 18, height: 4, borderRadius: '50%',
            background: 'radial-gradient(ellipse at 40% 30%, #e8c76e, #8c6a2a 70%, #3a2a0f)',
            border: '0.5px solid rgba(255,220,150,0.4)',
            boxShadow: '0 1px 2px rgba(0,0,0,0.6)',
          }}/>
        ))}
      </div>
      <div style={{
        padding: '1px 7px',
        borderRadius: 999,
        background: 'rgba(10,10,14,0.85)',
        border: `1px solid ${ACCENT_DIM}`,
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 10, fontWeight: 700,
        color: ACCENT,
        whiteSpace: 'nowrap',
      }}>
        {fmtChips(amount, bigBlind, bbView)}
      </div>
    </div>
  );
}

// ── Action pill styles ───────────────────────────────────────────────────────
const ACTION_STYLES = {
  fold:    { label: 'FOLD',   bg: 'rgba(127,29,29,0.5)',  bd: 'rgba(185,28,28,0.5)',  fg: '#fca5a5' },
  folded:  { label: 'FOLD',   bg: 'rgba(127,29,29,0.5)',  bd: 'rgba(185,28,28,0.5)',  fg: '#fca5a5' },
  check:   { label: 'CHECK',  bg: 'rgba(55,65,81,0.5)',   bd: 'rgba(107,114,128,0.5)',fg: '#d1d5db' },
  checked: { label: 'CHECK',  bg: 'rgba(55,65,81,0.5)',   bd: 'rgba(107,114,128,0.5)',fg: '#d1d5db' },
  call:    { label: 'CALL',   bg: 'rgba(30,58,138,0.5)',  bd: 'rgba(59,130,246,0.5)', fg: '#93c5fd' },
  called:  { label: 'CALL',   bg: 'rgba(30,58,138,0.5)',  bd: 'rgba(59,130,246,0.5)', fg: '#93c5fd' },
  raise:   { label: 'RAISE',  bg: 'rgba(161,98,7,0.5)',   bd: 'rgba(217,119,6,0.55)', fg: '#fbbf24' },
  raised:  { label: 'RAISE',  bg: 'rgba(161,98,7,0.5)',   bd: 'rgba(217,119,6,0.55)', fg: '#fbbf24' },
  bet:     { label: 'BET',    bg: 'rgba(161,98,7,0.5)',   bd: 'rgba(217,119,6,0.55)', fg: '#fbbf24' },
  'all-in':{ label: 'ALL-IN', bg: 'rgba(88,28,135,0.5)',  bd: 'rgba(147,51,234,0.55)',fg: '#d8b4fe' },
  allin:   { label: 'ALL-IN', bg: 'rgba(88,28,135,0.5)',  bd: 'rgba(147,51,234,0.55)',fg: '#d8b4fe' },
  'all_in':{ label: 'ALL-IN', bg: 'rgba(88,28,135,0.5)',  bd: 'rgba(147,51,234,0.55)',fg: '#d8b4fe' },
};

// ── Avatar — initials disc with subtle gradient ──────────────────────────────
function AvatarDisc({ player, isCurrentTurn, isWinner, size = 58 }) {
  const initials = (player.name ?? '?')
    .split(/\s+/).map(s => s[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
  // Hash name → hue for deterministic tint
  const hash = Array.from(player.name ?? '').reduce((a, c) => a + c.charCodeAt(0), 0);
  const hue = hash % 360;

  return (
    <div style={{
      position: 'relative',
      width: size, height: size,
      borderRadius: '50%',
      background: isWinner
        ? `radial-gradient(circle at 30% 30%, #f0d060, #8c6a2a)`
        : `radial-gradient(circle at 30% 30%, hsl(${hue} 35% 42%), hsl(${hue} 45% 18%))`,
      border: isCurrentTurn ? `2px solid ${ACCENT}` : isWinner ? `2px solid ${ACCENT}` : '2px solid rgba(255,255,255,0.1)',
      boxShadow: isCurrentTurn
        ? `0 0 0 3px rgba(201,163,93,0.15), 0 0 18px rgba(201,163,93,0.35)`
        : isWinner
        ? `0 0 24px rgba(240,208,96,0.55)`
        : '0 2px 8px rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      flexShrink: 0,
    }}>
      <span style={{
        fontFamily: "'Instrument Serif', serif",
        fontSize: size * 0.42,
        color: INK,
        letterSpacing: '-0.03em',
        textShadow: '0 1px 2px rgba(0,0,0,0.5)',
      }}>
        {initials}
      </span>
      {player.is_dealer && (
        <div style={{
          position: 'absolute', bottom: -4, right: -4,
          width: 20, height: 20, borderRadius: '50%',
          background: '#f4f1e8',
          border: '2px solid #1a1a1f',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 10, fontWeight: 800, color: '#1a1a1f',
          fontFamily: "'General Sans', sans-serif",
        }}>
          D
        </div>
      )}
    </div>
  );
}

// ── EmptyCardSlot — for coach manual dealing ─────────────────────────────────
function EmptyCardSlot({ onClick, isCoach }) {
  return (
    <div
      style={{
        width: 48, height: 68, borderRadius: 7, flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        border: '1.5px dashed rgba(201,163,93,0.22)',
        background: 'rgba(0,0,0,0.25)',
        cursor: isCoach ? 'pointer' : 'default',
      }}
      onClick={onClick}
    >
      {isCoach && (
        <span style={{ color: 'rgba(201,163,93,0.45)', fontSize: 14 }}>+</span>
      )}
    </div>
  );
}

// ── Main component ──────────────────────────────────────────────────────────
function PlayerSeat({
  player,
  isCurrentTurn = false,
  isMe = false,
  isCoach = false,
  style = {},
  onHoleCardClick,
  showdownResult = null,
  isWinner = false,
  bbView = false,
  bigBlind = 10,
  sessionId = null,
  actionTimer = null,
  equity = null,
  equityVisible = false,
  tableMode = null,
  onBotRemove = null,
}) {
  if (!player) return null;

  // ── Stats hover card ──────────────────────────────────────────────────────
  const [isHovered, setIsHovered] = useState(false);
  const [stats, setStats] = useState(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const fetchedRef = useRef(false);

  const isCoachSeat = player.stableId && String(player.stableId).startsWith('coach_');

  function handleMouseEnter() {
    setIsHovered(true);
    const sid = player.stableId;
    if (!sid || isCoachSeat || fetchedRef.current) return;
    setStatsLoading(true);
    const params = sessionId ? `?sessionId=${encodeURIComponent(sessionId)}` : '';
    apiFetch(`/api/players/${encodeURIComponent(sid)}/hover-stats${params}`)
      .then(data => { fetchedRef.current = true; setStats(data); setStatsLoading(false); })
      .catch(() => { setStatsLoading(false); });
  }
  function handleMouseLeave() { setIsHovered(false); }

  const isFolded = player.action === 'fold' || player.action === 'folded';
  const isDisconnected = player.disconnected === true;
  const isShowdown = showdownResult != null;
  const playerHandEntry = isShowdown
    ? (showdownResult.allHands ?? []).find(h => h.playerId === player.id) ?? null
    : null;

  const actionKey = player.action?.toLowerCase?.();
  const actionStyle = actionKey ? ACTION_STYLES[actionKey] : null;

  const showCards = isCoach || isMe || (isShowdown && !isFolded);
  const holeCards = player.hole_cards ?? [];

  function handleCardClick(position) {
    if (onHoleCardClick) onHoleCardClick(position);
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
    if (card === 'HIDDEN') {
      return <Card key={position} card={card} hidden={true} />;
    }
    if (showCards) {
      return (
        <Card
          key={position}
          card={card}
          hidden={false}
          onClick={isCoach ? () => handleCardClick(position) : undefined}
        />
      );
    }
    return <Card key={position} card={card} hidden={true} />;
  }

  return (
    <div
      style={{
        position: 'absolute',
        width: 148,
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        gap: 4,
        userSelect: 'none',
        opacity: isFolded ? 0.38 : isDisconnected ? 0.55 : 1,
        transition: 'opacity 300ms',
        ...style,
      }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* Avatar — sits at top, overlaps the card */}
      <div style={{ position: 'relative', zIndex: 2, marginBottom: -26 }}>
        <ActionTimerRing timer={actionTimer} playerId={player.id} size={64} />
        <AvatarDisc player={player} isCurrentTurn={isCurrentTurn} isWinner={isWinner} size={58} />
      </div>

      {/* Blind chip — floats to top-right of avatar */}
      {(player.is_small_blind || player.is_big_blind || player.is_all_in) && (
        <div style={{
          position: 'absolute', top: 2, right: 14, zIndex: 3,
          display: 'flex', gap: 2,
        }}>
          {player.is_small_blind && <BlindBadge label="SB" />}
          {player.is_big_blind && <BlindBadge label="BB" tone="strong" />}
          {player.is_all_in && <BlindBadge label="ALL-IN" tone="purple" />}
        </div>
      )}

      {/* Seat card */}
      <div style={{
        position: 'relative',
        width: '100%',
        paddingTop: 30,
        paddingBottom: 10,
        paddingLeft: 10, paddingRight: 10,
        borderRadius: 12,
        background: isCurrentTurn ? CARD_BG_ACTIVE : CARD_BG,
        border: isWinner
          ? `1px solid ${ACCENT}`
          : isCurrentTurn
          ? `1px solid ${ACCENT_DIM}`
          : '1px solid rgba(255,255,255,0.06)',
        boxShadow: isWinner
          ? `0 0 0 1px ${ACCENT}, 0 0 24px rgba(201,163,93,0.4)`
          : isCurrentTurn
          ? `0 0 0 1px ${ACCENT_FAINT}, 0 8px 28px rgba(201,163,93,0.12), inset 0 1px 0 rgba(255,255,255,0.04)`
          : '0 8px 20px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.04)',
        backdropFilter: 'blur(8px)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
      }}>

        {/* Bot remove button */}
        {tableMode === 'bot_cash' && player.is_bot === true && onBotRemove && (
          <button
            data-testid="bot-remove-btn"
            onClick={(e) => { e.stopPropagation(); onBotRemove(player.stableId); }}
            title="Remove bot"
            style={{
              position: 'absolute', top: 4, right: 4,
              width: 16, height: 16, borderRadius: '50%',
              background: 'rgba(248,81,73,0.2)',
              border: '1px solid rgba(248,81,73,0.5)',
              color: '#f85149', fontSize: 10,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', zIndex: 10, lineHeight: 1, padding: 0,
            }}
          >×</button>
        )}

        {/* Name */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
          width: '100%', marginTop: 4,
        }}>
          <span style={{
            fontFamily: "'General Sans', 'Inter', sans-serif",
            fontSize: 12, fontWeight: 600,
            color: INK,
            letterSpacing: '0.02em',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            maxWidth: 110,
          }} title={player.name}>
            {player.name}
          </span>
          {isDisconnected ? (
            <span style={{
              fontSize: 8, fontWeight: 700, letterSpacing: '0.2em',
              color: '#f59e0b', background: 'rgba(245,158,11,0.15)',
              border: '1px solid rgba(245,158,11,0.4)',
              padding: '1px 4px', borderRadius: 3,
            }}>OFFLINE</span>
          ) : isMe ? (
            <span style={{
              fontSize: 8, fontWeight: 700, letterSpacing: '0.22em',
              color: ACCENT,
            }}>YOU</span>
          ) : null}
        </div>

        {/* Stack — big mono number + BB subline */}
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0,
          lineHeight: 1,
        }}>
          <span style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 16, fontWeight: 700,
            color: ACCENT,
            letterSpacing: '-0.02em',
            textShadow: isCurrentTurn ? `0 0 8px rgba(201,163,93,0.4)` : 'none',
          }}>
            {fmtChips(player.stack ?? 0, bigBlind, bbView)}
          </span>
          {!bbView && bigBlind > 0 && (player.stack ?? 0) > 0 && (
            <span style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 9,
              color: INK_DIM,
              marginTop: 2,
            }}>
              {(player.stack / bigBlind).toFixed(1)} BB
            </span>
          )}
        </div>

        {/* Hole cards */}
        <div style={{ display: 'flex', gap: 5, marginTop: 2 }}>
          {renderCardSlot(0)}
          {renderCardSlot(1)}
        </div>

        {/* Hand rank badge */}
        {playerHandEntry && !isFolded && (
          <div
            title={playerHandEntry.handResult?.description ?? ''}
            style={{
              width: '100%',
              padding: '2px 6px',
              borderRadius: 999,
              textAlign: 'center',
              background: 'rgba(26,35,50,0.85)',
              border: `1px solid ${isWinner ? ACCENT : 'rgba(255,255,255,0.08)'}`,
              color: isWinner ? ACCENT : INK,
              fontFamily: "'General Sans', sans-serif",
              fontSize: 10, fontWeight: 600,
              letterSpacing: '0.02em',
              lineHeight: 1.3,
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>
            {playerHandEntry.handResult?.description ?? ''}
          </div>
        )}
      </div>

      {/* Equity badge */}
      <EquityBadge equity={equity} visible={equityVisible} />

      {/* Action pill — floats below seat card */}
      {actionStyle && (
        <div style={{
          marginTop: 4,
          padding: '3px 10px',
          borderRadius: 999,
          fontFamily: "'General Sans', sans-serif",
          fontSize: 10, fontWeight: 700,
          letterSpacing: '0.22em',
          background: actionStyle.bg,
          border: `1px solid ${actionStyle.bd}`,
          color: actionStyle.fg,
          lineHeight: 1,
        }}>
          {actionStyle.label}
        </div>
      )}

      {/* Current street bet chip */}
      <BetChip amount={player.total_bet_this_round} bigBlind={bigBlind} bbView={bbView} />

      {/* Stats hover tooltip — preserves shape/keys from original */}
      {isHovered && !isCoachSeat && player.stableId && (
        <div style={{
          position: 'absolute',
          bottom: '115%',
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 200,
          pointerEvents: 'none',
          background: '#14181f',
          border: '1px solid rgba(201,163,93,0.25)',
          borderRadius: 10,
          padding: '11px 13px',
          minWidth: 218,
          boxShadow: '0 12px 36px rgba(0,0,0,0.8)',
          fontSize: 11,
          whiteSpace: 'nowrap',
        }}>
          <div style={{
            fontFamily: "'General Sans', sans-serif",
            color: INK, fontWeight: 700, marginBottom: 8, fontSize: 12,
          }}>
            {player.name}
          </div>

          {statsLoading && <div style={{ color: INK_DIM, fontSize: 10 }}>Loading…</div>}

          {stats && (() => {
            const STAT_ROWS = [
              { label: 'VPIP',    sessKey: 'vpip_count',      allKey: 'vpip_count',      sessDen: 'hands_played', allDen: 'total_hands' },
              { label: 'PFR',     sessKey: 'pfr_count',       allKey: 'pfr_count',       sessDen: 'hands_played', allDen: 'total_hands' },
              { label: 'WTSD',    sessKey: 'wtsd_count',      allKey: 'wtsd_count',      sessDen: 'hands_played', allDen: 'total_hands' },
              { label: 'WSD',     sessKey: 'wsd_count',       allKey: 'wsd_count',       sessDen: 'wtsd_count',   allDen: 'wtsd_count'  },
              { label: '3-bet %', sessKey: 'three_bet_count', allKey: 'three_bet_count', sessDen: 'hands_played', allDen: 'total_hands' },
            ];
            const fmt = (c, d) => d > 0 ? `${Math.round(c / d * 100)}%` : '—';
            const s = stats.session;
            const a = stats.allTime;
            const allTimeWinning = Math.max(0, a?.net_chips ?? 0);
            return (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: '76px 56px 56px', rowGap: 4 }}>
                  <div />
                  {sessionId && <div style={{ color: INK_DIM, fontSize: 9, letterSpacing: '0.12em', textAlign: 'right', fontWeight: 700, textTransform: 'uppercase' }}>Session</div>}
                  <div style={{ color: INK_DIM, fontSize: 9, letterSpacing: '0.12em', textAlign: 'right', fontWeight: 700, textTransform: 'uppercase', gridColumn: sessionId ? 'auto' : '2 / span 2' }}>All-time</div>
                  {STAT_ROWS.map(({ label, sessKey, allKey, sessDen, allDen }) => (
                    <React.Fragment key={label}>
                      <div style={{ color: ACCENT, fontWeight: 600 }}>{label}</div>
                      {sessionId && (
                        <div style={{ color: INK, textAlign: 'right', fontFamily: "'JetBrains Mono', monospace" }}>
                          {s ? fmt(s[sessKey] ?? 0, s[sessDen] ?? 0) : '—'}
                        </div>
                      )}
                      <div style={{ color: INK, textAlign: 'right', fontFamily: "'JetBrains Mono', monospace" }}>
                        {a ? fmt(a[allKey] ?? 0, a[allDen] ?? 0) : '—'}
                      </div>
                    </React.Fragment>
                  ))}
                </div>
                <div style={{
                  marginTop: 9, borderTop: '1px solid rgba(255,255,255,0.08)',
                  paddingTop: 7, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
                }}>
                  <span style={{ color: INK_DIM, fontWeight: 600 }}>Alltime Winning</span>
                  <span style={{
                    fontFamily: "'JetBrains Mono', monospace", fontWeight: 700,
                    color: allTimeWinning > 0 ? '#3fb950' : INK_DIM,
                  }}>{allTimeWinning.toLocaleString()}</span>
                </div>
                {(a?.total_hands ?? 0) > 0 && (
                  <div style={{ color: INK_DIM, fontSize: 10, marginTop: 3 }}>
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

function BlindBadge({ label, tone = 'default' }) {
  const palette = tone === 'purple'
    ? { bg: 'rgba(88,28,135,0.7)', fg: '#d8b4fe', bd: 'rgba(147,51,234,0.55)' }
    : tone === 'strong'
    ? { bg: 'rgba(161,98,7,0.7)', fg: '#fbbf24', bd: 'rgba(217,119,6,0.6)' }
    : { bg: 'rgba(133,77,14,0.65)', fg: '#facc15', bd: 'rgba(202,138,4,0.5)' };
  return (
    <span style={{
      padding: '1px 5px',
      borderRadius: 3,
      fontFamily: "'General Sans', sans-serif",
      fontSize: 8, fontWeight: 800,
      letterSpacing: '0.15em',
      color: palette.fg,
      background: palette.bg,
      border: `1px solid ${palette.bd}`,
      lineHeight: 1,
    }}>{label}</span>
  );
}

;window.P1_PlayerSeat = PlayerSeat;
