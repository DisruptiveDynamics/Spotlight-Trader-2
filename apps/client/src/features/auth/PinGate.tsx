import { useState } from "react";
import { useAuthStore } from "../../stores/authStore";

export function PinGate() {
  const setUser = useAuthStore((state) => state.setUser);
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/auth/pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
        credentials: "include",
      });

      const data = await res.json();

      if (!res.ok || !data.ok) {
        setError(data.error || "Invalid PIN");
        setPin("");
        return;
      }

      setUser({
        id: "owner",
        email: "owner@spotlight.local",
        name: "Owner",
      });
    } catch (err) {
      console.error("PIN auth error:", err);
      setError("Authentication failed. Please try again.");
      setPin("");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-950">
      <div className="max-w-md w-full bg-gray-900 p-8 rounded-lg border border-gray-800">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">Spotlight Trader</h1>
          <p className="text-gray-400">Enter your PIN to continue</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="pin" className="block text-sm font-medium text-gray-300 mb-2">
              6-Digit PIN
            </label>
            <input
              id="pin"
              type="password"
              inputMode="numeric"
              pattern="\d{6}"
              maxLength={6}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
              required
              autoFocus
              className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-md text-white text-center text-2xl tracking-widest placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent"
              placeholder="••••••"
            />
          </div>

          {error && (
            <div className="text-red-400 text-sm bg-red-950 border border-red-800 rounded p-3 text-center">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || pin.length !== 6}
            className="w-full bg-amber-500 hover:bg-amber-600 text-gray-900 font-semibold py-3 px-4 rounded-md disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? "Authenticating..." : "Unlock"}
          </button>
        </form>

        <div className="mt-6 text-center text-xs text-gray-500">
          For personal use only
        </div>
      </div>
    </div>
  );
}
