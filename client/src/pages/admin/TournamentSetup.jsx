import React, { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '../../lib/api.js';

// ── Constants ─────────────────────────────────────────────────────────────────

const DEFAULT_LEVEL = { sb: 25, bb: 50, ante: 0, durationMin: 20 };

function makeLevel(prevLevel) {
  if (!prevLevel) return { ...DEFAULT_LEVEL };
  return {
    sb: prevLevel.sb * 2,
    bb: prevLevel.bb * 2,
    ante: prevLevel.ante ? prevLevel.ante * 2 : 0,
    durationMin: prevLevel.durationMin,
  };
}

// ── Sub-components ────────────────────────────────────────────────────────────

function NumberInput({ value, onChange, width = 80, min = 0, placeholder = '' }) {
  return (
    <input
      type="number"
      value={value}
      min={min}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))}
      className="rounded text-sm outline-none text-center"
      style={{
        width,
        background: '#0d1117',
        border: '1px solid #30363d',
        color: '#f0ece3',
        padding: '5px 6px',
      }}
      onFocus={(e)  => { e.currentTarget.style.borderColor = '#d4af37'; }}
      onBlur={(e)   => { e.currentTarget.style.borderColor = '#30363d'; }}
    />
  );
}

function LevelRow({ index, level, isFirst, isLast, onChange, onMove, onRemove }) {
  const handleField = (field) => (val) => onChange(index, { ...level, [field]: val });

  return (
    <div
      className="flex items-center gap-2 rounded-lg px-3 py-2.5"
      style={{ background: index % 2 === 0 ? '#0d1117' : 'rgba(22,27,34,0.6)', border: '1px solid #21262d' }}
    >
      {/* Level badge */}
      <span
        className="text-xs font-bold tracking-wider flex-shrink-0"
        style={{
          minWidth: '48px',
          textAlign: 'center',
          background: 'rgba(212,175,55,0.12)',
          border: '1px solid rgba(212,175,55,0.25)',
          borderRadius: '4px',
          padding: '3px 6px',
          color: '#d4af37',
        }}
      >
        LVL {index + 1}
      </span>

      {/* SB */}
      <div className="flex flex-col items-center gap-0.5">
        <span className="text-xs" style={{ color: '#6e7681' }}>SB</span>
        <NumberInput value={level.sb} onChange={handleField('sb')} width={72} min={1} />
      </div>

      {/* BB */}
      <div className="flex flex-col items-center gap-0.5">
        <span className="text-xs" style={{ color: '#6e7681' }}>BB</span>
        <NumberInput value={level.bb} onChange={handleField('bb')} width={72} min={1} />
      </div>

      {/* Ante */}
      <div className="flex flex-col items-center gap-0.5">
        <span className="text-xs" style={{ color: '#6e7681' }}>Ante</span>
        <NumberInput value={level.ante} onChange={handleField('ante')} width={64} min={0} />
      </div>

      {/* Duration */}
      <div className="flex flex-col items-center gap-0.5">
        <span className="text-xs" style={{ color: '#6e7681' }}>Min</span>
        <NumberInput value={level.durationMin} onChange={handleField('durationMin')} width={56} min={1} />
      </div>

      {/* Up/Down/Delete */}
      <div className="flex items-center gap-1 ml-auto flex-shrink-0">
        <button
          onClick={() => onMove(index, -1)}
          disabled={isFirst}
          title="Move up"
          style={{
            background: 'none',
            border: '1px solid #30363d',
            borderRadius: '4px',
            color: isFirst ? '#30363d' : '#8b949e',
            cursor: isFirst ? 'not-allowed' : 'pointer',
            width: '26px',
            height: '26px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '12px',
          }}
          onMouseEnter={(e) => { if (!isFirst) e.currentTarget.style.borderColor = '#d4af37'; }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#30363d'; }}
        >
          ▲
        </button>
        <button
          onClick={() => onMove(index, 1)}
          disabled={isLast}
          title="Move down"
          style={{
            background: 'none',
            border: '1px solid #30363d',
            borderRadius: '4px',
            color: isLast ? '#30363d' : '#8b949e',
            cursor: isLast ? 'not-allowed' : 'pointer',
            width: '26px',
            height: '26px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '12px',
          }}
          onMouseEnter={(e) => { if (!isLast) e.currentTarget.style.borderColor = '#d4af37'; }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#30363d'; }}
        >
          ▼
        </button>
        <button
          onClick={() => onRemove(index)}
          title="Remove level"
          style={{
            background: 'none',
            border: '1px solid rgba(248,81,73,0.25)',
            borderRadius: '4px',
            color: '#f85149',
            cursor: 'pointer',
            width: '26px',
            height: '26px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '13px',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'rgba(248,81,73,0.65)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(248,81,73,0.25)'; }}
        >
          ✕
        </button>
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function TournamentSetup() {
  const navigate = useNavigate();

  const [name, setName]                     = useState('');
  const [levels, setLevels]                 = useState([{ ...DEFAULT_LEVEL }]);
  const [startingStack, setStartingStack]   = useState(10000);
  const [rebuyEnabled, setRebuyEnabled]     = useState(false);
  const [rebuyCap, setRebuyCap]             = useState(3);
  const [saving, setSaving]                 = useState(false);
  const [error, setError]                   = useState(null);

  // ── Level editors ──────────────────────────────────────────────────────────

  const handleLevelChange = useCallback((idx, updated) => {
    setLevels((prev) => prev.map((l, i) => (i === idx ? updated : l)));
  }, []);

  const handleMove = useCallback((idx, dir) => {
    setLevels((prev) => {
      const next = [...prev];
      const target = idx + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
  }, []);

  const handleRemove = useCallback((idx) => {
    setLevels((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  const handleAddLevel = useCallback(() => {
    setLevels((prev) => {
      const last = prev[prev.length - 1] ?? null;
      return [...prev, makeLevel(last)];
    });
  }, []);

  // ── Submit ─────────────────────────────────────────────────────────────────

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    if (!name.trim()) { setError('Tournament name is required.'); return; }
    if (levels.length === 0) { setError('Add at least one blind level.'); return; }
    if (!startingStack || startingStack < 100) { setError('Starting stack must be at least 100.'); return; }

    const payload = {
      name: name.trim(),
      blindSchedule: levels.map((l) => ({
        sb:          Number(l.sb)          || 0,
        bb:          Number(l.bb)          || 0,
        ante:        Number(l.ante)        || 0,
        durationMs:  (Number(l.durationMin) || 20) * 60_000,
      })),
      startingStack: Number(startingStack),
      rebuy: rebuyEnabled,
      ...(rebuyEnabled ? { rebuyCap: Number(rebuyCap) } : {}),
    };

    setSaving(true);
    try {
      const data = await apiFetch('/api/admin/tournaments', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      // Navigate to the newly created table
      const tableId = data?.tableId ?? data?.id;
      if (tableId) {
        navigate(`/table/${tableId}`);
      } else {
        navigate('/lobby');
      }
    } catch (err) {
      setError(err.message || 'Failed to create tournament.');
      setSaving(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="p-6" style={{ color: '#f0ece3' }}>
      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-lg font-bold tracking-[0.12em]" style={{ color: '#d4af37' }}>
            NEW TOURNAMENT
          </h1>
          <p className="text-xs mt-0.5" style={{ color: '#6e7681' }}>
            Configure blind schedule, stacks, and settings
          </p>
        </div>
        <button
          onClick={() => navigate(-1)}
          className="px-3 py-1.5 rounded text-sm"
          style={{ background: 'none', border: '1px solid #30363d', color: '#8b949e', cursor: 'pointer' }}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#d4af37'; e.currentTarget.style.color = '#d4af37'; }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#30363d'; e.currentTarget.style.color = '#8b949e'; }}
        >
          ← Back
        </button>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-5" style={{ maxWidth: '680px' }}>

        {/* ── Tournament name ─────────────────────────────────────────────── */}
        <div
          className="rounded-lg px-5 py-4 flex flex-col gap-3"
          style={{ background: '#161b22', border: '1px solid #30363d' }}
        >
          <h2 className="text-xs font-bold tracking-[0.14em]" style={{ color: '#8b949e' }}>
            BASICS
          </h2>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium" style={{ color: '#6e7681' }}>
              Tournament Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Friday Night Freezeout"
              required
              className="rounded px-3 py-2 text-sm outline-none"
              style={{ background: '#0d1117', border: '1px solid #30363d', color: '#f0ece3' }}
              onFocus={(e)  => { e.currentTarget.style.borderColor = '#d4af37'; }}
              onBlur={(e)   => { e.currentTarget.style.borderColor = '#30363d'; }}
            />
          </div>

          <div className="flex items-center gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium" style={{ color: '#6e7681' }}>
                Starting Stack
              </label>
              <NumberInput
                value={startingStack}
                onChange={setStartingStack}
                width={120}
                min={100}
              />
            </div>
          </div>
        </div>

        {/* ── Rebuy settings ──────────────────────────────────────────────── */}
        <div
          className="rounded-lg px-5 py-4 flex flex-col gap-3"
          style={{ background: '#161b22', border: '1px solid #30363d' }}
        >
          <h2 className="text-xs font-bold tracking-[0.14em]" style={{ color: '#8b949e' }}>
            REBUY
          </h2>
          <label
            className="flex items-center gap-3 cursor-pointer select-none"
            style={{ width: 'fit-content' }}
          >
            {/* Custom checkbox */}
            <span
              onClick={() => setRebuyEnabled((v) => !v)}
              style={{
                width: '18px',
                height: '18px',
                borderRadius: '4px',
                border: `2px solid ${rebuyEnabled ? '#d4af37' : '#30363d'}`,
                background: rebuyEnabled ? 'rgba(212,175,55,0.18)' : 'transparent',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                transition: 'border-color 0.15s, background 0.15s',
                cursor: 'pointer',
              }}
            >
              {rebuyEnabled && (
                <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                  <path d="M1 4l3 3 5-6" stroke="#d4af37" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </span>
            <span className="text-sm" style={{ color: rebuyEnabled ? '#f0ece3' : '#8b949e' }}>
              Allow rebuys
            </span>
          </label>

          {rebuyEnabled && (
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium" style={{ color: '#6e7681' }}>
                Rebuy level cap (last level rebuys are allowed)
              </label>
              <NumberInput value={rebuyCap} onChange={setRebuyCap} width={80} min={1} />
            </div>
          )}
        </div>

        {/* ── Blind schedule ──────────────────────────────────────────────── */}
        <div
          className="rounded-lg px-5 py-4 flex flex-col gap-3"
          style={{ background: '#161b22', border: '1px solid #30363d' }}
        >
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-bold tracking-[0.14em]" style={{ color: '#8b949e' }}>
              BLIND SCHEDULE
            </h2>
            <span className="text-xs" style={{ color: '#6e7681' }}>
              {levels.length} level{levels.length !== 1 ? 's' : ''}
            </span>
          </div>

          {/* Column headers */}
          {levels.length > 0 && (
            <div className="flex items-center gap-2 px-3">
              <span style={{ minWidth: '48px' }} />
              {['SB', 'BB', 'Ante', 'Min'].map((h, i) => (
                <span
                  key={h}
                  className="text-xs font-semibold tracking-wider text-center"
                  style={{ color: '#6e7681', width: i === 0 ? '72px' : i === 1 ? '72px' : i === 2 ? '64px' : '56px', flexShrink: 0 }}
                >
                  {h}
                </span>
              ))}
            </div>
          )}

          {levels.length === 0 && (
            <div
              className="rounded-lg flex items-center justify-center py-8 text-sm"
              style={{ background: '#0d1117', border: '1px dashed #30363d', color: '#6e7681' }}
            >
              No levels yet. Add one below.
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            {levels.map((level, idx) => (
              <LevelRow
                key={idx}
                index={idx}
                level={level}
                isFirst={idx === 0}
                isLast={idx === levels.length - 1}
                onChange={handleLevelChange}
                onMove={handleMove}
                onRemove={handleRemove}
              />
            ))}
          </div>

          <button
            type="button"
            onClick={handleAddLevel}
            className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors"
            style={{
              background: 'none',
              border: '1px dashed rgba(212,175,55,0.3)',
              color: '#d4af37',
              cursor: 'pointer',
              width: '100%',
              justifyContent: 'center',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = 'rgba(212,175,55,0.65)';
              e.currentTarget.style.background = 'rgba(212,175,55,0.04)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = 'rgba(212,175,55,0.3)';
              e.currentTarget.style.background = 'none';
            }}
          >
            + Add Level
          </button>
        </div>

        {/* ── Error ───────────────────────────────────────────────────────── */}
        {error && (
          <div
            className="rounded px-4 py-3 text-sm"
            style={{ background: 'rgba(248,81,73,0.1)', border: '1px solid rgba(248,81,73,0.3)', color: '#f85149' }}
          >
            {error}
          </div>
        )}

        {/* ── Submit ──────────────────────────────────────────────────────── */}
        <button
          type="submit"
          disabled={saving}
          className="px-6 py-3 rounded-lg font-bold tracking-widest text-sm transition-colors"
          style={{
            background: saving ? 'rgba(212,175,55,0.35)' : '#d4af37',
            border: '1px solid transparent',
            color: saving ? '#888' : '#0d1117',
            cursor: saving ? 'not-allowed' : 'pointer',
            opacity: saving ? 0.75 : 1,
          }}
          onMouseEnter={(e) => { if (!saving) e.currentTarget.style.background = '#c9a227'; }}
          onMouseLeave={(e) => { if (!saving) e.currentTarget.style.background = '#d4af37'; }}
        >
          {saving ? 'CREATING…' : 'CREATE TOURNAMENT'}
        </button>
      </form>
    </div>
  );
}
