import { useEffect } from "react";

import { useAuthStore } from "../../stores/authStore";
import { AppShell } from "../../components/AppShell";
import { PinGate } from "./PinGate";

export function AuthGate() {
  const user = useAuthStore((s) => s.user);
  const authReady = useAuthStore((s) => s.authReady);
  const markReady = useAuthStore((s) => s.markReady);

  // Ensure re-render after persist hydration
  useEffect(() => {
    // Zustand persist hydrates on first render; marking ready on mount ensures the gate flips.
    markReady();
     
  }, []);

  // Tiny spinner while auth hydrates
  if (!authReady) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-950">
        <div className="w-6 h-6 border-2 border-amber-400 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return user ? <AppShell /> : <PinGate />;
}
