import { useEffect, useState } from "react";

import { toLogError } from "../../lib/errors";

type MarketSource = "polygon" | "sim";
type SessionType = "PRE" | "RTH" | "A/H" | "CLOSED";

interface MarketStatusData {
  source: MarketSource;
  reason: string;
  session: SessionType;
}

export function MarketStatus() {
  const [status, setStatus] = useState<MarketStatusData | null>(null);

  useEffect(() => {
    // Fetch market status from dedicated endpoint
    const fetchStatus = async () => {
      try {
        const response = await fetch("/api/market/status", {
          credentials: "include",
        });

        if (!response.ok) {
          throw new Error(`Status endpoint failed: ${response.statusText}`);
        }

        const data = await response.json();
        const source = (data.source || "polygon") as MarketSource;
        const reason = data.reason || "";

        // Map server session format to client display format
        const serverSession = data.session || "closed";
        const session: SessionType =
          serverSession === "premarket"
            ? "PRE"
            : serverSession === "rth"
              ? "RTH"
              : serverSession === "after"
                ? "A/H"
                : "CLOSED";

        setStatus({ source, reason, session });
      } catch (error) {
        console.error("Failed to fetch market status:", toLogError(error));
        setStatus({ source: "polygon", reason: "Status unavailable", session: "CLOSED" });
      }
    };

    fetchStatus();
    const interval = setInterval(fetchStatus, 30000); // Refresh every 30s

    return () => clearInterval(interval);
  }, []);

  if (!status) return null;

  const isSimulator = status.source === "sim";

  // Determine pill color based on session (even in simulator mode)
  const pillColor =
    status.session === "RTH"
      ? isSimulator
        ? "bg-amber-500/20 text-amber-400" // Amber for simulator RTH
        : "bg-green-500/20 text-green-400" // Green for live RTH
      : "bg-slate-500/20 text-slate-400"; // Slate for closed/pre/after

  // Show both simulator status and session
  const label = isSimulator ? `SIMULATOR · ${status.session}` : status.session;

  const tooltip = status.reason ? `DATA UNAVAILABLE: ${status.reason}` : "";

  return (
    <div
      className={`fixed bottom-4 left-4 px-3 py-1.5 rounded-md text-xs font-medium ${pillColor}`}
      title={tooltip}
    >
      {label}
    </div>
  );
}
