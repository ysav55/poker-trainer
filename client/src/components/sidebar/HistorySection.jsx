import React, { useEffect, useRef } from 'react';
import CollapsibleSection from '../CollapsibleSection';

const ACTION_COLORS = {
  fold:   { bg: '#2d1a1a', text: '#f85149' },
  call:   { bg: '#1e3a2a', text: '#3fb950' },
  raise:  { bg: '#2d2516', text: '#e3b341' },
  check:  { bg: '#1c2d3f', text: '#58a6ff' },
  bet:    { bg: '#2d2516', text: '#e3b341' },
  allin:  { bg: '#2b1f3a', text: '#bc8cff' },
};

function parseBoardCards(boardStr) {
  if (!boardStr) return [];
  if (Array.isArray(boardStr)) return boardStr;
  try {
    return JSON.parse(boardStr);
  } catch {
    return [];
  }
}

const SUIT_SYMBOLS = { s: '♠', h: '♥', d: '♦', c: '♣' };

function CardCode({ card }) {
  if (!card) return null;
  const rank = card.slice(0, -1);
  const suit = card.slice(-1).toLowerCase();
  const suitChar = SUIT_SYMBOLS[suit] || suit;
  const isRed = suit === 'h' || suit === 'd';
  return (
    <span
      style={{
        fontSize: '10px',
        fontFamily: 'monospace',
        color: isRed ? '#f85149' : '#58a6ff',
        letterSpacing: '-0.02em',
      }}
    >
      {rank}{suitChar}
    </span>
  );
}

function PhasedEndedTag({ phase }) {
  if (!phase) return null;
  const normalized = String(phase).toLowerCase();
  let label, color;
  if (normalized === 'showdown') {
    label = 'SHOWDOWN';
    color = '#bc8cff';
  } else if (normalized.startsWith('fold')) {
    label = 'FOLD';
    color = '#3fb950';
  } else {
    label = 'INCOMPLETE';
    color = '#f85149';
  }
  return (
    <span
      style={{
        fontSize: '8px',
        fontWeight: 700,
        letterSpacing: '0.08em',
        color,
        background: `${color}18`,
        border: `1px solid ${color}44`,
        borderRadius: '3px',
        padding: '1px 4px',
        flexShrink: 0,
      }}
    >
      {label}
    </span>
  );
}

