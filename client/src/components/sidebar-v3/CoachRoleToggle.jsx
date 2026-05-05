import React from 'react';

export default function CoachRoleToggle({ role, onChange }) {
  return (
    <div style={{ display: 'flex', gap: 4 }}>
      <button
        className={'chip' + (role === 'play' ? ' active' : '')}
        onClick={() => onChange?.('play')}
        style={{ padding: '2px 6px' }}
      >
        Play
      </button>
      <button
        className={'chip' + (role === 'monitor' ? ' active' : '')}
        onClick={() => onChange?.('monitor')}
        style={{ padding: '2px 6px' }}
      >
        Monitor 👁
      </button>
    </div>
  );
}
