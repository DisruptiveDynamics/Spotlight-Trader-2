import { useEffect } from "react";

import { startMarketStream } from "../lib/marketStream";
import { useAuthStore } from "../stores/authStore";
import App from "../App";

export function AppShell() {
  const user = useAuthStore((s) => s.user);
  const authReady = useAuthStore((s) => s.authReady);

  useEffect(() => {
    if (!authReady || !user) return;

    console.log("[AppShell] Starting market stream");
    const stopStream = startMarketStream();
    
    return () => {
      console.log("[AppShell] Cleaning up market stream");
      stopStream();
    };
  }, [authReady, user]);

  return <App />;
}
