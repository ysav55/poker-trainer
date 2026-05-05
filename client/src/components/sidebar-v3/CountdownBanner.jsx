import React, { useState, useEffect } from 'react';

export default function CountdownBanner({ active, onCancel, onResume, paused, onStart, durationSeconds = 5 }) {
  const [secondsLeft, setSecondsLeft] = useState(durationSeconds);

  useEffect(() => {
    if (!active || paused) {
      setSecondsLeft(durationSeconds);
      return undefined;
    }

    setSecondsLeft(durationSeconds);
    const id = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          clearInterval(id);
          onStart?.();
          return 0;
        }
        return s - 1;
      });
    }, 1000);

    return () => clearInterval(id);
  }, [active, paused, durationSeconds, onStart]);

  if (!active && !paused) return null;

  return (
    <div
      role="status"
      style={{
        background: 'rgba(74,217,145,0.1)',
        border: '1px solid var(--ok)',
        borderRadius: 6,
        padding: '6px 10px',
        marginBottom: 8,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
      }}
    >
      {paused ? (
        <>
          <span style={{ flex: 1, fontSize: 11 }}>Drill paused</span>
          <button className="btn primary sm" onClick={onResume}>
            Resume Drill
          </button>
        </>
      ) : (
        <>
          <span style={{ flex: 1, fontSize: 11 }}>
            ▶ Auto-starting next hand in {secondsLeft}s
          </span>
          <button className="btn ghost sm" onClick={onCancel}>
            Cancel
          </button>
        </>
      )}
    </div>
  );
}
