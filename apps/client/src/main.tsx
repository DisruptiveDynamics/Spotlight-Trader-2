import React from "react";
import ReactDOM from "react-dom/client";

import "./index.css";
import App from "./App";
import { AuthGate } from "./features/auth/AuthGate";
import { killServiceWorkers } from "./sw-safety";

const BUILD_ID = import.meta.env.VITE_BUILD_ID || String(__BUILD_TIME__ || Date.now());

try {
  const last = localStorage.getItem("BUILD_ID");
  if (last && last !== BUILD_ID) {
    console.log(`[BUILD] New build detected (${last.slice(0, 8)} → ${BUILD_ID.slice(0, 8)}), reloading...`);
    localStorage.setItem("BUILD_ID", BUILD_ID);
    window.location.reload();
  } else if (!last) {
    localStorage.setItem("BUILD_ID", BUILD_ID);
  }
} catch {}

(async () => {
  await killServiceWorkers();
  
  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <AuthGate />
    </React.StrictMode>,
  );
})();
