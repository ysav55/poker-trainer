import React, { useState } from 'react';
import { Link } from 'react-router-dom';

const INPUT_STYLE = {
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.1)',
  caretColor: '#d4af37',
};

function AuthInput({ type = 'text', value, onChange, placeholder, maxLength, disabled }) {
  return (
    <input
      type={type}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      maxLength={maxLength}
      disabled={disabled}
      className="w-full rounded-lg px-3 py-2.5 text-sm text-gray-100 placeholder-gray-600 outline-none transition-all duration-150 disabled:opacity-50"
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

export default function ForgotPasswordPage() {
  const [name, setName]       = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;

    setLoading(true);
    // No backend endpoint yet — contact-coach flow
    setLoading(false);
    setSubmitted(true);
  };

  return (
    <div
      className="min-h-screen w-screen flex items-center justify-center"
      style={{ background: '#060a0f' }}
    >
      {/* Ambient glow */}
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
          <p className="text-xs text-gray-500 tracking-widest uppercase">Reset Password</p>
        </div>

        {submitted ? (
          /* ── Confirmation state ── */
          <div className="flex flex-col gap-5">
            <div
              className="rounded-lg px-4 py-4 text-sm leading-relaxed text-center"
              style={{
                background: 'rgba(74,222,128,0.07)',
                border: '1px solid rgba(74,222,128,0.25)',
                color: '#86efac',
              }}
              data-testid="reset-confirmation"
            >
              <p className="font-semibold mb-1">Request received</p>
              <p className="text-xs text-gray-400 leading-relaxed">
                Password resets are handled by your coach or administrator.
                Please reach out to them directly and they will reset your
                account within 1 business day.
              </p>
            </div>

            <Link
              to="/login"
              className="text-center text-xs underline"
              style={{ color: '#d4af37' }}
            >
              Back to login
            </Link>
          </div>
        ) : (
          /* ── Request form ── */
          <>
            <p className="text-xs text-gray-500 leading-relaxed">
              Enter your account name and we'll notify your coach to reset
              your password.
            </p>

            <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
              <div className="flex flex-col gap-1.5">
                <label className="label-sm">Account Name</label>
                <AuthInput
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your display name"
                  maxLength={32}
                  disabled={loading}
                />
              </div>

              <button
                type="submit"
                disabled={loading || !name.trim()}
                className="btn-gold w-full py-3 text-sm tracking-widest uppercase disabled:opacity-50"
              >
                {loading ? 'Sending…' : 'Request Reset'}
              </button>
            </form>

            <p className="text-center text-xs text-gray-600">
              Remember it?{' '}
              <Link to="/login" className="underline" style={{ color: '#d4af37' }}>
                Sign in
              </Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
