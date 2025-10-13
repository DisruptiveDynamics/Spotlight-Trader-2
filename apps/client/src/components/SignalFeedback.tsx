import { useState } from "react";
import { Signal } from "@shared/types/rules";

interface SignalFeedbackProps {
  signal: Signal;
  onSubmit: (feedback: FeedbackData) => void;
}

interface FeedbackData {
  symbol: string;
  seq: number;
  ruleId: string;
  label: "good" | "bad" | "missed" | "late";
  notes: string | undefined;
}

export function SignalFeedback({ signal, onSubmit }: SignalFeedbackProps) {
  const [label, setLabel] = useState<FeedbackData["label"] | null>(null);
  const [notes, setNotes] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = () => {
    if (!label) return;

    // Extract seq from signal context or timestamp
    const seq = (signal.ctx?.seq as number) || Math.floor(new Date(signal.ts).getTime() / 60000);

    onSubmit({
      symbol: signal.symbol,
      seq,
      ruleId: signal.ruleId,
      label,
      notes: notes.trim() || undefined,
    });

    setSubmitted(true);
    setTimeout(() => {
      setSubmitted(false);
      setLabel(null);
      setNotes("");
    }, 2000);
  };

  if (submitted) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 bg-green-900/20 border border-green-700 rounded text-green-400 text-sm">
        <span>✓</span>
        <span>Feedback submitted</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 p-3 bg-gray-800/50 border border-gray-700 rounded">
      <div className="text-xs text-gray-400">Rate this signal</div>

      <div className="flex gap-2">
        <button
          onClick={() => setLabel("good")}
          className={`flex-1 px-3 py-1.5 rounded text-sm font-medium transition-colors ${
            label === "good"
              ? "bg-green-600 text-white"
              : "bg-gray-700 text-gray-300 hover:bg-gray-600"
          }`}
        >
          Good
        </button>
        <button
          onClick={() => setLabel("bad")}
          className={`flex-1 px-3 py-1.5 rounded text-sm font-medium transition-colors ${
            label === "bad"
              ? "bg-red-600 text-white"
              : "bg-gray-700 text-gray-300 hover:bg-gray-600"
          }`}
        >
          Bad
        </button>
        <button
          onClick={() => setLabel("missed")}
          className={`flex-1 px-3 py-1.5 rounded text-sm font-medium transition-colors ${
            label === "missed"
              ? "bg-yellow-600 text-white"
              : "bg-gray-700 text-gray-300 hover:bg-gray-600"
          }`}
        >
          Missed
        </button>
        <button
          onClick={() => setLabel("late")}
          className={`flex-1 px-3 py-1.5 rounded text-sm font-medium transition-colors ${
            label === "late"
              ? "bg-orange-600 text-white"
              : "bg-gray-700 text-gray-300 hover:bg-gray-600"
          }`}
        >
          Late
        </button>
      </div>

      {label && (
        <>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Optional notes..."
            className="w-full px-2 py-1.5 bg-gray-900 border border-gray-600 rounded text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-blue-500"
            rows={2}
          />
          <button
            onClick={handleSubmit}
            className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded transition-colors"
          >
            Submit Feedback
          </button>
        </>
      )}
    </div>
  );
}
