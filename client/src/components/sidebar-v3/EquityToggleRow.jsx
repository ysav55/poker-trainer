import React from 'react';

export default function EquityToggleRow({ visibility, emit, onShareRange }) {
  const coach = visibility?.coach ?? true;
  const players = visibility?.players ?? false;

  return (
    <div className="row" style={{ gap: 4, marginBottom: 6, alignItems: 'center' }}>
      <button
        className={'chip' + (coach ? ' active' : '')}
        onClick={() => emit?.setCoachEquityVisible?.(!coach)}
        disabled={!emit?.setCoachEquityVisible}
      >
        Show Coach
      </button>
      <button
        className={'chip' + (players ? ' active' : '')}
        onClick={() => emit?.setPlayersEquityVisible?.(!players)}
        disabled={!emit?.setPlayersEquityVisible}
      >
        Show Players
      </button>
      <button
        className="chip"
        onClick={onShareRange}
        style={{ marginLeft: 'auto' }}
      >
        ⬡ Share Range
      </button>
    </div>
  );
}
