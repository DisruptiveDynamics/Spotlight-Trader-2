import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { useAuthStore } from "../../state/authStore";

/**
 * AuthGate
 * - Validates session on mount
 * - Reacts to user state changes to redirect between /login and /dashboard
 * - Prevents “stuck on login” after successful demo login
 */
export function AuthGate({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const user = useAuthStore((s) => s.user);
  const loading = useAuthStore((s) => s.loading);
  const validateSession = useAuthStore((s) => s.validateSession);

  // Validate session on mount (idempotent)
  useEffect(() => {
    validateSession?.();
     
  }, []);

  // React to auth state changes
  useEffect(() => {
    if (loading) return;

    const onLoginPath =
      location.pathname === "/" || location.pathname === "/login";

    if (user && onLoginPath) {
      // Logged in but on login page -> go to dashboard
      navigate("/dashboard", { replace: true });
      return;
    }

    if (!user && !onLoginPath) {
      // Not logged in but on protected route -> go to login
      navigate("/login", {
        replace: true,
        state: { from: location.pathname },
      });
    }
  }, [user, loading, location.pathname, navigate]);

  return <>{children}</>;
}

export default AuthGate;
