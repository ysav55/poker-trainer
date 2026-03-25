import React from 'react';

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

export default ConnectionDot;
