import React, { useState } from 'react';
import { motion } from 'motion/react';
import { useAuth } from '../lib/AuthContext';
import { isSupabaseConfigured } from '../lib/supabaseClient';

type Mode = 'login' | 'signup';

export const AuthView: React.FC = () => {
  const { signInWithPassword, signUpWithPassword, signInWithGoogle } = useAuth();
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [infoMsg, setInfoMsg] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setInfoMsg(null);

    if (!email.trim() || password.length < 6) {
      setErrorMsg('Enter a valid email and a password of at least 6 characters.');
      return;
    }

    setIsSubmitting(true);
    if (mode === 'login') {
      const { error } = await signInWithPassword(email.trim(), password);
      if (error) setErrorMsg(error);
    } else {
      const { error, needsEmailConfirmation } = await signUpWithPassword(email.trim(), password);
      if (error) {
        setErrorMsg(error);
      } else if (needsEmailConfirmation) {
        setInfoMsg('Account created — check your email to confirm before signing in.');
      }
    }
    setIsSubmitting(false);
  };

  const handleGoogle = async () => {
    setErrorMsg(null);
    const { error } = await signInWithGoogle();
    if (error) setErrorMsg(error);
  };

  return (
    <div className="min-h-screen bg-surface text-ink flex items-center justify-center p-4 antialiased">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-sm bg-surface-raised border border-hairline rounded-3xl p-6 sm:p-8 shadow-panel space-y-6"
      >
        <div className="flex flex-col items-center text-center gap-2">
          {/* Inline brand mark — never depends on a remote image loading. */}
          <span className="w-12 h-12 rounded-2xl bg-accent text-white flex items-center justify-center shadow-card mb-1">
            <span className="material-symbols-outlined text-[28px]">center_focus_strong</span>
          </span>
          <h1 className="font-['Geist'] text-xl font-bold text-ink">Phort</h1>
          <p className="text-xs text-ink-faint font-mono-data">
            {mode === 'login' ? 'Sign in to your workspace' : 'Create your workspace account'}
          </p>
        </div>

        {!isSupabaseConfigured && (
          <div className="text-[11px] font-mono-data text-caution bg-caution/10 border border-caution/30 rounded-xl px-3 py-2">
            Supabase env vars aren't set — auth isn't functional in this environment.
          </div>
        )}

        {errorMsg && (
          <div className="text-[11px] font-mono-data text-critical bg-critical/10 border border-critical/30 rounded-xl px-3 py-2">
            {errorMsg}
          </div>
        )}
        {infoMsg && (
          <div className="text-[11px] font-mono-data text-positive bg-positive/10 border border-positive/30 rounded-xl px-3 py-2">
            {infoMsg}
          </div>
        )}

        <button
          type="button"
          onClick={handleGoogle}
          className="w-full flex items-center justify-center gap-2.5 py-2.5 rounded-xl bg-white text-[#3c4043] text-xs font-mono-data font-bold hover:bg-white/90 transition-colors border border-hairline"
        >
          <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true">
            <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.6 32.9 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.5 6.1 29.5 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.7-.4-3.5z"/>
            <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.6 15.6 18.9 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.5 6.1 29.5 4 24 4 16.3 4 9.6 8.3 6.3 14.7z"/>
            <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.4 26.7 36 24 36c-5.2 0-9.6-3.1-11.3-7.6l-6.6 5.1C9.5 39.6 16.2 44 24 44z"/>
            <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.4-2.4 4.4-4.4 5.8l6.2 5.2C40.5 36.5 44 30.9 44 24c0-1.3-.1-2.7-.4-3.5z"/>
          </svg>
          Continue with Google
        </button>

        <div className="flex items-center gap-3">
          <div className="h-px flex-1 bg-hairline" />
          <span className="text-[10px] font-mono-data text-ink-faint uppercase tracking-wider">or</span>
          <div className="h-px flex-1 bg-hairline" />
        </div>

        <form onSubmit={handleSubmit} className="space-y-3 text-xs font-mono-data">
          <div>
            <label className="text-ink-faint uppercase tracking-wider block mb-1.5">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@studio.com"
              className="w-full bg-surface border border-hairline rounded-xl px-3 py-2.5 text-ink focus:outline-none focus:border-accent"
            />
          </div>
          <div>
            <label className="text-ink-faint uppercase tracking-wider block mb-1.5">Password</label>
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full bg-surface border border-hairline rounded-xl px-3 py-2.5 text-ink focus:outline-none focus:border-accent"
            />
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full py-2.5 mt-1 bg-accent hover:bg-accent-hover disabled:opacity-60 text-white rounded-xl text-xs font-mono-data font-bold transition-colors"
          >
            {isSubmitting ? 'Please wait...' : mode === 'login' ? 'Sign In' : 'Create Account'}
          </button>
        </form>

        <p className="text-center text-[11px] font-mono-data text-ink-faint">
          {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
          <button
            type="button"
            onClick={() => {
              setMode(mode === 'login' ? 'signup' : 'login');
              setErrorMsg(null);
              setInfoMsg(null);
            }}
            className="text-accent hover:text-accent-hover font-semibold"
          >
            {mode === 'login' ? 'Sign up' : 'Sign in'}
          </button>
        </p>
      </motion.div>
    </div>
  );
};
