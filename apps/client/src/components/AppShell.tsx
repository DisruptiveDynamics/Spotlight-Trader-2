import { useEffect } from "react";

import { startMarketStream } from "../lib/marketStream";
import { useAuthStore } from "../stores/authStore";
import App from "../App";

export function AppShell() {
  const user = useAuthStore((s) => s.user);
  const authReady = useAuthStore((s) => s.authReady);
  const userId = user?.id;

  useEffect(() => {
    if (!authReady || !userId) return;

    console.log("[AppShell] Starting market stream");
    const stopStream = startMarketStream();
    
    return () => {
      console.log("[AppShell] Cleaning up market stream");
      stopStream();
    };
  }, [authReady, userId]);

  return <App />;
}
