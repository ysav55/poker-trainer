import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { useSocket } from './hooks/useSocket';
import PokerTable from './components/PokerTable';
import CoachSidebar from './components/CoachSidebar';
import CardPicker from './components/CardPicker';
import StatsPanel from './components/StatsPanel';
import ConnectionDot from './components/ConnectionDot';
import JoinScreen from './components/JoinScreen';
import TopBar from './components/TopBar';
import NotificationToast from './components/NotificationToast';
import ErrorToast from './components/ErrorToast';
import TagHandPill from './components/TagHandPill';

// ── Root App component ────────────────────────────────────────────────────────

export default function App() {
  const {
    gameState,
    myId,
    isCoach,
    isSpectator,
    coachDisconnected,
    actionTimer,
    connected,
    errors,
    notifications,
    sessionStats,
    playlists,
    activeHandId,
    handTagsSaved,
    myPlayer,
    joinRoom,
    leaveRoom,
    startGame,
    placeBet,
    manualDealCard,
    undoAction,
    rollbackStreet,
    togglePause,
    setMode,
    forceNextStreet,
    awardPot,
    resetHand,
    adjustStack,
    openConfigPhase,
    updateHandConfig,
    startConfiguredHand,
    loadHandScenario,
    createPlaylist,
    getPlaylists,
    addToPlaylist,
    removeFromPlaylist,
    deletePlaylist,
    activatePlaylist,
    deactivatePlaylist,
    updateHandTags,
    setPlayerInHand,
    loadReplay,
    replayStepFwd,
    replayStepBack,
    replayJumpTo,
    replayBranch,
    replayUnbranch,
    replayExit,
    bbView,
    toggleBBView,
    setBlindLevels,
  } = useSocket();

  // ── Local state ────────────────────────────────────────────────────────────
  const [cardPickerTarget, setCardPickerTarget] = useState(null);
  const [dismissedErrorIds, setDismissedErrorIds] = useState(new Set());
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [statsOpen, setStatsOpen] = useState(false);
  const [currentHandTags, setCurrentHandTags] = useState([]);
  const tagDebounceRef = useRef(null);

  const handleToggleSidebar = useCallback(() => {
    setSidebarOpen((v) => !v);
  }, []);

  // ── Tag Hand: reset on new hand ───────────────────────────────────────────
  useEffect(() => {
    if (gameState?.phase === 'waiting') setCurrentHandTags([]);
  }, [gameState?.phase]);

  // ── Emit bundle ───────────────────────────────────────────────────────────
  const emit = useMemo(() => ({
    startGame,
    placeBet,
    manualDealCard,
    undoAction,
    rollbackStreet,
    togglePause,
    setMode,
    forceNextStreet,
    awardPot,
    resetHand,
    adjustStack,
    openConfigPhase,
    updateHandConfig,
    startConfiguredHand,
    loadHandScenario,
    createPlaylist,
    getPlaylists,
    addToPlaylist,
    removeFromPlaylist,
    deletePlaylist,
    activatePlaylist,
    deactivatePlaylist,
    updateHandTags,
    setPlayerInHand,
    loadReplay,
    replayStepFwd,
    replayStepBack,
    replayJumpTo,
    replayBranch,
    replayUnbranch,
    replayExit,
  }), [
    startGame,
    placeBet,
    manualDealCard,
    undoAction,
    rollbackStreet,
    togglePause,
    setMode,
    forceNextStreet,
    awardPot,
    resetHand,
    adjustStack,
    openConfigPhase,
    updateHandConfig,
    startConfiguredHand,
    loadHandScenario,
    createPlaylist,
    getPlaylists,
    addToPlaylist,
    removeFromPlaylist,
    deletePlaylist,
    activatePlaylist,
    deactivatePlaylist,
    updateHandTags,
    setPlayerInHand,
    loadReplay,
    replayStepFwd,
    replayStepBack,
    replayJumpTo,
    replayBranch,
    replayUnbranch,
    replayExit,
  ]);

  // ── Tag Hand: debounced save ──────────────────────────────────────────────
  useEffect(() => {
    if (!activeHandId || !updateHandTags) return;
    clearTimeout(tagDebounceRef.current);
    tagDebounceRef.current = setTimeout(() => {
      updateHandTags(activeHandId, currentHandTags);
    }, 500);
    return () => clearTimeout(tagDebounceRef.current);
  }, [currentHandTags, activeHandId]);

  // ── CardPicker handlers ───────────────────────────────────────────────────
  const handleOpenCardPicker = useCallback((target) => {
    setCardPickerTarget(target);
  }, []);

  const handleCardPickerSelect = useCallback(
    (card) => {
      if (!cardPickerTarget) return;
      const { type, playerId, position } = cardPickerTarget;
      manualDealCard(type, playerId, position, card);
      setCardPickerTarget(null);
    },
    [cardPickerTarget, manualDealCard]
  );

  const handleCardPickerClose = useCallback(() => {
    setCardPickerTarget(null);
  }, []);

  // ── Error dismissal ───────────────────────────────────────────────────────
  const handleDismissError = useCallback((errId) => {
    setDismissedErrorIds((prev) => new Set([...prev, errId]));
  }, []);

  // ── Determine if we are in the table view ─────────────────────────────────
  // We consider "joined" when myId is set (socket assigned us an id and gameState exists)
  const hasJoined = Boolean(myId && gameState);

  // Visible errors (not dismissed) — filter by id
  const visibleErrors = (errors ?? []).filter((e) => !dismissedErrorIds.has(e.id));

  // Player count (excluding coaches)
  const playerCount = (gameState?.players ?? []).filter((p) => !p.is_coach).length;

  // ── Render ─────────────────────────────────────────────────────────────────

  if (!hasJoined) {
    return (
      <JoinScreen
        joinRoom={joinRoom}
        connected={connected}
      />
    );
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden" style={{ background: '#060a0f' }}>

      {/* ── Main column ─────────────────────────────────────────────────── */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">

        {/* Top bar */}
        <TopBar
          gameState={gameState}
          isCoach={isCoach}
          connected={connected}
          playerCount={playerCount}
          onLeave={leaveRoom}
          bbView={bbView}
          onToggleBBView={toggleBBView}
        />

        {/* Tag Hand Pill — coach-only, floating below TopBar */}
        {isCoach && !isSpectator && (
          <TagHandPill
            currentHandTags={currentHandTags}
            setCurrentHandTags={setCurrentHandTags}
            handTagsSaved={handTagsSaved}
            gameState={gameState}
            sidebarOpen={sidebarOpen}
          />
        )}

        {/* Error toasts — fixed top center */}
        {visibleErrors.length > 0 && (
          <div className="fixed top-[52px] left-1/2 -translate-x-1/2 z-50 flex flex-col gap-2 pointer-events-none">
            {visibleErrors.map((err, i) => (
              <div key={err.id} className="pointer-events-auto">
                <ErrorToast
                  message={err.message}
                  onDismiss={() => handleDismissError(err.id)}
                />
              </div>
            ))}
          </div>
        )}

        {/* Poker table — fills remaining vertical space */}
        <PokerTable
          gameState={gameState}
          myId={myId}
          isCoach={isCoach}
          coachDisconnected={coachDisconnected}
          actionTimer={actionTimer}
          emit={emit}
          onOpenCardPicker={handleOpenCardPicker}
          bbView={bbView}
          bigBlind={gameState?.big_blind ?? 10}
        />
      </div>

      {/* ── Coach sidebar (right) ────────────────────────────────────────── */}
      {isCoach && !isSpectator && (
        <CoachSidebar
          gameState={gameState}
          emit={emit}
          myId={myId}
          onOpenCardPicker={handleOpenCardPicker}
          sessionStats={sessionStats}
          playlists={playlists}
          isOpen={sidebarOpen}
          onToggle={handleToggleSidebar}
          activeHandId={activeHandId}
          handTagsSaved={handTagsSaved}
          setBlindLevels={setBlindLevels}
        />
      )}

      {/* ── Stats panel ──────────────────────────────────────────────────── */}
      <StatsPanel
        isOpen={statsOpen}
        onClose={() => setStatsOpen(false)}
        isCoach={isCoach}
      />

      {/* ── CardPicker modal ─────────────────────────────────────────────── */}
      {cardPickerTarget && (() => {
        // Compute which cards are already in play
        const usedCards = new Set();
        (gameState?.players ?? []).forEach(p =>
          (p.hole_cards ?? []).forEach(c => { if (c && c !== 'HIDDEN') usedCards.add(c); })
        );
        (gameState?.board ?? []).forEach(c => { if (c) usedCards.add(c); });

        // Remove the card currently in the target slot so it can be replaced
        if (cardPickerTarget.type === 'player') {
          const p = (gameState?.players ?? []).find(pl => pl.id === cardPickerTarget.playerId);
          const existing = p?.hole_cards?.[cardPickerTarget.position];
          if (existing && existing !== 'HIDDEN') usedCards.delete(existing);
        } else {
          const existing = (gameState?.board ?? [])[cardPickerTarget.position];
          if (existing) usedCards.delete(existing);
        }

        // Build a human-readable title
        const BOARD_LABELS = ['Flop 1', 'Flop 2', 'Flop 3', 'Turn', 'River'];
        let title = 'Select a card';
        if (cardPickerTarget.type === 'board') {
          title = `Board — ${BOARD_LABELS[cardPickerTarget.position] ?? `Slot ${cardPickerTarget.position}`}`;
        } else {
          const p = (gameState?.players ?? []).find(pl => pl.id === cardPickerTarget.playerId);
          title = `${p?.name ?? 'Player'} — Card ${cardPickerTarget.position + 1}`;
        }

        return (
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center"
            style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)' }}
            onClick={(e) => { if (e.target === e.currentTarget) handleCardPickerClose(); }}
          >
            <CardPicker
              usedCards={usedCards}
              title={title}
              onSelect={handleCardPickerSelect}
              onClose={handleCardPickerClose}
            />
          </div>
        );
      })()}
    </div>
  );
}
