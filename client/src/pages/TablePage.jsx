import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { TableProvider, useTable } from '../contexts/TableContext.jsx';
import { useAuth } from '../contexts/AuthContext.jsx';
import { usePreferences } from '../hooks/usePreferences.js';
import PokerTable from '../components/PokerTable.jsx';
import CoachSidebar from '../components/CoachSidebar.jsx';
import SidebarV3 from '../components/sidebar-v3/Sidebar.jsx';
import { buildLiveData } from '../components/sidebar-v3/buildLiveData.js';
import { useDrillSession } from '../hooks/useDrillSession';
import TournamentInfoPanel from '../components/TournamentInfoPanel.jsx';
import TournamentTopBar from '../components/TournamentTopBar.jsx';
import TournamentSidebar from '../components/TournamentSidebar.jsx';
import ManagedByBadge from '../components/ManagedByBadge.jsx';
import ScenarioBuilder from '../components/ScenarioBuilder.jsx';

// ── Mode badge config ────────────────────────────────────────────────────────
const MODE_BADGE = {
  coached_cash:    { label: 'Coached',    bg: 'rgba(212,175,55,0.15)', color: '#d4af37', border: 'rgba(212,175,55,0.4)' },
  tournament:      { label: 'Tournament', bg: 'rgba(59,130,246,0.15)', color: '#60a5fa', border: 'rgba(59,130,246,0.4)' },
  uncoached_cash:  { label: 'Auto',       bg: 'rgba(34,197,94,0.12)',  color: '#4ade80', border: 'rgba(34,197,94,0.35)' },
};

// ── TableTopBar ──────────────────────────────────────────────────────────────
function TableTopBar({ tableName, tableMode, isSpectator, onBack, isCoach, canReview, onGoToReview }) {
  const badge = MODE_BADGE[tableMode] ?? MODE_BADGE.uncoached_cash;
  return (
    <header
      className="flex items-center justify-between px-4 shrink-0 z-20"
      style={{
        height: 44,
        background: 'rgba(6,10,15,0.97)',
        borderBottom: '1px solid #21262d',
        backdropFilter: 'blur(8px)',
      }}
    >
      {/* Left: back + logo + table name + mode badge */}
      <div className="flex items-center gap-3">
        <button
          onClick={onBack}
          className="text-xs px-2 py-1 rounded transition-colors"
          style={{ color: '#8b949e', border: '1px solid #30363d' }}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#6e7681'; e.currentTarget.style.color = '#e6edf3'; }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#30363d'; e.currentTarget.style.color = '#8b949e'; }}
        >
          ← Lobby
        </button>
        <span className="text-sm font-bold tracking-wide" style={{ color: '#d4af37' }} data-sb-v3-logo>
          ♠ POKER TRAINER
        </span>
        {tableName && (
          <>
            <span style={{ color: '#30363d' }}>·</span>
            <span className="text-sm font-medium truncate max-w-[180px]" style={{ color: '#e6edf3' }}>
              {tableName}
            </span>
          </>
        )}
        <span
          className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-widest"
          style={{ background: badge.bg, color: badge.color, border: `1px solid ${badge.border}` }}
          data-sb-v3-mode-badge
        >
          {badge.label}
        </span>
        {isSpectator && (
          <span
            className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-widest"
            style={{
              background: 'rgba(100,116,139,0.15)',
              color: '#94a3b8',
              border: '1px solid rgba(100,116,139,0.4)',
            }}
          >
            Spectating
          </span>
        )}
      </div>

      {/* Right: coach-only "Go to Review" button */}
      {isCoach && (
        <button
          onClick={onGoToReview}
          disabled={!canReview}
          className="text-xs px-3 py-1 rounded transition-colors"
          style={{
            color: canReview ? '#60a5fa' : '#2d333b',
            border: `1px solid ${canReview ? 'rgba(96,165,250,0.4)' : '#21262d'}`,
            background: 'transparent',
            cursor: canReview ? 'pointer' : 'default',
          }}
          title={canReview ? 'Transition all players to hand review' : 'Only available between hands'}
          onMouseEnter={(e) => { if (canReview) { e.currentTarget.style.background = 'rgba(96,165,250,0.1)'; e.currentTarget.style.borderColor = '#60a5fa'; } }}
          onMouseLeave={(e) => { if (canReview) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'rgba(96,165,250,0.4)'; } }}
        >
          ▶ Go to Review
        </button>
      )}
    </header>
  );
}

