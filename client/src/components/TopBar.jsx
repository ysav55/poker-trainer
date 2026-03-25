import React from 'react';
import ConnectionDot from './ConnectionDot';

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

export default TopBar;
