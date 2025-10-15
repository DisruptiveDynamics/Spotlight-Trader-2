import { useEffect } from "react";

import { useAuthStore } from "../../stores/authStore";
import { AppShell } from "../../components/AppShell";
import { PinGate } from "./PinGate";

export function AuthGate() {
  const user = useAuthStore((s) => s.user);
  const authReady = useAuthStore((s) => s.authReady);
  const verifyAuth = useAuthStore((s) => s.verifyAuth);

  useEffect(() => {
    verifyAuth();
  }, [verifyAuth]);

  if (!authReady) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-950">
        <div className="w-6 h-6 border-2 border-amber-400 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return user ? <AppShell /> : <PinGate />;
}
