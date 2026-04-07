import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useTable } from '../contexts/TableContext.jsx';

function formatMs(ms) {
  if (ms == null || ms < 0) ms = 0;
  const totalSec = Math.ceil(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function timerColor(remainingMs, totalMs) {
  if (!totalMs || totalMs <= 0) return '#3fb950';
  const pct = remainingMs / totalMs;
  if (pct > 0.5) return '#3fb950';
  if (pct > 0.25) return '#e3b341';
  return '#f85149';
}

/**
 * TournamentTopBar — secondary header strip for tournament tables.
 * Visible to all users (players, spectators, manager).
 * Shows: Level / Blinds / Countdown / Players Remaining / Avg Stack / Paused indicator.
 */
export default function TournamentTopBar({ isPaused = false }) {
  const { socket: tableSocket, gameState } = useTable();
  const socketRef = tableSocket?.socketRef;

  const [currentLevel, setCurrentLevel] = useState(null);
  const [remainingMs, setRemainingMs]   = useState(null);
  const [totalMs, setTotalMs]           = useState(null);
  const [isFinalLevel, setIsFinalLevel] = useState(false);
  const tickRef = useRef(null);

  const startCountdown = useCallback((ms) => {
    clearInterval(tickRef.current);
    setRemainingMs(ms);
    const end = Date.now() + ms;
    tickRef.current = setInterval(() => {
      const left = Math.max(0, end - Date.now());
      setRemainingMs(left);
      if (left <= 0) clearInterval(tickRef.current);
    }, 1000);
  }, []);

  useEffect(() => () => clearInterval(tickRef.current), []);

  // Pause/resume countdown when isPaused changes
  useEffect(() => {
    if (isPaused) {
      clearInterval(tickRef.current);
    } else if (remainingMs != null && remainingMs > 0) {
      startCountdown(remainingMs);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPaused]);

  useEffect(() => {
    const socket = socketRef?.current;
    if (!socket) return;

    const onTimeRemaining = ({ level, remainingMs: ms, durationMs }) => {
      setCurrentLevel((prev) => (prev?.level === level ? prev : { ...prev, level }));
      if (durationMs) setTotalMs(durationMs);
      startCountdown(ms);
    };

    const onBlindUp = (levelObj) => {
      setCurrentLevel(levelObj);
      if (levelObj.durationMs) {
        setTotalMs(levelObj.durationMs);
        startCountdown(levelObj.durationMs);
      }
      setIsFinalLevel(false);
    };

    const onFinalLevel = () => setIsFinalLevel(true);

    socket.on('tournament:time_remaining', onTimeRemaining);
    socket.on('tournament:blind_up', onBlindUp);
    socket.on('tournament:final_level', onFinalLevel);
    return () => {
      socket.off('tournament:time_remaining', onTimeRemaining);
      socket.off('tournament:blind_up', onBlindUp);
      socket.off('tournament:final_level', onFinalLevel);
    };
  }, [socketRef, startCountdown]);

  // Derived values from game state
  const seated = Array.isArray(gameState?.seated)
    ? gameState.seated
    : Array.isArray(gameState?.players) ? gameState.players : [];
  const activePlayers = seated.filter((p) => p && (p.stack ?? 0) > 0);
  const avgStack = activePlayers.length > 0
    ? Math.round(activePlayers.reduce((s, p) => s + (p.stack ?? 0), 0) / activePlayers.length)
    : 0;

  const color = timerColor(remainingMs ?? 0, totalMs ?? 0);
  const criticalTime = remainingMs != null && remainingMs <= 120_000;

  const Divider = () => (
    <span style={{ width: 1, height: 20, background: '#21262d', flexShrink: 0 }} />
  );

  const Stat = ({ label, value, valueStyle = {} }) => (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
      <span style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.13em', color: '#6e7681', textTransform: 'uppercase' }}>
        {label}
      </span>
      <span style={{ fontSize: 13, fontWeight: 700, color: '#e6edf3', lineHeight: 1, ...valueStyle }}>
        {value}
      </span>
    </div>
  );

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 24,
        height: 46,
        background: 'rgba(22,27,34,0.97)',
        borderBottom: '1px solid rgba(59,130,246,0.18)',
        backdropFilter: 'blur(8px)',
        flexShrink: 0,
        paddingLeft: 16,
        paddingRight: 16,
        position: 'relative',
      }}
    >
      {/* Paused overlay text */}
      {isPaused && (
        <div
          style={{
            position: 'absolute',
            left: 16,
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: '0.18em',
            color: '#e3b341',
            background: 'rgba(227,179,65,0.1)',
            border: '1px solid rgba(227,179,65,0.3)',
            borderRadius: 4,
            padding: '2px 8px',
          }}
        >
          ⏸ PAUSED
        </div>
      )}

      <Stat
        label="Level"
        value={currentLevel ? `${currentLevel.level}${isFinalLevel ? ' (Final)' : ''}` : '—'}
        valueStyle={{ color: isFinalLevel ? '#f85149' : '#e6edf3' }}
      />

      <Divider />

      <Stat
        label="Blinds"
        value={currentLevel
          ? `${currentLevel.sb ?? '?'}/${currentLevel.bb ?? '?'}${currentLevel.ante ? ` · ${currentLevel.ante}` : ''}`
          : '—/—'}
      />

      <Divider />

      {/* Countdown */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
        <span style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.13em', color: '#6e7681', textTransform: 'uppercase' }}>
          {isPaused ? 'Paused at' : 'Level Timer'}
        </span>
        <span
          style={{
            fontSize: 15,
            fontWeight: 700,
            fontFamily: 'monospace',
            color: isPaused ? '#6e7681' : (criticalTime ? '#f85149' : color),
            lineHeight: 1,
          }}
        >
          {remainingMs != null ? formatMs(remainingMs) : '--:--'}
        </span>
      </div>

      <Divider />

      <Stat label="Field" value={activePlayers.length > 0 ? activePlayers.length : '—'} />

      <Divider />

      <Stat
        label="Avg Stack"
        value={avgStack > 0 ? avgStack.toLocaleString() : '—'}
        valueStyle={{ color: '#60a5fa' }}
      />
    </div>
  );
}
