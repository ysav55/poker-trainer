import React, { useState, useEffect } from 'react';

const SPEEDS = [
  { label: '0.5×', ms: 2000 },
  { label: '1×',   ms: 1000 },
  { label: '2×',   ms: 500 },
  { label: '4×',   ms: 250 },
];

/**
 * ScrubberStrip
 *
 * Replay timeline scrubber with autoplay and speed control.
 *
 * Props:
 *   cursor: number — current action index (-1 = before start)
 *   totalActions: number — total non-reverted actions in replay
 *   onJumpTo: (index: number) => void — called on slider drag
 *   onStepBack: () => void — called on prev button
 *   onStepForward: () => void — called on next button + autoplay tick
 */
export default function ScrubberStrip({ cursor, totalActions, onJumpTo, onStepBack, onStepForward }) {
  const [playing, setPlaying] = useState(false);
  const [speedIdx, setSpeedIdx] = useState(1); // default 1×

  const atStart = cursor <= -1;
  const atEnd = cursor >= totalActions - 1;

  // Auto-stop when reaching the end
  useEffect(() => {
    if (atEnd) setPlaying(false);
  }, [atEnd]);

  // Autoplay tick
  useEffect(() => {
    if (!playing || atEnd) return undefined;
    const id = setInterval(() => {
      onStepForward?.();
    }, SPEEDS[speedIdx].ms);
    return () => clearInterval(id);
  }, [playing, speedIdx, atEnd, onStepForward]);

  return (
    <div className="row" style={{ gap: 6, alignItems: 'center', marginBottom: 8 }}>
      {/* Prev button */}
      <button
        className="btn sm ghost"
        data-testid="scrubber-prev"
        onClick={onStepBack}
        disabled={atStart}
        title="Previous action"
      >◀</button>

      {/* Play / Pause button */}
      <button
        className={'btn sm' + (playing ? ' primary' : '')}
        data-testid="scrubber-play"
        onClick={() => setPlaying((p) => !p)}
        disabled={atEnd && !playing}
        title={playing ? 'Pause' : 'Play'}
      >{playing ? '❚❚' : '▶'}</button>

      {/* Next button */}
      <button
        className="btn sm ghost"
        data-testid="scrubber-next"
        onClick={onStepForward}
        disabled={atEnd}
        title="Next action"
      >▶</button>

      {/* Timeline scrubber */}
      <input
        type="range"
        role="slider"
        min={0}
        max={Math.max(0, totalActions)}
        value={Math.max(0, cursor + 1)}
        onChange={(e) => onJumpTo?.(parseInt(e.target.value, 10) - 1)}
        style={{ flex: 1 }}
        aria-label="Action timeline"
        data-testid="scrubber-range"
      />

      {/* Speed buttons */}
      <div style={{ display: 'flex', gap: 2 }}>
        {SPEEDS.map((s, i) => (
          <button
            key={s.label}
            className={'chip' + (i === speedIdx ? ' active' : '')}
            onClick={() => setSpeedIdx(i)}
            style={{ padding: '2px 5px', fontSize: 10 }}
            data-testid={`speed-${s.label}`}
          >{s.label}</button>
        ))}
      </div>
    </div>
  );
}
