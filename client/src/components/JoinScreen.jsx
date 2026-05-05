import React, { useState } from 'react';
import ConnectionDot from './ConnectionDot';

const INPUT_STYLE = {
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.1)',
  caretColor: '#d4af37',
};

function AuthInput({ type = 'text', value, onChange, placeholder, maxLength }) {
  return (
    <input
      type={type}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      maxLength={maxLength}
      className="w-full rounded-lg px-3 py-2.5 text-sm text-gray-100 placeholder-gray-600 outline-none transition-all duration-150"
      style={INPUT_STYLE}
      onFocus={(e) => {
        e.target.style.borderColor = 'rgba(212,175,55,0.45)';
        e.target.style.boxShadow = '0 0 0 3px rgba(212,175,55,0.08)';
      }}
      onBlur={(e) => {
        e.target.style.borderColor = 'rgba(255,255,255,0.1)';
        e.target.style.boxShadow = 'none';
      }}
    />
  );
}

const API_BASE = import.meta.env.DEV ? 'http://localhost:3001' : '';

function JoinScreen({ joinRoom, connected }) {
  const [mode, setMode]       = useState('login');
  const [name, setName]       = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]     = useState('');
  const [loading, setLoading] = useState(false);

  const clearFields = (newMode) => {
    setMode(newMode);
    setError('');
    setPassword('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (mode === 'spectate') {
      if (!name.trim() || name.trim().length < 2) { setError('Name must be at least 2 characters.'); return; }
      joinRoom(name.trim(), 'spectator');
      return;
    }

    if (!name.trim()) { setError('Name is required.'); return; }
    if (!password)    { setError('Password is required.'); return; }

    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || 'Login failed.');
        setLoading(false);
        return;
      }
      // Store JWT and stableId for reconnects
      sessionStorage.setItem('poker_trainer_jwt', data.token);
      sessionStorage.setItem('poker_trainer_player_id', data.stableId);
      joinRoom(data.name, data.role === 'coach' ? 'coach' : 'player');
    } catch {
      setError('Network error — is the server running?');
    }
    setLoading(false);
  };

  const TABS = [
    { key: 'login',   label: 'Log In' },
    { key: 'spectate', label: 'Spectate' },
  ];

  const submitLabel = {
    login:   loading ? 'Logging in…' : 'Log In',
    spectate: loading ? 'Joining…'    : 'Watch as Spectator',
  }[mode];

  return (
    <div
      className="min-h-screen w-screen flex items-center justify-center"
      style={{ background: '#060a0f' }}
    >
      {/* Ambient background glow */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse 60% 50% at 50% 50%, rgba(212,175,55,0.04) 0%, transparent 70%)',
        }}
      />

      <div
        className="relative w-full max-w-sm rounded-2xl px-8 py-10 flex flex-col gap-6"
        style={{
          background: 'rgba(13, 17, 23, 0.97)',
          border: '1px solid rgba(212,175,55,0.18)',
          boxShadow: '0 8px 60px rgba(0,0,0,0.8), 0 0 0 1px rgba(255,255,255,0.03)',
        }}
      >
        {/* Header */}
        <div className="flex flex-col items-center gap-1.5">
          <h1
            className="text-2xl font-black tracking-[0.25em] uppercase leading-none"
            style={{ color: '#d4af37', textShadow: '0 0 30px rgba(212,175,55,0.35)' }}
          >
            POKER TRAINING
          </h1>
          <p className="text-xs text-gray-500 tracking-widest uppercase">
            Texas Hold'em — Coach Platform
          </p>
        </div>

        {/* Mode tabs */}
        <div className="flex rounded-lg overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.08)' }}>
          {TABS.map((tab, i) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => clearFields(tab.key)}
              className="flex-1 py-2 text-xs font-semibold uppercase tracking-widest transition-all duration-150"
              style={{
                background: mode === tab.key ? 'rgba(212,175,55,0.15)' : 'transparent',
                color: mode === tab.key ? '#d4af37' : 'rgba(156,163,175,0.7)',
                borderRight: i < TABS.length - 1 ? '1px solid rgba(255,255,255,0.08)' : 'none',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
          {/* Name — always shown */}
          <div className="flex flex-col gap-1.5">
            <label className="label-sm">{mode === 'spectate' ? 'Display Name' : 'Name'}</label>
            <AuthInput
              value={name}
              onChange={(e) => { setName(e.target.value); setError(''); }}
              placeholder="Enter your name"
              maxLength={32}
            />
          </div>

          {/* Password — login only */}
          {mode === 'login' && (
            <div className="flex flex-col gap-1.5">
              <label className="label-sm">Password</label>
              <AuthInput
                type="password"
                value={password}
                onChange={(e) => { setPassword(e.target.value); setError(''); }}
                placeholder="Password"
              />
            </div>
          )}

          {/* Error message */}
          {error && (
            <p className="text-xs text-red-400 leading-snug -mt-1">{error}</p>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={loading || !connected}
            className="btn-gold w-full py-3 text-sm tracking-widest uppercase"
          >
            {submitLabel}
          </button>
        </form>

        {/* Connection status */}
        <div className="flex justify-center">
          <ConnectionDot connected={connected} />
        </div>
      </div>
    </div>
  );
}

export default JoinScreen;
