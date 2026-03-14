import React, { useEffect, useRef, useCallback } from 'react';

// All 52 cards organized by suit row, then rank column
const SUITS = [
  { key: 's', label: '♠', color: '#f0ece3' },
  { key: 'h', label: '♥', color: '#ef4444' },
  { key: 'd', label: '♦', color: '#ef4444' },
  { key: 'c', label: '♣', color: '#f0ece3' },
];

const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];

const RANK_DISPLAY = {
  T: '10',
  J: 'J',
  Q: 'Q',
  K: 'K',
  A: 'A',
};

function displayRank(r) {
  return RANK_DISPLAY[r] ?? r;
}

export default function CardPicker({ usedCards = new Set(), onSelect, onClose, title }) {
  const gridRef = useRef(null);
  // focusRow, focusCol track arrow-key navigation (null = not navigating)
  const focusRef = useRef({ row: 0, col: 0 });

  // Build flat list of card refs for keyboard nav
  const cellRefs = useRef([]);

  const totalCols = RANKS.length;   // 13
  const totalRows = SUITS.length;   // 4

  const handleKeyDown = useCallback(
    (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }

      const nav = focusRef.current;
      let handled = false;

      if (e.key === 'ArrowRight') {
        nav.col = (nav.col + 1) % totalCols;
        handled = true;
      } else if (e.key === 'ArrowLeft') {
        nav.col = (nav.col - 1 + totalCols) % totalCols;
        handled = true;
      } else if (e.key === 'ArrowDown') {
        nav.row = (nav.row + 1) % totalRows;
        handled = true;
      } else if (e.key === 'ArrowUp') {
        nav.row = (nav.row - 1 + totalRows) % totalRows;
        handled = true;
      } else if (e.key === 'Enter' || e.key === ' ') {
        const idx = nav.row * totalCols + nav.col;
        const cell = cellRefs.current[idx];
        if (cell && !cell.disabled) {
          cell.click();
        }
        handled = true;
      }

      if (handled) {
        e.preventDefault();
        const idx = nav.row * totalCols + nav.col;
        const cell = cellRefs.current[idx];
        if (cell) cell.focus();
      }
    },
    [onClose, totalCols, totalRows]
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // Focus the grid on mount so keyboard nav works immediately
  useEffect(() => {
    if (cellRefs.current[0]) {
      cellRefs.current[0].focus();
    }
  }, []);

  const handleCardClick = useCallback(
    (card) => {
      onSelect(card);
      onClose();
    },
    [onSelect, onClose]
  );

  // Backdrop click closes
  const handleBackdropClick = useCallback(
    (e) => {
      if (e.target === e.currentTarget) onClose();
    },
    [onClose]
  );

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{
        backgroundColor: 'rgba(0, 0, 0, 0.82)',
        animation: 'fadeInBackdrop 0.18s ease-out forwards',
      }}
      onClick={handleBackdropClick}
    >
      <style>{`
        @keyframes fadeInBackdrop {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes scaleInPanel {
          from { opacity: 0; transform: scale(0.92) translateY(8px); }
          to   { opacity: 1; transform: scale(1) translateY(0); }
        }
        .card-picker-panel {
          animation: scaleInPanel 0.2s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
        }
        .card-cell:focus {
          outline: none;
          border-color: #d4af37 !important;
          box-shadow: 0 0 0 2px rgba(212,175,55,0.45);
          z-index: 1;
          position: relative;
        }
        .card-cell:hover:not(:disabled) {
          border-color: #d4af37 !important;
          box-shadow: 0 0 0 1px rgba(212,175,55,0.3);
          background-color: rgba(212,175,55,0.08) !important;
          transform: scale(1.06);
        }
        .card-cell:active:not(:disabled) {
          transform: scale(0.96);
        }
      `}</style>

      {/* Panel */}
      <div
        className="card-picker-panel relative flex flex-col rounded-xl overflow-hidden"
        style={{
          background: '#0d1117',
          border: '1px solid #30363d',
          boxShadow: '0 24px 80px rgba(0,0,0,0.9), 0 0 0 1px rgba(212,175,55,0.08)',
          maxWidth: '90vw',
          maxHeight: '90vh',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4"
          style={{ borderBottom: '1px solid #30363d' }}
        >
          <div className="flex flex-col gap-0.5">
            <span className="label-sm" style={{ color: '#d4af37' }}>
              CARD PICKER
            </span>
            <span
              className="text-sm font-medium"
              style={{ color: '#f0ece3', maxWidth: '380px', lineHeight: 1.3 }}
            >
              {title}
            </span>
          </div>
          <button
            onClick={onClose}
            className="flex items-center justify-center w-8 h-8 rounded-md transition-colors duration-150"
            style={{
              color: '#6e7681',
              background: 'transparent',
              border: '1px solid transparent',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = '#f0ece3';
              e.currentTarget.style.borderColor = '#30363d';
              e.currentTarget.style.background = '#161b22';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = '#6e7681';
              e.currentTarget.style.borderColor = 'transparent';
              e.currentTarget.style.background = 'transparent';
            }}
            aria-label="Close card picker"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path
                d="M12 4L4 12M4 4l8 8"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>

        {/* Grid area */}
        <div className="p-5 overflow-auto">
          <div
            ref={gridRef}
            role="grid"
            aria-label="Card selection grid"
            className="flex flex-col gap-2"
          >
            {SUITS.map((suit, rowIdx) => (
              <div key={suit.key} className="flex items-center gap-2" role="row">
                {/* Suit label */}
                <div
                  className="flex items-center justify-center flex-shrink-0 w-8 h-8 rounded text-lg font-bold select-none"
                  style={{ color: suit.color, minWidth: '2rem' }}
                  aria-label={`Suit ${suit.label}`}
                >
                  {suit.label}
                </div>

                {/* Rank cells */}
                <div className="flex gap-1.5">
                  {RANKS.map((rank, colIdx) => {
                    const card = `${rank}${suit.key}`;
                    const isUsed = usedCards.has(card);
                    const idx = rowIdx * totalCols + colIdx;

                    return (
                      <button
                        key={card}
                        ref={(el) => (cellRefs.current[idx] = el)}
                        role="gridcell"
                        className="card-cell flex flex-col items-center justify-center rounded transition-all duration-100 select-none"
                        disabled={isUsed}
                        onClick={() => !isUsed && handleCardClick(card)}
                        onFocus={() => {
                          focusRef.current = { row: rowIdx, col: colIdx };
                        }}
                        aria-label={`${displayRank(rank)} of ${suit.label}${isUsed ? ' (used)' : ''}`}
                        aria-disabled={isUsed}
                        style={{
                          width: '3rem',
                          height: '3.8rem',
                          background: isUsed ? 'rgba(255,255,255,0.02)' : '#161b22',
                          border: `1px solid ${isUsed ? '#21262d' : '#30363d'}`,
                          cursor: isUsed ? 'not-allowed' : 'pointer',
                          opacity: isUsed ? 0.35 : 1,
                          transition: 'transform 0.1s, border-color 0.1s, box-shadow 0.1s, background 0.1s',
                        }}
                      >
                        {/* Rank */}
                        <span
                          className="font-bold leading-none"
                          style={{
                            fontSize: rank === 'T' ? '11px' : '13px',
                            color: isUsed ? '#444' : suit.color,
                            textDecoration: isUsed ? 'line-through' : 'none',
                          }}
                        >
                          {displayRank(rank)}
                        </span>
                        {/* Suit symbol */}
                        <span
                          className="leading-none mt-0.5"
                          style={{
                            fontSize: '15px',
                            color: isUsed ? '#333' : suit.color,
                            lineHeight: 1,
                          }}
                        >
                          {suit.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          {/* Legend */}
          <div
            className="flex items-center gap-4 mt-4 pt-3"
            style={{ borderTop: '1px solid #21262d' }}
          >
            <div className="flex items-center gap-1.5">
              <div
                className="w-4 h-4 rounded-sm"
                style={{
                  background: '#161b22',
                  border: '1px solid #30363d',
                }}
              />
              <span className="label-sm">Available</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div
                className="w-4 h-4 rounded-sm opacity-35"
                style={{
                  background: 'rgba(255,255,255,0.02)',
                  border: '1px solid #21262d',
                }}
              />
              <span className="label-sm">In use</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div
                className="w-4 h-4 rounded-sm"
                style={{
                  background: 'rgba(212,175,55,0.08)',
                  border: '1px solid #d4af37',
                }}
              />
              <span className="label-sm">Selected / Focus</span>
            </div>
            <span className="label-sm ml-auto" style={{ color: '#444' }}>
              ESC to close · Arrow keys to navigate · Enter to select
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
