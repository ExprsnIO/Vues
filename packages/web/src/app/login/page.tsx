'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';

type LoginMode = 'local' | 'oauth';

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get('redirect') || '/';
  const { user, isLoading: authLoading, signIn, signInWithOAuth } = useAuth();
  const [mode, setMode] = useState<LoginMode>('local');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  // Redirect if already logged in
  useEffect(() => {
    if (!authLoading && user) {
      router.push(redirectTo);
    }
  }, [user, authLoading, redirectTo, router]);

  const handleLocalSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      await signIn(identifier, password);
      router.push(redirectTo);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to sign in');
      setIsLoading(false);
    }
  };

  const handleOAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      await signInWithOAuth(identifier);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to sign in');
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-black flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-3">
            <div className="w-12 h-12 bg-gradient-to-br from-primary-500 to-primary-700 rounded-xl flex items-center justify-center">
              <span className="text-white font-bold text-2xl">E</span>
            </div>
            <span className="text-3xl font-bold text-white">exprsn</span>
          </div>
          <p className="text-gray-400 mt-4">Sign in to your account</p>
        </div>

        {/* Mode tabs */}
        <div className="flex gap-2 mb-6 p-1 bg-zinc-900 rounded-lg">
          <button
            onClick={() => setMode('local')}
            className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
              mode === 'local'
                ? 'bg-primary-500 text-white'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            Exprsn Account
          </button>
          <button
            onClick={() => setMode('oauth')}
            className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
              mode === 'oauth'
                ? 'bg-primary-500 text-white'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            AT Protocol
          </button>
        </div>

        {/* Local login form */}
        {mode === 'local' && (
          <form onSubmit={handleLocalSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="identifier"
                className="block text-sm font-medium text-gray-300 mb-2"
              >
                Username or Email
              </label>
              <input
                id="identifier"
                type="text"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder="yourname or you@example.com"
                className="w-full px-4 py-3 bg-zinc-900 border border-zinc-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                disabled={isLoading}
                required
                autoComplete="username"
              />
            </div>

            <div>
              <label
                htmlFor="password"
                className="block text-sm font-medium text-gray-300 mb-2"
              >
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Your password"
                className="w-full px-4 py-3 bg-zinc-900 border border-zinc-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                disabled={isLoading}
                required
                autoComplete="current-password"
              />
            </div>

            {error && (
              <div className="p-3 bg-red-900/50 border border-red-700 rounded-lg text-red-200 text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading || !identifier.trim() || !password}
              className="w-full py-3 bg-primary-500 hover:bg-primary-600 disabled:bg-primary-800 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors"
            >
              {isLoading ? (
                <span className="flex items-center justify-center gap-2">
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Signing in...
                </span>
              ) : (
                'Sign In'
              )}
            </button>
          </form>
        )}

        {/* OAuth login form */}
        {mode === 'oauth' && (
          <form onSubmit={handleOAuthSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="handle"
                className="block text-sm font-medium text-gray-300 mb-2"
              >
                Your handle
              </label>
              <input
                id="handle"
                type="text"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder="you.bsky.social"
                className="w-full px-4 py-3 bg-zinc-900 border border-zinc-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                disabled={isLoading}
                required
              />
              <p className="text-xs text-gray-500 mt-2">
                Enter your handle from Bluesky or any AT Protocol PDS
              </p>
            </div>

            {error && (
              <div className="p-3 bg-red-900/50 border border-red-700 rounded-lg text-red-200 text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading || !identifier.trim()}
              className="w-full py-3 bg-primary-500 hover:bg-primary-600 disabled:bg-primary-800 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors"
            >
              {isLoading ? (
                <span className="flex items-center justify-center gap-2">
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Redirecting...
                </span>
              ) : (
                'Continue with AT Protocol'
              )}
            </button>
          </form>
        )}

        {/* Divider */}
        <div className="flex items-center gap-4 my-6">
          <div className="flex-1 h-px bg-zinc-700" />
          <span className="text-gray-500 text-sm">or</span>
          <div className="flex-1 h-px bg-zinc-700" />
        </div>

        {/* Sign up link */}
        <div className="text-center">
          <p className="text-gray-400 text-sm">
            Don't have an account?{' '}
            <Link
              href="/signup"
              className="text-primary-400 hover:text-primary-300 font-medium"
            >
              Create one
            </Link>
          </p>
        </div>

        {/* Info */}
        <div className="mt-6 p-4 bg-zinc-900 rounded-lg border border-zinc-800">
          <h3 className="text-white font-medium mb-2">
            {mode === 'local' ? 'Exprsn Account' : 'What is AT Protocol?'}
          </h3>
          <p className="text-gray-400 text-sm">
            {mode === 'local'
              ? 'Sign in with your Exprsn username and password. Your account is portable and built on AT Protocol.'
              : 'AT Protocol is a decentralized social network protocol. You can sign in with your existing Bluesky account or any AT Protocol PDS.'}
          </p>
        </div>

        {/* Back link */}
        <button
          onClick={() => router.push('/')}
          className="mt-6 text-gray-400 hover:text-white text-sm flex items-center gap-2 mx-auto"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18"
            />
          </svg>
          Back to feed
        </button>
      </div>
    </div>
  );
}
