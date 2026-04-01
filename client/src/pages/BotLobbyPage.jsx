import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext.jsx';
import { apiFetch } from '../lib/api.js';
import BotTableCard from '../components/BotTableCard.jsx';

const GOLD  = '#d4af37';

// ── Difficulty options ─────────────────────────────────────────────────────────

const DIFFICULTY_OPTIONS = [
  { value: 'easy',   label: 'Easy'   },
  { value: 'medium', label: 'Medium' },
  { value: 'hard',   label: 'Hard'   },
];

// ── Create Bot Table Modal ─────────────────────────────────────────────────────

function CreateBotTableModal({ onClose, onCreated }) {
  const [difficulty,  setDifficulty]  = useState('medium');
  const [humanSeats,  setHumanSeats]  = useState(1);
  const [smallBlind,  setSmallBlind]  = useState(25);
  const [bigBlind,    setBigBlind]    = useState(50);
  const [busy,        setBusy]        = useState(false);
  const [error,       setError]       = useState('');

  const handleCreate = async () => {
    setBusy(true);
    setError('');
    try {
      const table = await apiFetch('/api/bot-tables', {
        method: 'POST',
        body: JSON.stringify({
          difficulty,
          human_seat_count: humanSeats,
          small_blind: smallBlind,
          big_blind: bigBlind,
        }),
      });
      onCreated(table);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
      data-testid="create-bot-modal"
    >
      <div
        className="flex flex-col gap-5 rounded-xl w-full max-w-sm"
        style={{ background: '#161b22', border: '1px solid #30363d', padding: 24 }}
      >
        <h2 className="text-sm font-bold tracking-widest uppercase" style={{ color: GOLD }}>
          New Bot Game
        </h2>

        {/* Difficulty */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs text-gray-500 tracking-widest uppercase">Difficulty</label>
          <div className="flex gap-2">
            {DIFFICULTY_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                data-testid={`difficulty-${opt.value}`}
                onClick={() => setDifficulty(opt.value)}
                className="text-xs px-3 py-1.5 rounded-full font-semibold transition-colors"
                style={
                  difficulty === opt.value
                    ? { background: 'rgba(212,175,55,0.2)', border: '1px solid rgba(212,175,55,0.5)', color: GOLD }
                    : { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: '#6b7280' }
                }
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Human seat count */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs text-gray-500 tracking-widest uppercase">
            Human Seats <span className="text-gray-600">(bots fill the rest up to 9)</span>
          </label>
          <input
            type="number"
            min={1}
            max={8}
            data-testid="human-seats-input"
            className="rounded-lg px-3 py-2 text-sm text-gray-100 outline-none"
            style={{ background: '#0d1117', border: '1px solid #30363d', width: 80 }}
            value={humanSeats}
            onChange={(e) => setHumanSeats(Math.min(8, Math.max(1, Number(e.target.value))))}
          />
        </div>

        {/* Blinds */}
        <div className="flex gap-4">
          <div className="flex flex-col gap-1.5 flex-1">
            <label className="text-xs text-gray-500 tracking-widest uppercase">Small Blind</label>
            <input
              type="number"
              min={1}
              data-testid="small-blind-input"
              className="rounded-lg px-3 py-2 text-sm text-gray-100 outline-none"
              style={{ background: '#0d1117', border: '1px solid #30363d' }}
              value={smallBlind}
              onChange={(e) => setSmallBlind(Math.max(1, Number(e.target.value)))}
            />
          </div>
          <div className="flex flex-col gap-1.5 flex-1">
            <label className="text-xs text-gray-500 tracking-widest uppercase">Big Blind</label>
            <input
              type="number"
              min={1}
              data-testid="big-blind-input"
              className="rounded-lg px-3 py-2 text-sm text-gray-100 outline-none"
              style={{ background: '#0d1117', border: '1px solid #30363d' }}
              value={bigBlind}
              onChange={(e) => setBigBlind(Math.max(1, Number(e.target.value)))}
            />
          </div>
        </div>

        {error && <p className="text-xs text-red-400" data-testid="modal-error">{error}</p>}

        {/* Actions */}
        <div className="flex gap-3 justify-end mt-1">
          <button
            onClick={onClose}
            data-testid="modal-cancel"
            className="text-xs px-4 py-2 rounded-lg font-semibold uppercase tracking-wider"
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#9ca3af' }}
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={busy}
            data-testid="modal-submit"
            className="text-xs px-4 py-2 rounded-lg font-semibold uppercase tracking-wider transition-opacity hover:opacity-80 disabled:opacity-50"
            style={{ background: 'rgba(212,175,55,0.2)', border: '1px solid rgba(212,175,55,0.5)', color: GOLD }}
          >
            {busy ? 'Starting…' : 'Start Game'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── BotLobbyPage ───────────────────────────────────────────────────────────────

export default function BotLobbyPage() {
  const { user } = useAuth();
  const navigate  = useNavigate();

  const [tables,     setTables]     = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState('');
  const [showModal,  setShowModal]  = useState(false);

  useEffect(() => {
    setLoading(true);
    apiFetch('/api/bot-tables')
      .then((data) => setTables(data?.tables ?? data ?? []))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const handleCreated = useCallback((table) => {
    setShowModal(false);
    const tableId = table.id ?? table.tableId;
    if (tableId) navigate(`/game/${tableId}`);
  }, [navigate]);

  const handleJoin = useCallback((tableId) => {
    navigate(`/game/${tableId}`);
  }, [navigate]);

  return (
    <div
      className="min-h-screen w-screen flex flex-col"
      style={{ background: '#0d1117', color: '#e5e7eb' }}
    >
      {/* Ambient glow */}
      <div
        className="fixed inset-0 pointer-events-none"
        style={{ background: 'radial-gradient(ellipse 80% 40% at 50% 0%, rgba(212,175,55,0.025) 0%, transparent 60%)' }}
      />

      {/* Top bar */}
      <header
        className="relative z-40 flex items-center justify-between px-5 flex-shrink-0"
        style={{ height: 48, background: '#0d1117', borderBottom: '1px solid #30363d' }}
      >
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/lobby')}
            className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
            data-testid="back-to-lobby"
          >
            ← Lobby
          </button>
          <span style={{ color: '#30363d' }}>|</span>
          <span className="text-base font-black tracking-[0.15em] uppercase" style={{ color: GOLD }}>
            Play vs Bots
          </span>
        </div>
        <span className="text-sm text-gray-400 hidden sm:inline">{user?.name}</span>
      </header>

      {/* Body */}
      <main className="relative flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-4 py-6 flex flex-col gap-5">

          {/* Header row */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-lg font-bold text-white">Bot Tables</h1>
              <p className="text-xs text-gray-500 mt-0.5">Practice against AI opponents at any difficulty</p>
            </div>
            <button
              onClick={() => setShowModal(true)}
              data-testid="new-game-button"
              className="text-xs px-4 py-2 rounded-lg font-semibold uppercase tracking-wider transition-opacity hover:opacity-80"
              style={{ background: 'rgba(212,175,55,0.15)', border: '1px solid rgba(212,175,55,0.45)', color: GOLD }}
            >
              + New Game
            </button>
          </div>

          {error && <p className="text-sm text-red-400" data-testid="fetch-error">{error}</p>}

          {/* Table list */}
          {loading ? (
            <p className="text-sm text-gray-500" data-testid="loading-state">Loading bot tables…</p>
          ) : tables.length === 0 ? (
            <div
              className="flex flex-col items-center justify-center rounded-xl py-16 gap-3"
              style={{ border: '1px dashed rgba(212,175,55,0.3)', background: 'rgba(212,175,55,0.02)' }}
              data-testid="empty-state"
            >
              <span style={{ fontSize: 36 }}>🤖</span>
              <p className="text-sm text-gray-500">No active bot tables.</p>
              <button
                onClick={() => setShowModal(true)}
                className="text-xs px-4 py-2 rounded-lg font-semibold uppercase tracking-wider transition-opacity hover:opacity-80 mt-1"
                style={{ background: 'rgba(212,175,55,0.15)', border: '1px solid rgba(212,175,55,0.45)', color: GOLD }}
              >
                Start a Game
              </button>
            </div>
          ) : (
            <div
              data-testid="table-list"
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
                gap: 12,
              }}
            >
              {tables.map((table) => (
                <BotTableCard
                  key={table.id ?? table.tableId}
                  table={table}
                  onJoin={handleJoin}
                />
              ))}
            </div>
          )}
        </div>
      </main>

      {showModal && (
        <CreateBotTableModal
          onClose={() => setShowModal(false)}
          onCreated={handleCreated}
        />
      )}
    </div>
  );
}