function HandHistoryRow({ hand, index, onExpand, onReplay }) {
  const isComplete = hand.completed_normally === 1;
  const winnerDisplay = isComplete ? (hand.winner_name || '—') : 'Incomplete';
  const board = parseBoardCards(hand.board);

  return (
    <div
      className="rounded px-2 py-1.5 flex flex-col gap-1"
      style={{
        background: '#0d1117',
        border: '1px solid #21262d',
        transition: 'background 0.1s',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = '#0d1117'; }}
    >
      {/* Top row: index, winner, phase tag, pot, replay, expand */}
      <div className="flex items-center gap-1.5">
        <span
          style={{
            fontSize: '9px',
            color: '#6e7681',
            fontFamily: 'monospace',
            flexShrink: 0,
            minWidth: '16px',
          }}
        >
          #{index}
        </span>
        <span
          className="truncate flex-1 text-xs"
          style={{ color: '#f0ece3', fontSize: '10px' }}
        >
          {winnerDisplay}
        </span>
        <PhasedEndedTag phase={isComplete ? hand.phase_ended : null} />
        <span
          style={{
            fontSize: '10px',
            color: '#e3b341',
            fontFamily: 'monospace',
            fontWeight: 600,
            flexShrink: 0,
          }}
        >
          ${Number(hand.final_pot || 0).toLocaleString()}
        </span>
        {onReplay && (
          <button
            onClick={() => onReplay(hand.hand_id)}
            title="Load instant replay"
            style={{
              background: 'rgba(139,92,246,0.15)',
              border: '1px solid rgba(139,92,246,0.4)',
              borderRadius: '3px',
              cursor: 'pointer',
              padding: '1px 5px',
              color: '#a78bfa',
              fontSize: '10px',
              flexShrink: 0,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(139,92,246,0.3)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(139,92,246,0.15)'; }}
          >
            ↺
          </button>
        )}
        <button
          onClick={onExpand}
          title="View detail"
          style={{
            background: 'none',
            border: '1px solid #30363d',
            borderRadius: '3px',
            cursor: 'pointer',
            padding: '1px 5px',
            color: '#6e7681',
            fontSize: '10px',
            flexShrink: 0,
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = '#d4af37'; e.currentTarget.style.borderColor = '#d4af37'; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = '#6e7681'; e.currentTarget.style.borderColor = '#30363d'; }}
        >
          &gt;
        </button>
      </div>

      {/* Board row */}
      {board.length > 0 && (
        <div className="flex gap-1 flex-wrap">
          {board.map((c, i) => (
            <CardCode key={i} card={c} />
          ))}
        </div>
      )}
    </div>
  );
}

function HandDetailPanel({ detail, onClose }) {
  const board = parseBoardCards(detail.board);
  const players = detail.players || [];
  const actions = detail.actions || [];

  return (
    <div
      className="rounded p-2 mb-2"
      style={{ background: '#0d1117', border: '1px solid #30363d' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold" style={{ color: '#d4af37', letterSpacing: '0.1em' }}>
          HAND DETAIL
        </span>
        <button
          onClick={onClose}
          style={{
            background: 'none',
            border: '1px solid #30363d',
            borderRadius: '3px',
            cursor: 'pointer',
            padding: '1px 7px',
            color: '#6e7681',
            fontSize: '10px',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = '#f85149'; e.currentTarget.style.borderColor = '#f85149'; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = '#6e7681'; e.currentTarget.style.borderColor = '#30363d'; }}
        >
          Close
        </button>
      </div>

      {/* Board */}
      {board.length > 0 && (
        <div className="mb-2">
          <div className="text-xs mb-1" style={{ color: '#6e7681', fontSize: '9px', letterSpacing: '0.1em' }}>BOARD</div>
          <div className="flex gap-1.5 flex-wrap">
            {board.map((c, i) => (
              <CardCode key={i} card={c} />
            ))}
          </div>
        </div>
      )}

      {/* Players table */}
      {players.length > 0 && (
        <div className="mb-2">
          <div className="text-xs mb-1" style={{ color: '#6e7681', fontSize: '9px', letterSpacing: '0.1em' }}>PLAYERS</div>
          <div
            style={{
              overflowX: 'auto',
              borderRadius: '4px',
              border: '1px solid #21262d',
            }}
          >
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '9px' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #21262d' }}>
                  {['Name', 'Cards', 'Start', 'End', 'W/L'].map((h) => (
                    <th
                      key={h}
                      style={{
                        padding: '3px 5px',
                        color: '#6e7681',
                        fontWeight: 600,
                        textAlign: 'left',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {players.map((p, i) => {
                  const holeCards = parseBoardCards(p.hole_cards);
                  const net = (p.stack_end || 0) - (p.stack_start || 0);
                  const isWinner = net > 0;
                  return (
                    <tr
                      key={i}
                      style={{ borderBottom: '1px solid #21262d' }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                    >
                      <td style={{ padding: '3px 5px', color: '#f0ece3', whiteSpace: 'nowrap', maxWidth: '70px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {p.player_name || p.name || '—'}
                      </td>
                      <td style={{ padding: '3px 5px', whiteSpace: 'nowrap' }}>
                        {holeCards.length > 0
                          ? holeCards.map((c, ci) => <CardCode key={ci} card={c} />)
                          : <span style={{ color: '#444' }}>—</span>
                        }
                      </td>
                      <td style={{ padding: '3px 5px', color: '#8b949e', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
                        ${Number(p.stack_start || 0).toLocaleString()}
                      </td>
                      <td style={{ padding: '3px 5px', color: '#8b949e', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
                        ${Number(p.stack_end || 0).toLocaleString()}
                      </td>
                      <td style={{ padding: '3px 5px', whiteSpace: 'nowrap' }}>
                        <span style={{ color: isWinner ? '#3fb950' : net < 0 ? '#f85149' : '#6e7681', fontFamily: 'monospace', fontWeight: 600 }}>
                          {net > 0 ? '+' : ''}{net}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Action log */}
      {actions.length > 0 && (
        <div>
          <div className="text-xs mb-1" style={{ color: '#6e7681', fontSize: '9px', letterSpacing: '0.1em' }}>ACTIONS</div>
          <div
            style={{
              maxHeight: '140px',
              overflowY: 'auto',
              borderRadius: '4px',
              border: '1px solid #21262d',
            }}
          >
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '9px' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #21262d' }}>
                  {['Street', 'Player', 'Action', 'Amt'].map((h) => (
                    <th
                      key={h}
                      style={{
                        padding: '3px 5px',
                        color: '#6e7681',
                        fontWeight: 600,
                        textAlign: 'left',
                        whiteSpace: 'nowrap',
                        position: 'sticky',
                        top: 0,
                        background: '#0d1117',
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {actions.map((a, i) => {
                  const actionKey = String(a.action || '').toLowerCase();
                  const actionColors = ACTION_COLORS[actionKey] || { bg: '#21262d', text: '#8b949e' };
                  return (
                    <tr
                      key={i}
                      style={{ borderBottom: '1px solid #21262d' }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                    >
                      <td style={{ padding: '3px 5px', color: '#6e7681', whiteSpace: 'nowrap', textTransform: 'uppercase', fontSize: '8px' }}>
                        {a.street || '—'}
                      </td>
                      <td style={{ padding: '3px 5px', color: '#f0ece3', whiteSpace: 'nowrap', maxWidth: '60px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {a.player_name || a.player || '—'}
                      </td>
                      <td style={{ padding: '3px 5px' }}>
                        <span
                          style={{
                            fontSize: '8px',
                            fontWeight: 700,
                            color: actionColors.text,
                            background: actionColors.bg,
                            borderRadius: '2px',
                            padding: '1px 3px',
                            textTransform: 'uppercase',
                            letterSpacing: '0.05em',
                          }}
                        >
                          {a.action || '—'}
                        </span>
                      </td>
                      <td style={{ padding: '3px 5px', color: '#e3b341', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
                        {a.amount ? `$${Number(a.amount).toLocaleString()}` : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

export default function HistorySection({ phase, emit, hands, historyLoading, handDetail, fetchHands, fetchHandDetail, clearDetail }) {
  // Auto-fetch hands when phase transitions to 'waiting' (after a hand ends)
  const prevPhaseRef = useRef(phase);
  useEffect(() => {
    if (prevPhaseRef.current !== 'WAITING' && phase === 'WAITING') {
      fetchHands();
    }
    prevPhaseRef.current = phase;
  }, [phase, fetchHands]);

  return (
    <CollapsibleSection
      title="HISTORY"
      defaultOpen={false}
      onToggle={(isOpen) => { if (isOpen) fetchHands(); }}
      headerExtra={
        <button
          onClick={(e) => { e.stopPropagation(); fetchHands(); }}
          title="Refresh history"
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px', color: '#6e7681', flexShrink: 0 }}
          onMouseEnter={(e) => { e.currentTarget.style.color = '#d4af37'; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = '#6e7681'; }}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M1.5 6a4.5 4.5 0 1 1 1.3 3.2M1.5 9.5V6.5h3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      }
    >
      {/* Detail panel */}
      {handDetail && (
        <HandDetailPanel detail={handDetail} onClose={clearDetail} />
      )}

      {!handDetail && (
        <>
          {historyLoading && (
            <div className="text-xs text-center py-3" style={{ color: '#6e7681' }}>Loading…</div>
          )}
          {!historyLoading && hands.length === 0 && (
            <div className="text-xs text-center py-3" style={{ color: '#444' }}>No completed hands yet</div>
          )}
          {!historyLoading && hands.length > 0 && (
            <div className="flex flex-col gap-1">
              {hands.map((hand, idx) => (
                <HandHistoryRow
                  key={hand.hand_id}
                  hand={hand}
                  index={idx + 1}
                  onExpand={() => fetchHandDetail(hand.hand_id)}
                  onReplay={emit.loadReplay}
                />
              ))}
            </div>
          )}
        </>
      )}
    </CollapsibleSection>
  );
}
