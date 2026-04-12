import React, { useState, useEffect } from 'react';
import { colors } from '../../lib/colors.js';
import { apiFetch } from '../../lib/api.js';

const MODE_OPTIONS = [
  { value: 'coached_cash',   label: 'Coached Cash' },
  { value: 'uncoached_cash', label: 'Auto Cash' },
];

const PRIVACY_OPTIONS = [
  { value: 'open',    label: 'Open',    desc: 'Anyone can join' },
  { value: 'school',  label: 'School',  desc: 'Same school only' },
  { value: 'private', label: 'Private', desc: 'Invitation only' },
];

export default function CreateTableModal({ onClose, onCreated }) {
  const [name, setName]             = useState('');
  const [mode, setMode]             = useState('coached_cash');
  const [sb, setSb]                 = useState(25);
  const [bb, setBb]                 = useState(50);
  const [startingStack, setStack]   = useState(5000);
  const [privacy, setPrivacy]       = useState('open');
  const [presets, setPresets]       = useState([]);
  const [saveAsPreset, setSavePreset] = useState(false);
  const [presetName, setPresetName] = useState('');
  const [busy, setBusy]             = useState(false);
  const [error, setError]           = useState('');
  const [invitedPlayers, setInvitedPlayers] = useState([]);
  const [searchQuery, setSearchQuery]       = useState('');
  const [searchResults, setSearchResults]   = useState([]);

  // Load presets on mount
  useEffect(() => {
    apiFetch('/api/table-presets').then((d) => setPresets(d?.presets ?? [])).catch(() => {});
  }, []);

  // Debounced player search for private table invites
  useEffect(() => {
    if (searchQuery.length < 2) { setSearchResults([]); return; }
    const timer = setTimeout(() => {
      apiFetch(`/api/players/search?q=${encodeURIComponent(searchQuery)}`)
        .then((data) => setSearchResults(data?.players ?? []))
        .catch(() => setSearchResults([]));
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const applyPreset = (preset) => {
    const cfg = preset.config ?? {};
    if (cfg.sb)            setSb(cfg.sb);
    if (cfg.bb)            setBb(cfg.bb);
    if (cfg.startingStack) setStack(cfg.startingStack);
  };

  const handleCreate = async () => {
    if (!name.trim()) { setError('Table name is required.'); return; }
    if (sb <= 0 || bb <= sb) { setError('Big blind must be greater than small blind.'); return; }
    setBusy(true);
    setError('');
    try {
      const table = await apiFetch('/api/tables', {
        method: 'POST',
        body: JSON.stringify({
          name: name.trim(),
          mode,
          privacy,
          config: { sb, bb, startingStack },
        }),
      });
      if (saveAsPreset && presetName.trim()) {
        apiFetch('/api/table-presets', {
          method: 'POST',
          body: JSON.stringify({ name: presetName.trim(), config: { sb, bb, startingStack } }),
        }).catch(() => {});
      }
      // Send invite calls for private tables
      const tableId = table.id ?? table.tableId;
      if (privacy === 'private' && invitedPlayers.length > 0 && tableId) {
        await Promise.allSettled(
          invitedPlayers.map((p) =>
            apiFetch(`/api/tables/${tableId}/invited`, {
              method: 'POST',
              body: JSON.stringify({ playerId: p.id }),
            })
          )
        );
      }
      onCreated(table);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  const inputStyle = { background: colors.bgSurface, border: `1px solid ${colors.borderStrong}`, color: colors.textPrimary };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="flex flex-col gap-5 rounded-xl w-full max-w-sm"
        style={{ background: colors.bgSurfaceRaised, border: `1px solid ${colors.borderStrong}`, padding: 24 }}
      >
        <h2 className="text-sm font-bold tracking-widest uppercase" style={{ color: colors.gold }}>
          New Table
        </h2>

        {/* Preset loader */}
        {presets.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <label className="text-xs tracking-widest uppercase" style={{ color: colors.textMuted }}>Load Preset</label>
            <select
              className="rounded-lg px-3 py-2 text-sm outline-none"
              style={inputStyle}
              defaultValue=""
              onChange={(e) => {
                const p = presets.find((x) => String(x.id) === e.target.value);
                if (p) applyPreset(p);
              }}
            >
              <option value="" disabled>Select a preset…</option>
              {presets.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
        )}

        {/* Table name */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs tracking-widest uppercase" style={{ color: colors.textMuted }}>Table Name</label>
          <input
            className="rounded-lg px-3 py-2 text-sm outline-none"
            style={inputStyle}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Main Table"
            autoFocus
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
          />
        </div>

        {/* Mode */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs tracking-widest uppercase" style={{ color: colors.textMuted }}>Mode</label>
          <div className="flex gap-2 flex-wrap">
            {MODE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setMode(opt.value)}
                className="text-xs px-3 py-1.5 rounded-full font-semibold transition-colors"
                style={
                  mode === opt.value
                    ? { background: 'rgba(212,175,55,0.2)', border: `1px solid rgba(212,175,55,0.5)`, color: colors.gold }
                    : { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: '#6b7280' }
                }
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Blinds */}
        <div className="flex gap-3">
          <div className="flex flex-col gap-1.5 flex-1">
            <label className="text-xs tracking-widest uppercase" style={{ color: colors.textMuted }}>Small Blind</label>
            <input
              type="number" min="1"
              className="rounded-lg px-3 py-2 text-sm outline-none w-full"
              style={inputStyle}
              value={sb}
              onChange={(e) => setSb(Number(e.target.value))}
            />
          </div>
          <div className="flex flex-col gap-1.5 flex-1">
            <label className="text-xs tracking-widest uppercase" style={{ color: colors.textMuted }}>Big Blind</label>
            <input
              type="number" min="1"
              className="rounded-lg px-3 py-2 text-sm outline-none w-full"
              style={inputStyle}
              value={bb}
              onChange={(e) => setBb(Number(e.target.value))}
            />
          </div>
        </div>

        {/* Starting Stack */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs tracking-widest uppercase" style={{ color: colors.textMuted }}>
            Starting Stack <span style={{ color: colors.textSecondary }}>({(startingStack / bb).toFixed(0)} BB)</span>
          </label>
          <input
            type="number" min="1"
            className="rounded-lg px-3 py-2 text-sm outline-none"
            style={inputStyle}
            value={startingStack}
            onChange={(e) => setStack(Number(e.target.value))}
          />
        </div>

        {/* Privacy */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs tracking-widest uppercase" style={{ color: colors.textMuted }}>Privacy</label>
          <div className="flex gap-2 flex-wrap">
            {PRIVACY_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => {
                  setPrivacy(opt.value);
                  if (opt.value !== 'private') {
                    setInvitedPlayers([]);
                    setSearchQuery('');
                    setSearchResults([]);
                  }
                }}
                className="text-xs px-3 py-1.5 rounded-full font-semibold transition-colors"
                title={opt.desc}
                style={
                  privacy === opt.value
                    ? { background: 'rgba(212,175,55,0.2)', border: `1px solid rgba(212,175,55,0.5)`, color: colors.gold }
                    : { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: '#6b7280' }
                }
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Invite players (private tables only) */}
        {privacy === 'private' && (
          <div className="flex flex-col gap-1.5">
            <label className="text-xs tracking-widest uppercase" style={{ color: colors.textMuted }}>Invite Players</label>
            {invitedPlayers.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {invitedPlayers.map((p) => (
                  <span
                    key={p.id}
                    className="flex items-center gap-1 text-xs px-2 py-1 rounded-full"
                    style={{ background: 'rgba(212,175,55,0.12)', border: '1px solid rgba(212,175,55,0.3)', color: colors.gold }}
                  >
                    {p.display_name}
                    <button
                      onClick={() => setInvitedPlayers((prev) => prev.filter((x) => x.id !== p.id))}
                      className="ml-0.5 hover:text-gray-300"
                      style={{ color: colors.textMuted }}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
            <div className="relative">
              <input
                type="text"
                placeholder="Search players..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-lg px-3 py-2 text-sm outline-none"
                style={{ background: colors.bgSurface, border: `1px solid ${colors.borderStrong}`, color: colors.textPrimary }}
              />
              {searchResults.length > 0 && (
                <div
                  className="absolute top-full left-0 right-0 mt-1 rounded-lg overflow-hidden z-10"
                  style={{ background: colors.bgSurfaceRaised, border: `1px solid ${colors.borderStrong}` }}
                >
                  {searchResults
                    .filter((p) => !invitedPlayers.some((ip) => ip.id === p.id))
                    .map((p) => (
                      <button
                        key={p.id}
                        onClick={() => {
                          setInvitedPlayers((prev) => [...prev, p]);
                          setSearchQuery('');
                          setSearchResults([]);
                        }}
                        className="w-full text-left px-3 py-2 text-sm text-gray-200 hover:bg-white/5"
                      >
                        {p.display_name}
                      </button>
                    ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Save as preset */}
        <div className="flex flex-col gap-1.5">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={saveAsPreset}
              onChange={(e) => setSavePreset(e.target.checked)}
              style={{ accentColor: colors.gold }}
            />
            <span className="text-xs" style={{ color: colors.textSecondary }}>Save config as preset</span>
          </label>
          {saveAsPreset && (
            <input
              className="rounded-lg px-3 py-2 text-sm outline-none"
              style={inputStyle}
              value={presetName}
              onChange={(e) => setPresetName(e.target.value)}
              placeholder="Preset name…"
            />
          )}
        </div>

        {error && <p className="text-xs" style={{ color: colors.error }}>{error}</p>}

        <div className="flex gap-3 justify-end">
          <button
            onClick={onClose}
            className="text-xs px-4 py-2 rounded-lg font-semibold uppercase tracking-wider"
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#9ca3af' }}
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={busy}
            className="text-xs px-4 py-2 rounded-lg font-semibold uppercase tracking-wider disabled:opacity-50"
            style={{ background: 'rgba(212,175,55,0.2)', border: `1px solid rgba(212,175,55,0.5)`, color: colors.gold }}
          >
            {busy ? 'Creating…' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  );
}
