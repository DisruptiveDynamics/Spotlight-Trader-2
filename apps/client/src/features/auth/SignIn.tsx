import { useState } from 'react';
import { useAuthStore } from '../../stores/authStore';

export function SignIn() {
  const { setUser } = useAuthStore();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/auth/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
        credentials: 'include',
      });

      if (!res.ok) {
        throw new Error('Failed to send magic link');
      }

      setSent(true);
    } catch (err) {
      setError('Failed to send magic link. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleDemo = async () => {
    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/auth/demo', {
        method: 'POST',
        credentials: 'include',
      });

      if (!res.ok) {
        throw new Error('Demo login failed');
      }

      const data = await res.json();
      
      if (data.user) {
        setUser({
          userId: data.user.id,
          email: data.user.email,
          createdAt: new Date().toISOString(),
        });
      }
    } catch (err) {
      setError('Demo login failed. Please try again.');
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-950">
        <div className="max-w-md w-full bg-gray-900 p-8 rounded-lg border border-gray-800">
          <div className="text-center">
            <div className="text-4xl mb-4">✉️</div>
            <h2 className="text-2xl font-bold text-white mb-2">Check your email</h2>
            <p className="text-gray-400 mb-4">
              We sent a magic link to <span className="text-white">{email}</span>
            </p>
            <button
              onClick={() => setSent(false)}
              className="text-amber-400 hover:text-amber-300 text-sm"
            >
              Try a different email
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-950">
      <div className="max-w-md w-full bg-gray-900 p-8 rounded-lg border border-gray-800">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">Spotlight Trader</h1>
          <p className="text-gray-400">Sign in to your account</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-300 mb-2">
              Email address
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-md text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent"
              placeholder="you@example.com"
            />
          </div>

          {error && (
            <div className="text-red-400 text-sm bg-red-950 border border-red-800 rounded p-3">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-amber-500 hover:bg-amber-600 text-gray-900 font-semibold py-2 px-4 rounded-md disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? 'Sending...' : 'Send magic link'}
          </button>
        </form>

        <div className="mt-6 pt-6 border-t border-gray-800">
          <button
            onClick={handleDemo}
            disabled={loading}
            className="w-full bg-gray-800 hover:bg-gray-700 text-gray-300 font-medium py-2 px-4 rounded-md disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Try demo mode
          </button>
          <p className="text-xs text-gray-500 text-center mt-2">For development and testing</p>
        </div>
      </div>
    </div>
  );
}
