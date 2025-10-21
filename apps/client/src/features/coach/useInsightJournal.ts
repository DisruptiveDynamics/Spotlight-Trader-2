import type { InsightJournalEntry } from "@spotlight/shared";
import { useCallback } from "react";

export function useInsightJournal() {
  const saveInsight = useCallback(
    async (entry: Omit<InsightJournalEntry, "type" | "timestamp">) => {
      try {
        const journalEntry: InsightJournalEntry = {
          type: "insight",
          ...entry,
          timestamp: Date.now(),
        };

        await fetch("/api/journals", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(journalEntry),
        });

        console.log("💾 Insight saved to journal:", entry.symbol, entry.question.substring(0, 30));
      } catch (error) {
        console.error("Failed to save insight to journal:", error);
      }
    },
    [],
  );

  return { saveInsight };
}
