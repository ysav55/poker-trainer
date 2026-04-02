import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext.jsx';

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

function TabButton({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex-1 py-2 text-sm font-semibold tracking-wider uppercase transition-all duration-150"
      style={
        active
          ? { color: '#d4af37', borderBottom: '2px solid #d4af37' }
          : { color: '#6b7280', borderBottom: '2px solid transparent' }
      }
    >
      {children}
    </button>
  );
}

export default function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();

  const [tab, setTab] = useState('student'); // 'student' | 'coach'

  // Shared fields
  const [name, setName]         = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm]   = useState('');

  // Coach-only field
  const [schoolName, setSchoolName] = useState('');

  // State
  const [error, setError]     = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  const reset = () => {
    setName(''); setPassword(''); setConfirm(''); setSchoolName('');
    setError(''); setSuccess('');
  };

  const handleTabSwitch = (t) => { setTab(t); reset(); };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!name.trim())   { setError('Name is required.'); return; }
    if (!password)      { setError('Password is required.'); return; }
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return; }
    if (password !== confirm) { setError('Passwords do not match.'); return; }

    setLoading(true);
    try {
      await register({ name: name.trim(), password, role: tab });
      setSuccess(
        tab === 'coach'
          ? 'Request submitted! An admin will review your coach application.'
          : 'Account created! Redirecting to login…'
      );
      if (tab === 'student') {
        setTimeout(() => navigate('/login'), 1800);
      }
    } catch (err) {
      if (err.status === 410 || /disabled|contact/i.test(err.message)) {
        setError(
          tab === 'coach'
            ? 'Coach registration requires admin approval. Please contact your administrator directly.'
            : 'Self-registration is currently closed. Contact your coach to be added to the roster.'
        );
      } else {
        setError(err.message || 'Registration failed.');
      }
    } finally {
      setLoading(false);
    }
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
          <p className="text-xs text-gray-500 tracking-widest uppercase">Create Account</p>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-800">
          <TabButton active={tab === 'student'} onClick={() => handleTabSwitch('student')}>
            Student
          </TabButton>
          <TabButton active={tab === 'coach'} onClick={() => handleTabSwitch('coach')}>
            Coach
          </TabButton>
        </div>

        {/* Coach info banner */}
        {tab === 'coach' && (
          <div
            className="rounded-lg px-4 py-3 text-xs leading-relaxed"
            style={{
              background: 'rgba(212,175,55,0.08)',
              border: '1px solid rgba(212,175,55,0.25)',
              color: '#c9a227',
            }}
          >
            Coach accounts require <strong>admin approval</strong> before activation.
            Your request will be reviewed within 1–2 business days.
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
          <div className="flex flex-col gap-1.5">
            <label className="label-sm">Name</label>
            <AuthInput
              value={name}
              onChange={(e) => { setName(e.target.value); setError(''); }}
              placeholder="Your display name"
              maxLength={32}
              disabled={loading}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="label-sm">Password</label>
            <AuthInput
              type="password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setError(''); }}
              placeholder="At least 8 characters"
              disabled={loading}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="label-sm">Confirm Password</label>
            <AuthInput
              type="password"
              value={confirm}
              onChange={(e) => { setConfirm(e.target.value); setError(''); }}
              placeholder="Re-enter password"
              disabled={loading}
            />
          </div>

          {/* Coach-only: School Name */}
          {tab === 'coach' && (
            <div className="flex flex-col gap-1.5">
              <label className="label-sm">School Name</label>
              <AuthInput
                value={schoolName}
                onChange={(e) => { setSchoolName(e.target.value); setError(''); }}
                placeholder="e.g. Rivera Poker Academy"
                maxLength={64}
                disabled={loading}
              />
            </div>
          )}

          {error && (
            <p
              data-testid="register-error"
              className="text-xs text-red-400 leading-snug -mt-1"
            >
              {error}
            </p>
          )}

          {success && (
            <p
              data-testid="register-success"
              className="text-xs leading-snug -mt-1"
              style={{ color: '#4ade80' }}
            >
              {success}
            </p>
          )}

          <button
            type="submit"
            disabled={loading || !!success}
            className="btn-gold w-full py-3 text-sm tracking-widest uppercase disabled:opacity-50"
          >
            {loading
              ? 'Submitting…'
              : tab === 'coach'
              ? 'Request Coach Access'
              : 'Create Account'}
          </button>
        </form>

        {/* Footer link */}
        <p className="text-center text-xs text-gray-600">
          Already have an account?{' '}
          <Link to="/login" className="underline" style={{ color: '#d4af37' }}>
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
