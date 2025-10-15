import { useEffect, useState } from "react";
import type { ReactNode } from "react";

import { authStorage } from "../../auth/authStorage";
import { useAuthStore } from "../../stores/authStore";
import { SignIn } from "./SignIn";

interface AuthGateProps {
  children: ReactNode;
}

export function AuthGate({ children }: AuthGateProps) {
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const [loading, setLoading] = useState(true);
  const [sessionExpired, setSessionExpired] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const validateSession = async () => {
      // Check if there's a stored user first
      const stored = authStorage.get();
      
      // If no stored user or expired, skip validation and go straight to login
      if (!stored?.user || authStorage.isExpired()) {
        setLoading(false);
        return;
      }

      try {
        const res = await fetch("/api/auth/session", {
          credentials: "include",
        });

        if (cancelled) return;

        if (res.ok) {
          const data = await res.json();

          // Map server user { id, email, createdAt? } -> store user { userId, email, createdAt? }
          const mappedUser = data?.user
            ? {
                userId: data.user.id,
                email: data.user.email,
                createdAt: data.user.createdAt || new Date().toISOString(),
              }
            : null;

          if (mappedUser) {
            authStorage.set({
              user: mappedUser,
              expiresAt: data.expiresAt || Date.now() + 30 * 60 * 1000,
            });
            setUser(mappedUser);
          } else {
            authStorage.clear();
            setUser(null);
          }

          setLoading(false);
          setSessionExpired(false);
        } else {
          // Session invalid - clear everything
          authStorage.clear();
          setUser(null);
          setLoading(false);

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
