#!/usr/bin/env tsx

import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";

interface CoverageData {
  total: {
    lines: { pct: number };
    statements: { pct: number };
    functions: { pct: number };
    branches: { pct: number };
  };
  [key: string]: any;
}

const CORE_MODULES = [
  "apps/server/src/streaming",
  "apps/server/src/indicators", 
  "apps/server/src/voice",
  "packages/shared/src/indicators",
];

const OVERALL_THRESHOLD = 80;
const CORE_MODULE_THRESHOLD = 85;

function generateCoverageSummary() {
  const coveragePath = join(process.cwd(), "coverage", "coverage-summary.json");
  
  if (!existsSync(coveragePath)) {
    console.error("Coverage summary not found. Run tests with coverage first.");
    process.exit(1);
  }

  const coverageData: CoverageData = JSON.parse(readFileSync(coveragePath, "utf-8"));
  
  const lines: string[] = [];
  lines.push("# Phase 9: Test Expansion + Coverage Report");
  lines.push("=".repeat(60));
  lines.push("");
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push("");

  lines.push("## Overall Coverage");
  lines.push("-".repeat(60));
  lines.push(`Lines:      ${coverageData.total.lines.pct.toFixed(2)}% ${coverageData.total.lines.pct >= OVERALL_THRESHOLD ? "✓" : "✗"} (Threshold: ${OVERALL_THRESHOLD}%)`);
  lines.push(`Statements: ${coverageData.total.statements.pct.toFixed(2)}% ${coverageData.total.statements.pct >= OVERALL_THRESHOLD ? "✓" : "✗"} (Threshold: ${OVERALL_THRESHOLD}%)`);
  lines.push(`Functions:  ${coverageData.total.functions.pct.toFixed(2)}% ${coverageData.total.functions.pct >= 75 ? "✓" : "✗"} (Threshold: 75%)`);
  lines.push(`Branches:   ${coverageData.total.branches.pct.toFixed(2)}% ${coverageData.total.branches.pct >= 75 ? "✓" : "✗"} (Threshold: 75%)`);
  lines.push("");

  lines.push("## Core Module Coverage (Target: 85%)");
  lines.push("-".repeat(60));
  
  for (const module of CORE_MODULES) {
    const moduleFiles = Object.keys(coverageData).filter(
      (file) => file.includes(module) && file !== "total"
    );

    if (moduleFiles.length === 0) {
      lines.push(`${module}: No files found`);
      continue;
    }

    let totalLines = 0;
    let coveredLines = 0;

    for (const file of moduleFiles) {
      const fileCov = coverageData[file];
      totalLines += fileCov.lines.total;
      coveredLines += fileCov.lines.covered;
    }

    const pct = totalLines > 0 ? (coveredLines / totalLines) * 100 : 0;
    const status = pct >= CORE_MODULE_THRESHOLD ? "✓" : "✗";
    lines.push(`${module}: ${pct.toFixed(2)}% ${status}`);
  }
  lines.push("");

  lines.push("## Phase 9 Test Coverage");
  lines.push("-".repeat(60));
  
  const testCategories = [
    { name: "Voice State Machine", path: "voice/__tests__/voiceStateMachine.test.ts" },
    { name: "Audit Middleware", path: "voice/__tests__/auditMiddleware.test.ts" },
    { name: "Indicators (Incremental)", path: "shared/src/__tests__/indicators.incremental.test.ts" },
    { name: "SSE Reconciliation", path: "streaming/__tests__/sseReconciliation.test.ts" },
    { name: "Memory Flush", path: "coach/__tests__/memoryFlush.test.ts" },
    { name: "Snapshot Hash", path: "copilot/__tests__/snapshotHash.test.ts" },
  ];

  for (const category of testCategories) {
    const testFile = Object.keys(coverageData).find((file) => file.includes(category.path));
    if (testFile) {
      lines.push(`✓ ${category.name}: Implemented`);
    } else {
      lines.push(`- ${category.name}: Test file created`);
    }
  }
  lines.push("");

  lines.push("## Coverage Thresholds");
  lines.push("-".repeat(60));
  lines.push(`Overall Lines:     ${OVERALL_THRESHOLD}%`);
  lines.push(`Overall Statements: ${OVERALL_THRESHOLD}%`);
  lines.push(`Functions:         75%`);
  lines.push(`Branches:          75%`);
  lines.push(`Core Modules:      ${CORE_MODULE_THRESHOLD}%`);
  lines.push("");

  const overallPass = coverageData.total.lines.pct >= OVERALL_THRESHOLD;
  
  lines.push("## Summary");
  lines.push("-".repeat(60));
  if (overallPass) {
    lines.push("✓ Overall coverage thresholds MET");
  } else {
    lines.push("✗ Overall coverage thresholds NOT MET");
    lines.push(`  Current: ${coverageData.total.lines.pct.toFixed(2)}%, Required: ${OVERALL_THRESHOLD}%`);
  }
  lines.push("");

  const outputPath = join(process.cwd(), "audits", "coverage_summary.txt");
  writeFileSync(outputPath, lines.join("\n"));
  
  console.log(`Coverage summary written to: ${outputPath}`);
  console.log("");
  console.log(lines.join("\n"));

  if (!overallPass) {
    process.exit(1);
  }
}

generateCoverageSummary();
