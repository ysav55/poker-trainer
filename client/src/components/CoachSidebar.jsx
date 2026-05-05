import React, { useState } from 'react';
import { useHistory } from '../hooks/useHistory';
import GameControlsSection from './sidebar/GameControlsSection';
import BlindLevelsSection from './sidebar/BlindLevelsSection';
import UndoControlsSection from './sidebar/UndoControlsSection';
import AdjustStacksSection from './sidebar/AdjustStacksSection';
import PlayersSection from './sidebar/PlayersSection';
import PlaylistsSection from './sidebar/PlaylistsSection';
import ScenarioLaunchPanel from './sidebar/ScenarioLaunchPanel';
import HandLibrarySection from './sidebar/HandLibrarySection';
import HistorySection from './sidebar/HistorySection';
import ReplayControlsSection from './sidebar/ReplayControlsSection';

// ─── Constants ────────────────────────────────────────────────────────────────

const PHASE_COLORS = {
  WAITING:   { bg: '#21262d', text: '#6e7681' },
  PREFLOP:   { bg: '#1c2d3f', text: '#58a6ff' },
  FLOP:      { bg: '#1e3a2a', text: '#3fb950' },
  TURN:      { bg: '#2d2516', text: '#e3b341' },
  RIVER:     { bg: '#2d1a1a', text: '#f85149' },
  SHOWDOWN:  { bg: '#2b1f3a', text: '#bc8cff' },
};

