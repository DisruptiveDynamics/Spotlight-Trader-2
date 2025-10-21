#!/usr/bin/env tsx

import { execSync } from "child_process";

const PORTS = [5000, 8080];

function killPort(port: number): void {
  // Skip on Windows - lsof is Unix-only
  if (process.platform === "win32") {
    console.log(`[Cleanup] Skipping port ${port} on Windows (no lsof available)`);
    return;
  }

  try {
    console.log(`[Cleanup] Checking port ${port}...`);

    // Find process using the port
    const result = execSync(`lsof -ti:${port}`, { encoding: "utf-8" }).trim();

    if (result) {
      const pids = result.split("\n").filter(Boolean);
      console.log(`[Cleanup] Found ${pids.length} process(es) on port ${port}: ${pids.join(", ")}`);

      // Kill each process
      for (const pid of pids) {
        try {
          execSync(`kill -9 ${pid}`);
          console.log(`[Cleanup] ✓ Killed process ${pid}`);
        } catch (err) {
          console.error(`[Cleanup] ✗ Failed to kill process ${pid}:`, err);
        }
      }
    } else {
      console.log(`[Cleanup] ✓ Port ${port} is free`);
    }
  } catch (err: any) {
    if (err.status === 1) {
      // lsof returns 1 when no processes found
      console.log(`[Cleanup] ✓ Port ${port} is free`);
    } else {
      console.error(`[Cleanup] Error checking port ${port}:`, err.message);
    }
  }
}

console.log("[Cleanup] Starting port cleanup...");

for (const port of PORTS) {
  killPort(port);
}

console.log("[Cleanup] Port cleanup complete");
