import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useSocket } from './hooks/useSocket';
import PokerTable from './components/PokerTable';
import CoachSidebar from './components/CoachSidebar';
import CardPicker from './components/CardPicker';
import StatsPanel from './components/StatsPanel';

// ── Utility ───────────────────────────────────────────────────────────────────

function ConnectionDot({ connected }) {
  return (
    <span className="flex items-center gap-1.5">
      <span
        className={`w-2 h-2 rounded-full transition-colors duration-300 ${
          connected ? 'bg-emerald-400' : 'bg-red-500'
        }`}
        style={{
          boxShadow: connected
            ? '0 0 6px rgba(52,211,153,0.8)'
            : '0 0 6px rgba(239,68,68,0.8)',
        }}
      />
      <span className={`text-xs ${connected ? 'text-emerald-400' : 'text-red-400'}`}>
        {connected ? 'Connected' : 'Disconnected'}
      </span>
    </span>
  );
}

// ── Join / Lobby screen ───────────────────────────────────────────────────────

const INPUT_STYLE = {
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.1)',
  caretColor: '#d4af37',
};

function AuthInput({ type = 'text', value, onChange, placeholder, maxLength }) {
  return (
    <input
      type={type}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      maxLength={maxLength}
      className="w-full rounded-lg px-3 py-2.5 text-sm text-gray-100 placeholder-gray-600 outline-none transition-all duration-150"
      style={INPUT_STYLE}
      onFocus={(e) => {
        e.target.style.borderColor = 'rgba(212,175,55,0.45)';
        e.target.style.boxShadow = '0 0 0 3px rgba(212,175,55,0.08)';
      }}
      onBlur={(e) => {
        e.target.style.borderColor = 'rgba(255,255,255,0.1)';
        e.target.style.boxShadow = 'none';
      }}
    />
  );
}

const API_BASE = import.meta.env.DEV ? 'http://localhost:3001' : '';

