import { useState, useEffect } from "react";

interface Journal {
  id: string;
  userId: string;
  date: string;
  markdown: string;
}

interface Trade {
  id: string;
  symbol: string;
  side: "long" | "short";
  entryPrice?: number;
  exitPrice?: number;
  outcomePnl?: number;
  regime?: "trend" | "range" | "news" | "illiquid";
  tape?: {
    volumeZ?: number;
    spreadBp?: number;
    uptickDelta?: number;
  };
  notes?: string;
}

export function JournalView() {
  const [journals, setJournals] = useState<Journal[]>([]);
  const [selectedJournal, setSelectedJournal] = useState<Journal | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [tradeData, setTradeData] = useState<Partial<Trade>>({
    symbol: "SPY",
    side: "long",
  });
  const [isTradeMode, setIsTradeMode] = useState(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [eodPreview, setEodPreview] = useState<{ summary: any; markdown: string } | null>(null);

  useEffect(() => {
    fetchJournals();
  }, []);

  const fetchJournals = async () => {
    try {
      const response = await fetch("/api/journals");
      const data = await response.json();
      setJournals(data.journals || []);
    } catch (error) {
      console.error("Failed to fetch journals:", error);
    }
  };

  const handleSaveNote = async () => {
    try {
      const content = isTradeMode ? tradeData : noteText;

      await fetch("/api/journals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          [isTradeMode ? "tradeJson" : "text"]: content,
        }),
      });

      setIsModalOpen(false);
      setNoteText("");
      setTradeData({ symbol: "SPY", side: "long" });
      fetchJournals();
    } catch (error) {
      console.error("Failed to save journal:", error);
    }
  };

  const handlePreviewEod = async () => {
    try {
      const response = await fetch("/api/journals/eod/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await response.json();
      setEodPreview(data);
      setIsPreviewOpen(true);
    } catch (error) {
      console.error("Failed to preview EOD:", error);
    }
  };

  const groupByDate = (journals: Journal[]) => {
    const grouped: Record<string, Journal[]> = {};
    journals.forEach((journal) => {
      if (!grouped[journal.date]) {
        grouped[journal.date] = [];
      }
      grouped[journal.date]!.push(journal);
    });
    return grouped;
  };

  const groupedJournals = groupByDate(journals);
  const sortedDates = Object.keys(groupedJournals).sort((a, b) => b.localeCompare(a));

  return (
    <div className="flex h-full gap-4">
      <div className="w-1/3 border-r border-gray-700 pr-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white">Journal Entries</h2>
          <div className="flex gap-2">
            <button
              onClick={() => {
                setIsModalOpen(true);
                setIsTradeMode(false);
              }}
              className="px-3 py-1 text-sm bg-blue-500 text-white rounded hover:bg-blue-600"
            >
              + Note
            </button>
            <button
              onClick={handlePreviewEod}
              className="px-3 py-1 text-sm bg-purple-500 text-white rounded hover:bg-purple-600"
            >
              Preview EOD
            </button>
          </div>
        </div>

        {sortedDates.length === 0 ? (
          <p className="text-gray-400 text-sm">No journal entries</p>
        ) : (
          <div className="space-y-4">
            {sortedDates.map((date) => (
              <div key={date}>
                <h3 className="text-sm font-medium text-gray-300 mb-2">{date}</h3>
                <div className="space-y-2">
                  {(groupedJournals[date] || []).map((journal) => (
                    <div
                      key={journal.id}
                      className={`p-3 border rounded cursor-pointer transition-colors ${
                        selectedJournal?.id === journal.id
                          ? "border-blue-500 bg-blue-900/20"
                          : "border-gray-600 hover:border-gray-500"
                      }`}
                      onClick={() => setSelectedJournal(journal)}
                    >
                      <div className="text-sm text-gray-300 line-clamp-2">
                        {journal.markdown.slice(0, 100)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex-1">
        {selectedJournal ? (
          <div className="bg-gray-800 p-6 rounded-lg">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white">{selectedJournal.date}</h3>
              <div className="flex gap-2">
                <button
                  onClick={async () => {
                    if (confirm("Delete this journal entry?")) {
                      await fetch(`/api/journals/${selectedJournal.id}`, { method: "DELETE" });
                      setSelectedJournal(null);
                      fetchJournals();
                    }
                  }}
                  className="px-3 py-1 text-sm bg-red-500 text-white rounded hover:bg-red-600"
                >
                  Delete
                </button>
                <button
                  onClick={() => setSelectedJournal(null)}
                  className="text-gray-400 hover:text-white"
                >
                  ✕
                </button>
              </div>
            </div>
            <div className="prose prose-invert max-w-none">
              <pre className="whitespace-pre-wrap text-gray-300">{selectedJournal.markdown}</pre>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center h-full">
            <p className="text-gray-500">Select a journal entry to view details</p>
          </div>
        )}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-gray-800 p-6 rounded-lg w-full max-w-2xl">
            <h3 className="text-lg font-semibold mb-4 text-white">
              {isTradeMode ? "Add Trade" : "Add Note"}
            </h3>

            <div className="mb-4">
              <button
                onClick={() => setIsTradeMode(!isTradeMode)}
                className="text-sm text-blue-400 hover:text-blue-300"
              >
                Switch to {isTradeMode ? "Note" : "Trade"} Mode
              </button>
            </div>

            {isTradeMode ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">Symbol</label>
                    <input
                      type="text"
                      value={tradeData.symbol || ""}
                      onChange={(e) => setTradeData({ ...tradeData, symbol: e.target.value })}
                      className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">Side</label>
                    <select
                      value={tradeData.side}
                      onChange={(e) =>
                        setTradeData({ ...tradeData, side: e.target.value as "long" | "short" })
                      }
                      className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white"
                    >
                      <option value="long">Long</option>
                      <option value="short">Short</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">
                      Entry Price
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={tradeData.entryPrice || ""}
                      onChange={(e) =>
                        setTradeData({ ...tradeData, entryPrice: parseFloat(e.target.value) })
                      }
                      className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">
                      Exit Price
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={tradeData.exitPrice || ""}
                      onChange={(e) =>
                        setTradeData({ ...tradeData, exitPrice: parseFloat(e.target.value) })
                      }
                      className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">P&L</label>
                    <input
                      type="number"
                      step="0.01"
                      value={tradeData.outcomePnl || ""}
                      onChange={(e) =>
                        setTradeData({ ...tradeData, outcomePnl: parseFloat(e.target.value) })
                      }
                      className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">Regime</label>
                    <select
                      value={tradeData.regime || ""}
                      onChange={(e) =>
                        setTradeData({
                          ...tradeData,
                          regime: e.target.value as "trend" | "range" | "news" | "illiquid",
                        })
                      }
                      className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white"
                    >
                      <option value="">Select regime</option>
                      <option value="trend">Trend</option>
                      <option value="range">Range</option>
                      <option value="news">News</option>
                      <option value="illiquid">Illiquid</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Notes</label>
                  <textarea
                    value={tradeData.notes || ""}
                    onChange={(e) => setTradeData({ ...tradeData, notes: e.target.value })}
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white h-32"
                  />
                </div>
              </div>
            ) : (
              <textarea
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white h-64"
                placeholder="Write your journal entry..."
              />
            )}

            <div className="flex justify-end gap-2 mt-4">
              <button
                onClick={() => {
                  setIsModalOpen(false);
                  setNoteText("");
                  setTradeData({ symbol: "SPY", side: "long" });
                }}
                className="px-4 py-2 text-gray-300 hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveNote}
                className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {isPreviewOpen && eodPreview && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-gray-800 p-6 rounded-lg w-full max-w-4xl max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white">End of Day Summary Preview</h3>
              <button
                onClick={() => setIsPreviewOpen(false)}
                className="text-gray-400 hover:text-white"
              >
                ✕
              </button>
            </div>
            <div className="prose prose-invert max-w-none">
              <pre className="whitespace-pre-wrap text-gray-300">{eodPreview.markdown}</pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
