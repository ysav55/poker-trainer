import React from 'react';
import { useHistory } from '../hooks/useHistory';
import GameControlsSection from './sidebar/GameControlsSection';
import BlindLevelsSection from './sidebar/BlindLevelsSection';
import UndoControlsSection from './sidebar/UndoControlsSection';
import AdjustStacksSection from './sidebar/AdjustStacksSection';
import PlayersSection from './sidebar/PlayersSection';
import PlaylistsSection from './sidebar/PlaylistsSection';
import HandLibrarySection from './sidebar/HandLibrarySection';
import HistorySection from './sidebar/HistorySection';

// ─── Constants ────────────────────────────────────────────────────────────────

const PHASE_COLORS = {
  WAITING:   { bg: '#21262d', text: '#6e7681' },
  PREFLOP:   { bg: '#1c2d3f', text: '#58a6ff' },
  FLOP:      { bg: '#1e3a2a', text: '#3fb950' },
  TURN:      { bg: '#2d2516', text: '#e3b341' },
  RIVER:     { bg: '#2d1a1a', text: '#f85149' },
  SHOWDOWN:  { bg: '#2b1f3a', text: '#bc8cff' },
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function PhaseBadge({ phase }) {
  const colors = PHASE_COLORS[phase?.toUpperCase()] || PHASE_COLORS.WAITING;
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold tracking-wider"
      style={{ background: colors.bg, color: colors.text, border: `1px solid ${colors.text}22` }}
    >
      {phase || 'WAITING'}
    </span>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function CoachSidebar({
  gameState = {},
  emit = {},
  onOpenCardPicker,
  isOpen,
  onToggle,
  sessionStats = null,
  playlists = [],
  actionTimer = null,
  activeHandId = null,
  handTagsSaved = null,
  setBlindLevels = null,
  myId = null,
}) {
  // History hook — called once; results shared with HandLibrarySection and HistorySection
  const { hands, loading: historyLoading, handDetail, fetchHands, fetchHandDetail, clearDetail } = useHistory();

  // Destructure game state with safe defaults
  const {
    phase: _phase = 'waiting',
    pot = 0,
    paused: is_paused = false,
    can_undo = false,
    can_rollback_street = false,
    players = [],
    board = [],
    config_phase = false,
  } = gameState;
  const phase = (_phase ?? 'waiting').toUpperCase();

  const seatedPlayers = players.filter((p) => p && p.seat !== undefined && p.seat !== null);

  // ─── Collapsed tab ────────────────────────────────────────────────────────

  if (!isOpen) {
    return (
      <div
        className="h-full flex items-center flex-shrink-0"
        style={{ pointerEvents: 'none' }}
      >
        <button
          onClick={onToggle}
          className="flex flex-col items-center justify-center gap-1.5 rounded-l-lg transition-all duration-200"
          style={{
            width: '28px',
            height: '100px',
            background: '#161b22',
            border: '1px solid #30363d',
            borderRight: 'none',
            cursor: 'pointer',
            pointerEvents: 'all',
            color: '#d4af37',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = '#1c2330';
            e.currentTarget.style.borderColor = '#d4af37';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = '#161b22';
            e.currentTarget.style.borderColor = '#30363d';
          }}
          title="Open Coach Panel"
          aria-label="Open Coach Panel"
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 12 12"
            fill="none"
            style={{ flexShrink: 0 }}
          >
            <path
              d="M8 2L4 6l4 4"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span
            style={{
              writingMode: 'vertical-rl',
              textOrientation: 'mixed',
              transform: 'rotate(180deg)',
              fontSize: '9px',
              fontWeight: 700,
              letterSpacing: '0.18em',
              color: '#d4af37',
              userSelect: 'none',
            }}
          >
            COACH
          </span>
        </button>
      </div>
    );
  }

  // ─── Open sidebar ─────────────────────────────────────────────────────────

  return (
    <div
      className="h-full flex flex-shrink-0"
      style={{ width: '18rem' }}
    >
      {/* Collapse tab on left edge of open sidebar */}
      <button
        onClick={onToggle}
        className="flex flex-col items-center justify-center gap-1.5 self-center rounded-l-lg transition-all duration-200 flex-shrink-0"
        style={{
          width: '24px',
          height: '80px',
          background: '#161b22',
          border: '1px solid #30363d',
          borderRight: 'none',
          cursor: 'pointer',
          color: '#6e7681',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.color = '#d4af37';
          e.currentTarget.style.borderColor = '#d4af37';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.color = '#6e7681';
          e.currentTarget.style.borderColor = '#30363d';
        }}
        title="Close Coach Panel"
        aria-label="Close Coach Panel"
      >
        <svg
          width="10"
          height="10"
          viewBox="0 0 12 12"
          fill="none"
        >
          <path
            d="M4 2l4 4-4 4"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {/* Main panel */}
      <div
        className="flex flex-col flex-1 overflow-hidden"
        style={{
          background: '#0d1117',
          borderLeft: '1px solid #30363d',
          boxShadow: '-8px 0 40px rgba(0,0,0,0.7)',
        }}
      >
        {/* Panel header */}
        <div
          className="flex items-center justify-between px-4 py-3 flex-shrink-0"
          style={{ borderBottom: '1px solid #30363d' }}
        >
          <div className="flex items-center gap-2">
            <span
              className="text-xs font-bold tracking-[0.2em]"
              style={{ color: '#d4af37' }}
            >
              COACH
            </span>
            <span
              className="text-xs tracking-[0.1em]"
              style={{ color: '#30363d' }}
            >
              /
            </span>
            <PhaseBadge phase={phase} />
          </div>
          <div className="flex items-center gap-2">
            <div
              className="text-xs font-mono"
              style={{ color: '#444' }}
            >
              {is_paused ? (
                <span style={{ color: '#e3b341' }}>⏸ PAUSED</span>
              ) : phase !== 'WAITING' ? (
                <span style={{ color: '#3fb950' }}>● LIVE</span>
              ) : null}
            </div>
          </div>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto" style={{ padding: '12px 12px 20px' }}>

          {/* ── 1: GAME CONTROLS ──────────────────────────────────────────── */}
          <GameControlsSection
            gameState={gameState}
            emit={emit}
            is_paused={is_paused}
            phase={phase}
          />

          {/* ── 2: BLIND LEVELS ───────────────────────────────────────────── */}
          {setBlindLevels && (
            <BlindLevelsSection
              gameState={gameState}
              setBlindLevels={setBlindLevels}
            />
          )}

          {/* ── 5: UNDO CONTROLS ──────────────────────────────────────────── */}
          <UndoControlsSection
            emit={emit}
            can_undo={can_undo}
            can_rollback_street={can_rollback_street}
          />

          {/* ── 6: PLAYERS ────────────────────────────────────────────────── */}
          <PlayersSection
            seatedPlayers={seatedPlayers}
            phase={phase}
            emit={emit}
          />

          {/* ── 8: PLAYLISTS ──────────────────────────────────────────────── */}
          <PlaylistsSection
            playlists={playlists}
            gameState={gameState}
            myId={myId}
            emit={emit}
          />

          {/* ── 9: HAND LIBRARY ───────────────────────────────────────────── */}
          <HandLibrarySection
            hands={hands}
            emit={emit}
            playlists={playlists}
          />

          {/* ── 10: ADJUST STACKS ─────────────────────────────────────────── */}
          <AdjustStacksSection
            emit={emit}
            seatedPlayers={seatedPlayers}
          />

          {/* ── 11: HISTORY ───────────────────────────────────────────────── */}
          <HistorySection
            phase={phase}
            emit={emit}
            hands={hands}
            historyLoading={historyLoading}
            handDetail={handDetail}
            fetchHands={fetchHands}
            fetchHandDetail={fetchHandDetail}
            clearDetail={clearDetail}
          />

          {/* Bottom spacer */}
          <div style={{ height: '8px' }} />
        </div>
      </div>
    </div>
  );
}
