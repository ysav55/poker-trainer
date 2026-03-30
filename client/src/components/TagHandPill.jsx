import React, { useState, useEffect } from 'react';

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
  const isActive = gameState && gameState.phase !== 'waiting';
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

export default TagHandPill;