const TABS = ['GAME', 'HANDS', 'PLAYLISTS'];

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
  drill = null,
  actionTimer = null,
  activeHandId = null,
  handTagsSaved = null,
  setBlindLevels = null,
  myId = null,
  onOpenScenarioBuilder = null,
  equityEnabled = false,
  setEquityEnabled = null,
  equitySettings = null,
  // replay props
  replayMeta = null,
  loadReplay = null,
  replayStepForward = null,
  replayStepBack = null,
  replayJumpTo = null,
  replayBranch = null,
  replayUnbranch = null,
  replayExit = null,
}) {
  // History hook — called once; results shared with HandLibrarySection and HistorySection
  const { hands, loading: historyLoading, handDetail, fetchHands, fetchHandDetail, clearDetail } = useHistory();

  // Active tab state
  const [activeTab, setActiveTab] = useState('GAME');

  // Track the last hand loaded as a scenario (so we can offer "Save to Playlist")
  const [lastLoadedHandId, setLastLoadedHandId] = useState(null);
  const [saveToPlaylistId, setSaveToPlaylistId] = useState('');

  // Intercept loadHandScenario to record the loaded hand
  const augmentedEmit = {
    ...emit,
    loadHandScenario: (handId, stackMode) => {
      setLastLoadedHandId(handId);
      emit.loadHandScenario?.(handId, stackMode);
    },
  };

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
      style={{ width: '20rem' }}
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
        {/* ── Sticky info strip (non-scrolling, 48px) ────────────────────── */}
        <div
          className="flex items-center justify-between px-3 flex-shrink-0"
          style={{
            height: '48px',
            borderBottom: '1px solid #30363d',
            background: '#0d1117',
          }}
        >
          <div className="flex items-center gap-2">
            <span
              className="text-xs font-bold tracking-[0.2em]"
              style={{ color: '#d4af37' }}
            >
              COACH
            </span>
            <span style={{ color: '#30363d', fontSize: '11px' }}>/</span>
            <PhaseBadge phase={phase} />
          </div>
          <div className="flex items-center gap-3">
            {pot > 0 && (
              <span
                className="font-mono text-xs font-semibold"
                style={{ color: '#e3b341' }}
              >
                ${Number(pot).toLocaleString()}
              </span>
            )}
            <div className="text-xs font-mono" style={{ color: '#444' }}>
              {is_paused ? (
                <span style={{ color: '#e3b341' }}>⏸ PAUSED</span>
              ) : phase !== 'WAITING' ? (
                <span style={{ color: '#3fb950' }}>● LIVE</span>
              ) : null}
            </div>
          </div>
        </div>

        {/* ── Tab bar ────────────────────────────────────────────────────── */}
        <div
          className="flex flex-shrink-0"
          style={{
            background: '#0d1117',
            borderBottom: '1px solid #30363d',
            height: '40px',
          }}
        >
          {TABS.map((tab) => {
            const isActive = activeTab === tab;
            return (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                style={{
                  flex: 1,
                  height: '100%',
                  background: 'none',
                  border: 'none',
                  borderBottom: isActive ? '2px solid #d4af37' : '2px solid transparent',
                  cursor: 'pointer',
                  fontSize: '11px',
                  fontWeight: 700,
                  letterSpacing: '0.12em',
                  color: isActive ? '#d4af37' : '#6e7681',
                  transition: 'color 0.15s, border-color 0.15s',
                  padding: '0 4px',
                }}
                onMouseEnter={(e) => {
                  if (!isActive) e.currentTarget.style.color = '#a08030';
                }}
                onMouseLeave={(e) => {
                  if (!isActive) e.currentTarget.style.color = '#6e7681';
                }}
              >
                {tab}
              </button>
            );
          })}
        </div>

        {/* ── Scrollable tab content ──────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto" style={{ padding: '12px 12px 20px' }}>

          {/* ── GAME tab ─────────────────────────────────────────────────── */}
          {activeTab === 'GAME' && (
            <>
              {/* Replay controls — shown at top when replay mode is active */}
              {(gameState?.phase === 'replay' || gameState?.replay_mode?.active) && replayExit && (
                <ReplayControlsSection
                  gameState={gameState}
                  replayMeta={replayMeta}
                  isCoach
                  onStepForward={replayStepForward}
                  onStepBack={replayStepBack}
                  onJumpTo={replayJumpTo}
                  onBranch={replayBranch}
                  onUnbranch={replayUnbranch}
                  onExit={replayExit}
                />
              )}

              <GameControlsSection
                gameState={gameState}
                emit={emit}
                is_paused={is_paused}
                phase={phase}
                equityEnabled={equityEnabled}
                setEquityEnabled={setEquityEnabled}
                showToPlayers={equitySettings?.showToPlayers ?? false}
              />

              {setBlindLevels && (
                <BlindLevelsSection
                  gameState={gameState}
                  setBlindLevels={setBlindLevels}
                />
              )}

              <UndoControlsSection
                emit={emit}
                can_undo={can_undo}
                can_rollback_street={can_rollback_street}
              />

              <AdjustStacksSection
                emit={emit}
                seatedPlayers={seatedPlayers}
              />

              <PlayersSection
                seatedPlayers={seatedPlayers}
                phase={phase}
                emit={emit}
              />
            </>
          )}

          {/* ── HANDS tab ────────────────────────────────────────────────── */}
          {activeTab === 'HANDS' && (
            <>
              <HandLibrarySection
                hands={hands}
                emit={augmentedEmit}
                playlists={playlists}
              />

              <HistorySection
                phase={phase}
                emit={augmentedEmit}
                hands={hands}
                historyLoading={historyLoading}
                handDetail={handDetail}
                fetchHands={fetchHands}
                fetchHandDetail={fetchHandDetail}
                clearDetail={clearDetail}
                onLoadReplay={loadReplay}
              />

              {/* Save loaded scenario to playlist */}
              {lastLoadedHandId && config_phase && playlists.length > 0 && (
                <div
                  style={{
                    marginTop: 12,
                    padding: '10px 10px 10px',
                    borderRadius: 6,
                    border: '1px solid rgba(212,175,55,0.3)',
                    background: 'rgba(212,175,55,0.05)',
                  }}
                >
                  <p style={{ fontSize: 10, color: '#d4af37', fontWeight: 700, letterSpacing: '0.08em', marginBottom: 6 }}>
                    SAVE SCENARIO TO PLAYLIST
                  </p>
                  <div className="flex gap-1">
                    <select
                      value={saveToPlaylistId}
                      onChange={e => setSaveToPlaylistId(e.target.value)}
                      className="flex-1 min-w-0 rounded outline-none"
                      style={{ background: '#161b22', border: '1px solid #30363d', padding: '3px 6px', fontSize: '10px', color: '#c9c3b8' }}
                    >
                      <option value="">— select playlist —</option>
                      {playlists.map(pl => (
                        <option key={pl.playlist_id} value={pl.playlist_id}>{pl.name}</option>
                      ))}
                    </select>
                    <button
                      onClick={() => {
                        if (saveToPlaylistId) {
                          augmentedEmit.addToPlaylist?.(saveToPlaylistId, lastLoadedHandId);
                          setSaveToPlaylistId('');
                          setLastLoadedHandId(null);
                        }
                      }}
                      disabled={!saveToPlaylistId}
                      style={{
                        padding: '3px 10px',
                        fontSize: '10px',
                        fontWeight: 700,
                        borderRadius: 4,
                        border: '1px solid rgba(212,175,55,0.4)',
                        background: saveToPlaylistId ? 'rgba(212,175,55,0.15)' : 'transparent',
                        color: saveToPlaylistId ? '#d4af37' : '#6e7681',
                        cursor: saveToPlaylistId ? 'pointer' : 'not-allowed',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      + Add
                    </button>
                  </div>
                </div>
              )}

              {/* + Build Scenario button */}
              <button
                onClick={() => {
                  if (onOpenScenarioBuilder) {
                    onOpenScenarioBuilder();
                  } else {
                    console.log('open scenario builder');
                  }
                }}
                style={{
                  marginTop: '12px',
                  width: '100%',
                  padding: '10px',
                  fontSize: '12px',
                  fontWeight: 700,
                  letterSpacing: '0.08em',
                  border: '1px solid rgba(212,175,55,0.4)',
                  background: 'rgba(212,175,55,0.06)',
                  color: '#d4af37',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  transition: 'background 0.15s, border-color 0.15s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(212,175,55,0.12)';
                  e.currentTarget.style.borderColor = 'rgba(212,175,55,0.65)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'rgba(212,175,55,0.06)';
                  e.currentTarget.style.borderColor = 'rgba(212,175,55,0.4)';
                }}
              >
                + Build Scenario
              </button>
            </>
          )}

          {/* ── PLAYLISTS tab ─────────────────────────────────────────────── */}
          {activeTab === 'PLAYLISTS' && (
            drill ? (
              <ScenarioLaunchPanel
                playlists={playlists}
                activePlayers={(gameState?.players || []).filter(p => !p.is_coach && p.seat >= 0)}
                drill={drill}
              />
            ) : (
              <PlaylistsSection
                playlists={playlists}
                gameState={gameState}
                myId={myId}
                emit={emit}
              />
            )
          )}

          {/* Bottom spacer */}
          <div style={{ height: '8px' }} />
        </div>
      </div>
    </div>
  );
}
