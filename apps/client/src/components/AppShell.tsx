import { useEffect } from "react";

import { useAuthStore } from "../stores/authStore";
import App from "../App";

export function AppShell() {
  const user = useAuthStore((s) => s.user);
  const authReady = useAuthStore((s) => s.authReady);

  useEffect(() => {
    if (!authReady || !user) return;

    // TODO: Start market stream when auth is ready
    // const stop = startMarketStream();
    // return stop;
  }, [authReady, user]);

  return <App />;
}
