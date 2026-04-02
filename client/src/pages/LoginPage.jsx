import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext.jsx';

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

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();

  const [name, setName]         = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!name.trim()) { setError('Name is required.'); return; }
    if (!password)    { setError('Password is required.'); return; }

    setLoading(true);
    try {
      await login(name.trim(), password);
      navigate('/lobby');
    } catch (err) {
      setError(err.message || 'Login failed.');
    } finally {
      setLoading(false);
    }
  };

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
            ♠ POKER TRAINER
          </h1>
          <p className="text-xs text-gray-500 tracking-widest uppercase">
            Texas Hold'em — Coach Platform
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
          <div className="flex flex-col gap-1.5">
            <label className="label-sm">Name</label>
            <AuthInput
              value={name}
              onChange={(e) => { setName(e.target.value); setError(''); }}
              placeholder="Enter your name"
              maxLength={32}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="label-sm">Password</label>
            <AuthInput
              type="password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setError(''); }}
              placeholder="Password"
            />
          </div>

          {error && (
            <p
              data-testid="login-error"
              className="text-xs text-red-400 leading-snug -mt-1"
            >
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="btn-gold w-full py-3 text-sm tracking-widest uppercase"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <span
                  className="inline-block w-3.5 h-3.5 rounded-full border-2 border-current border-t-transparent animate-spin"
                  aria-hidden="true"
                />
                Logging in…
              </span>
            ) : (
              'Log In'
            )}
          </button>
        </form>

        {/* Footer links */}
        <div className="flex flex-col gap-2 items-center">
          <Link
            to="/forgot-password"
            data-testid="forgot-password-link"
            className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
          >
            Forgot password?
          </Link>
          <p className="text-xs text-gray-600">
            New here?{' '}
            <Link
              to="/register"
              data-testid="register-link"
              className="underline"
              style={{ color: '#d4af37' }}
            >
              Create account
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
