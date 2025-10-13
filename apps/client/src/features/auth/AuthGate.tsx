import { useEffect, useState } from "react";
import { useAuthStore } from "../../stores/authStore";
import { authStorage } from "../../auth/authStorage";
import { SignIn } from "./SignIn";

interface AuthGateProps {
  children: React.ReactNode;
}

export function AuthGate({ children }: AuthGateProps) {
  const { user, setUser } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const [sessionExpired, setSessionExpired] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const validateSession = async () => {
      try {
        // Always validate with server, even if localStorage has user data
        const res = await fetch("/api/auth/session", {
          credentials: "include",
        });

        if (cancelled) return;

        if (res.ok) {
          const data = await res.json();

          // Server confirms session is valid - update storage
          authStorage.set({
            user: data.user,
            expiresAt: data.expiresAt || Date.now() + 30 * 60 * 1000,
          });

          setUser(data.user);
          setLoading(false);
          setSessionExpired(false);
        } else {
          // Session invalid - clear everything
          authStorage.clear();
          setUser(null);
          setLoading(false);

          // Show "session expired" message if we had a user before
          if (user) {
            setSessionExpired(true);
          }
        }
      } catch (error) {
        if (cancelled) return;

        console.error("Session validation failed:", error);
        authStorage.clear();
        setUser(null);
        setLoading(false);

        if (user) {
          setSessionExpired(true);
        }
      }
    };

    validateSession();

    return () => {
      cancelled = true;
    };
  }, []); // Only run once on mount

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-950">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-400 mx-auto"></div>
          <p className="text-gray-400 mt-4">Checking session...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <SignIn sessionExpired={sessionExpired} />;
  }

  return <>{children}</>;
}