export default function TablePage() {
  const { tableId } = useParams();
  const [searchParams] = useSearchParams();
  const managerMode = searchParams.get('manager') === 'true';
  return (
    <TableProvider tableId={tableId} managerMode={managerMode}>
      <FullTableView />
    </TableProvider>
  );
}

function FullTableView() {
  const { gameState: hookState, socket, tableId, playlist, replay } = useTable();
  const drill = useDrillSession({ socket: socket?.socket, tableId });
  const { user } = useAuth();
  const { bbView } = usePreferences();
  const [searchParamsFTV] = useSearchParams();
  const useSidebarV3 = searchParamsFTV.get('sidebarV3') === '1';

  // Destructure hook return — hookState is the full useGameState() return value
  const {
    gameState,          // raw game state object
    isCoach: hookIsCoach,
    isSpectator: hookIsSpectator,
    actionTimer,
    equityData,
    equityEnabled,
    setEquityEnabled,
    sharedRange,
    toggleEquityDisplay,
    toggleRangeDisplay,
    toggleHeatmapDisplay,
    shareRange,
    clearSharedRange,
  } = hookState ?? {};

  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [showScenarioBuilder, setShowScenarioBuilder] = useState(false);
  const [bustedMessage, setBustedMessage] = useState(null);
  const [sittingOut, setSittingOut] = useState(false);
  const [showTagDialog, setShowTagDialog] = useState(false);
  const [tagInput, setTagInput] = useState('');
  const [connectTimeout, setConnectTimeout] = useState(false);
  const navigate = useNavigate();

  // If gameState hasn't arrived within 8s, the table likely doesn't exist
  useEffect(() => {
    if (gameState) return;
    const timer = setTimeout(() => setConnectTimeout(true), 8000);
    return () => clearTimeout(timer);
  }, [gameState]);

  // ── Tournament management state ─────────────────────────────────────────────
  const [isManager, setIsManager]                 = useState(false);
  const [tournamentManagedBy, setTournamentManagedBy] = useState(null);
  const [tournamentManagerName, setTournamentManagerName] = useState(null);
  const [tournamentPaused, setTournamentPaused]   = useState(false);
  const [tournamentIsStarted, setTournamentIsStarted] = useState(false);
  // Visibility/overlay state (synced from server broadcasts)
  const [icmOverlayEnabled, setIcmOverlayEnabled]         = useState(false);
  const [managerHandVisible, setManagerHandVisible]       = useState(true);
  const [spectatorHandVisible, setSpectatorHandVisible]   = useState(false);

  const myStableId = useMemo(
    () => sessionStorage.getItem('poker_trainer_player_id') ?? user?.id ?? null,
    [user]
  );

  const socketRef = socket?.socketRef;

  // Derived values — must be declared before any useEffect that references them
  // in a dependency array (dependency arrays are evaluated at render time, not lazily).
  const tableMode = gameState?.table_mode ?? gameState?.tableMode ?? hookState?.tableMode ?? 'coached_cash';
  const tableName = gameState?.table_name ?? gameState?.room ?? null;
  const isSpectator = hookIsSpectator ?? false;
  const COACH_ROLES = new Set(['coach', 'admin', 'superadmin']);
  const actingAsCoach = (COACH_ROLES.has(user?.role) || hookIsCoach) && tableMode === 'coached_cash';
  const myId = useMemo(() => {
    if (!gameState?.players) return user?.id ?? null;
    const me = gameState.players.find((p) =>
      actingAsCoach ? p.is_coach : (p.stableId === user?.id || p.stable_id === user?.id)
    );
    return me?.id ?? user?.id ?? null;
  }, [gameState, actingAsCoach, user]);

  const handleManagerClaim = useCallback(() => {
    setIsManager(true);
  }, []);

  // ── "Go to Review" handler — coach requests group review of the most recent hand ──
  const handleGoToReview = useCallback(() => {
    socket?.emit('transition_to_review', {});
  }, [socket]);

  useEffect(() => {
    const s = socketRef?.current;
    if (!s || tableMode !== 'tournament') return;

    const onRoomJoined = ({ isManager: im }) => {
      if (im !== undefined) setIsManager(!!im);
    };

    const onManagerChanged = ({ managedBy, managerName }) => {
      setTournamentManagedBy(managedBy ?? null);
      setTournamentManagerName(managerName ?? null);
      if (!managedBy || managedBy !== myStableId) {
        setIsManager(false);
      } else if (managedBy === myStableId) {
        setIsManager(true);
      }
    };

    const onPaused   = () => setTournamentPaused(true);
    const onResumed  = () => setTournamentPaused(false);

    // Treat blind_up / time_remaining as a signal tournament is started
    const onStarted = () => setTournamentIsStarted(true);

    const onVisibility = ({ managerHandVisible: m, spectatorHandVisible: sp }) => {
      setManagerHandVisible(m);
      setSpectatorHandVisible(sp);
    };

    const onIcmOverlay = ({ enabled }) => setIcmOverlayEnabled(!!enabled);

    s.on('room_joined',                          onRoomJoined);
    s.on('tournament:manager_changed',           onManagerChanged);
    s.on('tournament:paused',                    onPaused);
    s.on('tournament:resumed',                   onResumed);
    s.on('tournament:blind_up',                  onStarted);
    s.on('tournament:time_remaining',            onStarted);
    s.on('tournament:hand_visibility_changed',   onVisibility);
    s.on('tournament:icm_overlay_changed',       onIcmOverlay);

    return () => {
      s.off('room_joined',                          onRoomJoined);
      s.off('tournament:manager_changed',           onManagerChanged);
      s.off('tournament:paused',                    onPaused);
      s.off('tournament:resumed',                   onResumed);
      s.off('tournament:blind_up',                  onStarted);
      s.off('tournament:time_remaining',            onStarted);
      s.off('tournament:hand_visibility_changed',   onVisibility);
      s.off('tournament:icm_overlay_changed',       onIcmOverlay);
    };
  }, [socketRef, tableMode, myStableId]);

  // ── Review transition socket listeners ────────────────────────────────────
  useEffect(() => {
    const s = socketRef?.current;
    if (!s) return;

    const onTransitionToReview = ({ handId, tableId: tid }) => {
      // Navigate all clients in the room (including the coach) to ReviewTablePage in socket mode
      navigate(`/review?handId=${handId}`, {
        state: { tableId: tid ?? tableId, isReviewSession: true },
      });
    };

    const onTransitionBackToPlay = () => {
      navigate(`/table/${tableId}`);
    };

    s.on('transition_to_review',    onTransitionToReview);
    s.on('transition_back_to_play', onTransitionBackToPlay);

    return () => {
      s.off('transition_to_review',    onTransitionToReview);
      s.off('transition_back_to_play', onTransitionBackToPlay);
    };
  }, [socketRef, tableId, navigate]);

  // ── player_busted event listener ─────────────────────────────────────────
  useEffect(() => {
    const s = socketRef?.current;
    if (!s) return;
    const onBusted = ({ message }) => {
      setBustedMessage(message ?? 'You have run out of chips.');
      setTimeout(() => setBustedMessage(null), 6000);
    };
    s.on('player_busted', onBusted);
    return () => s.off('player_busted', onBusted);
  }, [socketRef]);

  // ── table:closed listener (bot_cash) ─────────────────────────────────────
  useEffect(() => {
    const s = socketRef?.current;
    if (!s || tableMode !== 'bot_cash') return;
    const handler = () => navigate('/bot-lobby');
    s.on('table:closed', handler);
    return () => s.off('table:closed', handler);
  }, [socketRef, tableMode, navigate]);

  // ── Sync sitting-out state from game state ────────────────────────────────
  useEffect(() => {
    if (!gameState?.players || !myId) return;
    const me = gameState.players.find((p) => p.id === myId);
    if (me) setSittingOut(me.in_hand === false);
  }, [gameState, myId]);

  // Build emit object expected by PokerTable / CoachSidebar
  const emit = useMemo(() => ({
    startGame:           (mode) => socket.emit('start_game', { mode }),
    placeBet:            (action, amount) => socket.emit('place_bet', { action, amount }),
    manualDealCard:      (targetType, targetId, position, card) =>
                           socket.emit('manual_deal_card', { targetType, targetId, position, card }),
    undoAction:          () => socket.emit('undo_action'),
    rollbackStreet:      () => socket.emit('rollback_street'),
    togglePause:         () => socket.emit('toggle_pause'),
    setMode:             (mode) => socket.emit('set_mode', { mode }),
    forceNextStreet:     () => socket.emit('force_next_street'),
    awardPot:            (winnerId) => socket.emit('award_pot', { winnerId }),
    resetHand:           () => socket.emit('reset_hand'),
    adjustStack:         (playerId, amount) => socket.emit('adjust_stack', { playerId, amount }),
    openConfigPhase:     () => socket.emit('open_config_phase'),
    updateHandConfig:    (config) => socket.emit('update_hand_config', { config }),
    startConfiguredHand: () => socket.emit('start_configured_hand'),
    loadHandScenario:    (handId, stackMode = 'keep') =>
                           socket.emit('load_hand_scenario', { handId, stackMode }),
    updateHandTags:      (handId, tags) => socket.emit('update_hand_tags', { handId, tags }),
    setPlayerInHand:     (playerId, inHand) => socket.emit('set_player_in_hand', { playerId, inHand }),
    setBlindLevels:      (sb, bb) => socket.emit('set_blind_levels', { sb, bb }),
    // playlist helpers
    createPlaylist:      (name, description = '') =>
                           socket.emit('create_playlist', { name, description }),
    addToPlaylist:       (playlistId, handId) =>
                           socket.emit('add_to_playlist', { playlistId, handId }),
    removeFromPlaylist:  (playlistId, handId) =>
                           socket.emit('remove_from_playlist', { playlistId, handId }),
    deletePlaylist:      (playlistId) => socket.emit('delete_playlist', { playlistId }),
    renamePlaylist:      (playlistId, name) => socket.emit('rename_playlist', { playlistId, name }),
    activatePlaylist:    (playlistId) => socket.emit('activate_playlist', { playlistId }),
    deactivatePlaylist:  () => socket.emit('deactivate_playlist'),
    getPlaylists:        () => socket.emit('get_playlists'),
    // sit-out/sit-in (uncoached tables)
    sitOut: () => socket.emit('player_sit_out'),
    sitIn:  () => socket.emit('player_sit_in'),
    // Coach actions added in Phase 2 server work — gated server-side by requireCoach.
    coachAddBot:    (difficulty = 'easy') => socket.emit('coach:add_bot', { difficulty }),
    coachKickPlayer: (playerId) => socket.emit('coach:kick_player', { playerId }),
    branchToDrill:  ({ handId, playlistId, newPlaylistName, cursor } = {}) =>
                       socket.emit('branch_to_drill', { handId, playlistId, newPlaylistName, cursor }),
    // drill session helpers (D.8e)
    cancelCountdown: () => socket.emit('coach:cancel_countdown', { tableId }),
    resumeDrill:     () => socket.emit('coach:resume_drill', { tableId }),
    setCoachDrillRole: (role) => socket.emit('coach:set_drill_role', { tableId, role }),
    manualAdvanceSpot: () => socket.emit('coach:manual_advance_spot', { tableId }),
    // equity helpers
    toggleEquityDisplay,
    toggleRangeDisplay,
    toggleHeatmapDisplay,
    shareRange: ({ groups, label }) => socket.emit('coach:share_range', { tableId, groups, label }),
    clearSharedRange,
    setCoachEquityVisible:   (visible) => socket.emit('coach:set_coach_equity_visible', { tableId, visible }),
    setPlayersEquityVisible: (visible) => socket.emit('coach:set_players_equity_visible', { tableId, visible }),
  }), [socket, tableId, toggleEquityDisplay, toggleRangeDisplay, toggleHeatmapDisplay, clearSharedRange]);

  // Don't render PokerTable with null gameState — it will crash.
  // game_state arrives shortly after socket joins; show a connecting/error screen.
  if (!gameState) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100vw', alignItems: 'center', justifyContent: 'center', background: '#0d1117', gap: 16 }}>
        {connectTimeout ? (
          <>
            <p style={{ color: '#f85149', fontSize: 14, fontWeight: 600 }}>Table not found</p>
            <p style={{ color: '#6e7681', fontSize: 12 }}>
              This table may have closed or the server restarted.
            </p>
            <button
              onClick={() => navigate('/lobby')}
              style={{ marginTop: 8, padding: '8px 20px', fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', borderRadius: 6, border: '1px solid #30363d', background: 'transparent', color: '#d4af37', cursor: 'pointer' }}
            >
              Back to Lobby
            </button>
          </>
        ) : (
          <p style={{ color: '#6e7681', fontSize: 13 }}>Connecting to table…</p>
        )}
      </div>
    );
  }

  return (
    <div
      // sb-v3-active: scoped class for v3 chrome accents (serif logo, gold
      // mode-badge tint). Only present when the coach has enabled v3, so
      // student/spectator/tournament views never inherit the chrome.
      className={actingAsCoach && useSidebarV3 ? 'sb-v3-active' : ''}
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        width: '100vw',
        background: '#0d1117',
        overflow: 'hidden',
      }}
    >
      <h1 className="sr-only">Table</h1>
      {/* Top bar — logo, table name, mode badge, spectating indicator, back button */}
      <TableTopBar
        tableName={tableName}
        tableMode={tableMode}
        isSpectator={isSpectator}
        onBack={() => navigate('/lobby')}
        isCoach={actingAsCoach}
        canReview={actingAsCoach && (gameState?.phase === 'waiting' || gameState?.phase == null)}
        onGoToReview={handleGoToReview}
      />

      {/* Tournament secondary top bar — level, timer, field, avg stack */}
      {tableMode === 'tournament' && (
        <TournamentTopBar isPaused={tournamentPaused} />
      )}

      {/* Content row: table + optional sidebar */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0, overflow: 'hidden', position: 'relative' }}>
        {/* Main table — always rendered so all roles see their seat and cards */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          <PokerTable
            gameState={gameState}
            myId={myId}
            isCoach={actingAsCoach}
            actionTimer={actionTimer}
            emit={emit}
            bbView={bbView}
            equityData={equityData}
            equityEnabled={equityEnabled}
            sharedRange={sharedRange}
            equitySettings={hookState?.equitySettings}
            tableMode={tableMode}
            onBotRemove={tableMode === 'bot_cash' ? (stableId) => socket?.emit('bot:remove', { stableId }) : null}
          />
        </div>

        {/* Coach sidebar — only in coached_cash mode where the coach runs the game */}
        {actingAsCoach && useSidebarV3 && (
          <SidebarV3
            data={buildLiveData({ hookState, user, playlist })}
            emit={emit}
            tableId={tableId}
            replay={replay}
          />
        )}
        {actingAsCoach && !useSidebarV3 && (
          <CoachSidebar
            gameState={gameState ?? {}}
            emit={emit}
            isOpen={sidebarOpen}
            onToggle={() => setSidebarOpen((o) => !o)}
            playlists={playlist?.playlists ?? []}
            drill={drill}
            myId={myId}
            setBlindLevels={emit.setBlindLevels}
            onOpenScenarioBuilder={() => setShowScenarioBuilder(true)}
            equityEnabled={equityEnabled ?? false}
            setEquityEnabled={setEquityEnabled}
            equitySettings={hookState?.equitySettings}
            replayMeta={replay?.replayMeta ?? null}
            loadReplay={replay?.loadReplay ?? null}
            replayStepForward={replay?.replayStepForward ?? null}
            replayStepBack={replay?.replayStepBack ?? null}
            replayJumpTo={replay?.replayJumpTo ?? null}
            replayBranch={replay?.replayBranch ?? null}
            replayUnbranch={replay?.replayUnbranch ?? null}
            replayExit={replay?.replayExit ?? null}
          />
        )}

        {/* Tournament manager sidebar — only shown when user is the active manager */}
        {tableMode === 'tournament' && isManager && (
          <TournamentSidebar
            isPaused={tournamentPaused}
            icmOverlayEnabled={icmOverlayEnabled}
            managerHandVisible={managerHandVisible}
            spectatorHandVisible={spectatorHandVisible}
            isStarted={tournamentIsStarted}
          />
        )}

        {/* Tournament info panel — shown for non-managers (players/spectators) */}
        {tableMode === 'tournament' && !isManager && (
          <TournamentInfoPanel />
        )}

        {/* Managed-by badge — floating, shown to non-managers on tournament tables */}
        {tableMode === 'tournament' && !isManager && (
          <ManagedByBadge
            managedBy={tournamentManagedBy}
            managerName={tournamentManagerName}
            onClaimSuccess={handleManagerClaim}
          />
        )}
      </div>

      {/* Busted toast — shown when the player runs out of chips */}
      {bustedMessage && (
        <div
          style={{
            position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
            zIndex: 100, padding: '12px 20px', borderRadius: 8,
            background: 'rgba(248,81,73,0.15)', border: '1px solid rgba(248,81,73,0.5)',
            color: '#f85149', fontSize: 13, fontWeight: 600,
            boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
          }}
        >
          {bustedMessage}
        </div>
      )}

      {/* Add Bot button — shown for non-spectator players on bot_cash tables */}
      {tableMode === 'bot_cash' && !isSpectator && (
        <div style={{ position: 'fixed', bottom: 24, left: 24, zIndex: 90 }}>
          <button
            data-testid="add-bot-btn"
            onClick={() => socket?.emit('bot:add')}
            style={{
              padding: '8px 16px', borderRadius: 8, fontSize: 12, fontWeight: 600,
              cursor: 'pointer', transition: 'all 0.15s',
              background: 'rgba(212,175,55,0.15)', border: '1px solid rgba(212,175,55,0.4)',
              color: '#d4af37',
            }}
          >
            + Add Bot
          </button>
        </div>
      )}

      {/* Sit-out toggle — shown for non-coach, non-spectator players on uncoached tables */}
      {!actingAsCoach && !isSpectator && tableMode === 'uncoached_cash' && (
        <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 90 }}>
          <button
            onClick={() => {
              if (sittingOut) {
                emit.sitIn();
                setSittingOut(false);
              } else {
                emit.sitOut();
                setSittingOut(true);
              }
            }}
            style={{
              padding: '8px 16px', borderRadius: 8, fontSize: 12, fontWeight: 600,
              cursor: 'pointer', transition: 'all 0.15s',
              background: sittingOut ? 'rgba(34,197,94,0.15)' : 'rgba(248,81,73,0.1)',
              border: sittingOut ? '1px solid rgba(34,197,94,0.4)' : '1px solid rgba(248,81,73,0.35)',
              color: sittingOut ? '#4ade80' : '#f87171',
            }}
          >
            {sittingOut ? 'Sitting Out — Click to Sit In' : 'Sit Out Next Hand'}
          </button>
        </div>
      )}

      {/* Spectator tag button — for coach/admin role spectators */}
      {isSpectator && (user?.role === 'coach' || user?.role === 'admin' || user?.role === 'superadmin') && (
        <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 90 }}>
          <button
            onClick={() => setShowTagDialog(true)}
            style={{
              padding: '8px 16px', borderRadius: 8, fontSize: 12, fontWeight: 600,
              cursor: 'pointer',
              background: 'rgba(212,175,55,0.15)', border: '1px solid rgba(212,175,55,0.4)',
              color: '#d4af37',
            }}
          >
            Tag Hand
          </button>
        </div>
      )}

      {/* Tag dialog */}
      {showTagDialog && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 100, display: 'flex',
            alignItems: 'center', justifyContent: 'center',
            background: 'rgba(0,0,0,0.6)',
          }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowTagDialog(false); }}
        >
          <div style={{
            background: '#161b22', border: '1px solid #30363d', borderRadius: 12,
            padding: 20, minWidth: 280, display: 'flex', flexDirection: 'column', gap: 12,
          }}>
            <h3 style={{ color: '#d4af37', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 2, margin: 0 }}>
              Tag Hand
            </h3>
            <input
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              placeholder="e.g. hero-fold, cooler"
              autoFocus
              style={{
                background: '#0d1117', border: '1px solid #30363d', borderRadius: 6,
                padding: '8px 12px', color: '#e6edf3', fontSize: 13, outline: 'none',
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && tagInput.trim()) {
                  emit.updateHandTags(gameState?.handId, tagInput.trim().split(',').map(t => t.trim()).filter(Boolean));
                  setTagInput('');
                  setShowTagDialog(false);
                }
              }}
            />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowTagDialog(false)}
                style={{
                  padding: '6px 14px', borderRadius: 6, fontSize: 12, fontWeight: 600,
                  background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                  color: '#9ca3af', cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (!tagInput.trim()) return;
                  emit.updateHandTags(gameState?.handId, tagInput.trim().split(',').map(t => t.trim()).filter(Boolean));
                  setTagInput('');
                  setShowTagDialog(false);
                }}
                style={{
                  padding: '6px 14px', borderRadius: 6, fontSize: 12, fontWeight: 600,
                  background: 'rgba(212,175,55,0.2)', border: '1px solid rgba(212,175,55,0.5)',
                  color: '#d4af37', cursor: 'pointer',
                }}
              >
                Save Tags
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Inline Scenario Builder modal — opens instead of navigating away */}
      {showScenarioBuilder && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 50,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(0,0,0,0.75)',
          }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowScenarioBuilder(false); }}
        >
          <div
            style={{
              width: '90vw',
              maxWidth: 900,
              maxHeight: '90vh',
              overflowY: 'auto',
              background: '#0d1117',
              border: '1px solid #30363d',
              borderRadius: 12,
              boxShadow: '0 24px 64px rgba(0,0,0,0.8)',
            }}
          >
            <ScenarioBuilder
              scenario={null}
              folders={[]}
              onSaved={() => setShowScenarioBuilder(false)}
              onClose={() => setShowScenarioBuilder(false)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