function JoinScreen({ joinRoom, connected }) {
  const [mode, setMode]       = useState('login');
  const [name, setName]       = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]     = useState('');
  const [loading, setLoading] = useState(false);

  const clearFields = (newMode) => {
    setMode(newMode);
    setError('');
    setPassword('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (mode === 'spectate') {
      if (!name.trim() || name.trim().length < 2) { setError('Name must be at least 2 characters.'); return; }
      joinRoom(name.trim(), 'spectator');
      return;
    }

    if (!name.trim()) { setError('Name is required.'); return; }
    if (!password)    { setError('Password is required.'); return; }

    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || 'Login failed.');
        setLoading(false);
        return;
      }
      // Store JWT and stableId for reconnects
      localStorage.setItem('poker_trainer_jwt', data.token);
      localStorage.setItem('poker_trainer_player_id', data.stableId);
      joinRoom(data.name, data.role === 'coach' ? 'coach' : 'player');
    } catch {
      setError('Network error — is the server running?');
    }
    setLoading(false);
  };

  const TABS = [
    { key: 'login',   label: 'Log In' },
    { key: 'spectate', label: 'Spectate' },
  ];

  const submitLabel = {
    login:   loading ? 'Logging in…' : 'Log In',
    spectate: loading ? 'Joining…'    : 'Watch as Spectator',
  }[mode];

  return (
    <div
      className="min-h-screen w-screen flex items-center justify-center"
      style={{ background: '#060a0f' }}
    >
      {/* Ambient background glow */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse 60% 50% at 50% 50%, rgba(212,175,55,0.04) 0%, transparent 70%)',
        }}
      />

      <div
        className="relative w-full max-w-sm rounded-2xl px-8 py-10 flex flex-col gap-6"
        style={{
          background: 'rgba(13, 17, 23, 0.97)',
          border: '1px solid rgba(212,175,55,0.18)',
          boxShadow: '0 8px 60px rgba(0,0,0,0.8), 0 0 0 1px rgba(255,255,255,0.03)',
        }}
      >
        {/* Header */}
        <div className="flex flex-col items-center gap-1.5">
          <h1
            className="text-2xl font-black tracking-[0.25em] uppercase leading-none"
            style={{ color: '#d4af37', textShadow: '0 0 30px rgba(212,175,55,0.35)' }}
          >
            POKER TRAINING
          </h1>
          <p className="text-xs text-gray-500 tracking-widest uppercase">
            Texas Hold'em — Coach Platform
          </p>
        </div>

        {/* Mode tabs */}
        <div className="flex rounded-lg overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.08)' }}>
          {TABS.map((tab, i) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => clearFields(tab.key)}
              className="flex-1 py-2 text-xs font-semibold uppercase tracking-widest transition-all duration-150"
              style={{
                background: mode === tab.key ? 'rgba(212,175,55,0.15)' : 'transparent',
                color: mode === tab.key ? '#d4af37' : 'rgba(156,163,175,0.7)',
                borderRight: i < TABS.length - 1 ? '1px solid rgba(255,255,255,0.08)' : 'none',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
          {/* Name — always shown */}
          <div className="flex flex-col gap-1.5">
            <label className="label-sm">{mode === 'spectate' ? 'Display Name' : 'Name'}</label>
            <AuthInput
              value={name}
              onChange={(e) => { setName(e.target.value); setError(''); }}
              placeholder="Enter your name"
              maxLength={32}
            />
          </div>

          {/* Password — login only */}
          {mode === 'login' && (
            <div className="flex flex-col gap-1.5">
              <label className="label-sm">Password</label>
              <AuthInput
                type="password"
                value={password}
                onChange={(e) => { setPassword(e.target.value); setError(''); }}
                placeholder="Password"
              />
            </div>
          )}

          {/* Error message */}
          {error && (
            <p className="text-xs text-red-400 leading-snug -mt-1">{error}</p>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={loading || !connected}
            className="btn-gold w-full py-3 text-sm tracking-widest uppercase"
          >
            {submitLabel}
          </button>
        </form>

        {/* Connection status */}
        <div className="flex justify-center">
          <ConnectionDot connected={connected} />
        </div>
      </div>
    </div>
  );
}

// ── Top bar ───────────────────────────────────────────────────────────────────

function TopBar({ gameState, isCoach, connected, playerCount, onLeave, bbView, onToggleBBView }) {
  const tableName = gameState?.table_name ?? gameState?.room ?? 'Training Table';
  const mode      = gameState?.mode ?? 'live';
  const phase     = gameState?.phase ?? 'waiting';

  const replayActive   = gameState?.replay_mode?.active;
  const replayBranched = gameState?.replay_mode?.branched;

  const modeBadgeClasses =
    mode === 'review'
      ? 'bg-purple-900/60 text-purple-300 border border-purple-700/40'
      : mode === 'drill'
      ? 'bg-blue-900/60 text-blue-300 border border-blue-700/40'
      : 'bg-emerald-900/60 text-emerald-300 border border-emerald-700/40';

  return (
    <div
      className="flex items-center justify-between px-4 py-2 shrink-0 z-10"
      style={{
        background: 'rgba(6,10,15,0.95)',
        borderBottom: '1px solid rgba(255,255,255,0.05)',
        backdropFilter: 'blur(8px)',
        height: 44,
      }}
    >
      {/* Left: BB toggle + table name + mode badges */}
      <div className="flex items-center gap-3">
        {onToggleBBView && (
          <button
            onClick={onToggleBBView}
            className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded transition-colors"
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
        <span
          className="text-sm font-semibold tracking-wide"
          style={{ color: '#d4af37' }}
        >
          {tableName}
        </span>
        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-widest ${modeBadgeClasses}`}>
          {mode}
        </span>
        {isCoach && (
          <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-widest bg-gold-900/50 text-gold-400 border border-gold-700/40">
            Coach
          </span>
        )}
        {gameState?.playlist_mode?.active && (
          <span
            className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-widest"
            style={{ background: 'rgba(212,175,55,0.12)', color: '#d4af37', border: '1px solid rgba(212,175,55,0.35)' }}
          >
            ▶ Playlist {(gameState.playlist_mode.currentIndex ?? 0) + 1}/{gameState.playlist_mode.totalHands ?? '?'}
          </span>
        )}
        {replayActive && (
          <span
            className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-widest"
            style={{ background: replayBranched ? 'rgba(245,158,11,0.2)' : 'rgba(59,130,246,0.2)', color: replayBranched ? '#f59e0b' : '#60a5fa', border: `1px solid ${replayBranched ? 'rgba(245,158,11,0.4)' : 'rgba(59,130,246,0.4)'}` }}
          >
            {replayBranched ? 'BRANCHED' : 'REPLAY'}
          </span>
        )}
      </div>

      {/* Center: phase */}
      {phase && phase !== 'waiting' && phase !== 'replay' && (
        <span className="text-[10px] text-gray-500 tracking-[0.25em] uppercase absolute left-1/2 -translate-x-1/2">
          {phase}
        </span>
      )}

      {/* Right: player count + connection + leave */}
      <div className="flex items-center gap-3">
        <span className="text-xs text-gray-500">
          {playerCount} player{playerCount !== 1 ? 's' : ''}
        </span>
        <ConnectionDot connected={connected} />
        <button
          onClick={onLeave}
          className="text-xs font-semibold uppercase tracking-widest px-3 py-1 rounded transition-all duration-150 active:scale-95"
          style={{
            background: 'rgba(239,68,68,0.15)',
            color: '#f87171',
            border: '1px solid rgba(239,68,68,0.35)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(239,68,68,0.28)';
            e.currentTarget.style.borderColor = 'rgba(239,68,68,0.6)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'rgba(239,68,68,0.15)';
            e.currentTarget.style.borderColor = 'rgba(239,68,68,0.35)';
          }}
          title="Leave table"
        >
          Leave
        </button>
      </div>
    </div>
  );
}

// ── Notification toast (top-right) ───────────────────────────────────────────

function NotificationToast({ notification, onDismiss }) {
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

// ── Tag Hand Pill (floating, coach-only) ──────────────────────────────────────

const HAND_TAGS = ['Review', 'Bluff', 'Hero Call', 'Mistake', 'Key Hand', '3-Bet Pot'];

function TagHandPill({ currentHandTags, setCurrentHandTags, handTagsSaved, gameState, sidebarOpen }) {
  const [expanded, setExpanded] = useState(false);

  // Auto-collapse and reset on new hand (phase → waiting)
  useEffect(() => {
    if (gameState?.phase === 'waiting') {
      setExpanded(false);
    }
  }, [gameState?.phase]);

  // Hide when not in an active hand
  const isActive = gameState && gameState.phase !== 'waiting' && gameState.phase !== 'replay';
  if (!isActive) return null;

  const rightOffset = sidebarOpen ? 'calc(18rem + 8px)' : '8px';

  return (
    <div
      className="fixed z-50 flex flex-col items-end gap-1"
      style={{ top: '54px', right: rightOffset, transition: 'right 0.2s' }}
    >
      {expanded ? (
        <div
          className="rounded-xl overflow-hidden"
          style={{
            background: 'rgba(6,10,15,0.97)',
            border: '1px solid rgba(212,175,55,0.3)',
            boxShadow: '0 4px 24px rgba(0,0,0,0.6)',
            minWidth: 200,
          }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-3 py-2 border-b border-white/5">
            <span style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.15em', color: '#d4af37' }}>TAG HAND</span>
            <div className="flex items-center gap-2">
              {handTagsSaved && (
                <span style={{ fontSize: '9px', color: '#3fb950', letterSpacing: '0.06em' }}>✓ Saved</span>
              )}
              <button
                onClick={() => setExpanded(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6e7681', fontSize: 14, lineHeight: 1, padding: '0 2px' }}
                onMouseEnter={(e) => { e.currentTarget.style.color = '#f85149'; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = '#6e7681'; }}
              >
                ✕
              </button>
            </div>
          </div>

          {/* Tag chips */}
          <div className="flex flex-wrap gap-1.5 p-3">
            {HAND_TAGS.map(tag => {
              const active = currentHandTags.includes(tag);
              return (
                <button
                  key={tag}
                  onClick={() => setCurrentHandTags(prev =>
                    prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
                  )}
                  className="px-2 py-0.5 rounded-full text-[10px] font-semibold tracking-wide border transition-all duration-100"
                  style={active ? {
                    background: 'rgba(212,175,55,0.2)',
                    borderColor: 'rgba(212,175,55,0.6)',
                    color: '#d4b896',
                  } : {
                    background: 'rgba(255,255,255,0.05)',
                    borderColor: 'rgba(255,255,255,0.1)',
                    color: '#6e7681',
                  }}
                  onMouseEnter={(e) => { if (!active) e.currentTarget.style.borderColor = 'rgba(255,255,255,0.25)'; }}
                  onMouseLeave={(e) => { if (!active) e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'; }}
                >
                  {tag}
                </button>
              );
            })}
          </div>

          {/* Tag count + clear */}
          {currentHandTags.length > 0 && (
            <div className="flex items-center justify-between px-3 pb-2">
              <span style={{ fontSize: '9px', color: '#6e7681' }}>
                {currentHandTags.length} tag{currentHandTags.length > 1 ? 's' : ''} applied
              </span>
              <button
                onClick={() => setCurrentHandTags([])}
                style={{ fontSize: '9px', color: 'rgba(248,81,73,0.7)', background: 'none', border: 'none', cursor: 'pointer' }}
                onMouseEnter={(e) => { e.currentTarget.style.color = '#f85149'; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = 'rgba(248,81,73,0.7)'; }}
              >
                Clear
              </button>
            </div>
          )}
        </div>
      ) : (
        <button
          onClick={() => setExpanded(true)}
          className="flex items-center gap-1.5 px-3 py-1 rounded-full transition-all duration-150"
          style={{
            background: currentHandTags.length > 0 ? 'rgba(212,175,55,0.2)' : 'rgba(6,10,15,0.9)',
            border: `1px solid ${currentHandTags.length > 0 ? 'rgba(212,175,55,0.5)' : 'rgba(255,255,255,0.12)'}`,
            color: currentHandTags.length > 0 ? '#d4af37' : 'rgba(255,255,255,0.4)',
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: '0.15em',
            backdropFilter: 'blur(8px)',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'rgba(212,175,55,0.45)'; e.currentTarget.style.color = '#d4af37'; }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = currentHandTags.length > 0 ? 'rgba(212,175,55,0.5)' : 'rgba(255,255,255,0.12)';
            e.currentTarget.style.color = currentHandTags.length > 0 ? '#d4af37' : 'rgba(255,255,255,0.4)';
          }}
        >
          {currentHandTags.length > 0 && <span style={{ fontSize: 9 }}>{currentHandTags.length}</span>}
          TAG HAND
        </button>
      )}
    </div>
  );
}

// ── Error toast (top-center) ──────────────────────────────────────────────────

function ErrorToast({ message, onDismiss }) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, 6000);
    return () => clearTimeout(timer);
  }, [message, onDismiss]);

  return (
    <div
      className="toast-enter flex items-start gap-2 px-4 py-3 rounded-xl shadow-2xl cursor-pointer"
      style={{
        background: 'rgba(30, 10, 10, 0.97)',
        border: '1px solid rgba(239,68,68,0.4)',
        backdropFilter: 'blur(8px)',
        maxWidth: 360,
        boxShadow: '0 4px 30px rgba(239,68,68,0.2)',
      }}
      onClick={onDismiss}
    >
      <span className="text-red-400 text-sm leading-none mt-0.5 shrink-0">⚠</span>
      <span className="text-sm text-red-300 leading-snug flex-1">{message}</span>
      <span className="text-gray-600 text-xs shrink-0 mt-0.5">✕</span>
    </div>
  );
}

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
  const emit = {
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
  };

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
