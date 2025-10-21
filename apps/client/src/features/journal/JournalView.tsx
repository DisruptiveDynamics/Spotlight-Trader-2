import { useState, useEffect } from "react";

interface JournalEntry {
  id: string;
  date: string;
  content: string | Record<string, unknown>;
  created_at: string;
}

interface JournalViewProps {
  isOpen: boolean;
  onClose: () => void;
}

export function JournalView({ isOpen, onClose }: JournalViewProps) {
  const [journals, setJournals] = useState<JournalEntry[]>([]);
  const [selectedEntry, setSelectedEntry] = useState<JournalEntry | null>(null);
  const [filterDate, setFilterDate] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      fetchJournals();
    }
  }, [isOpen, filterDate]);

  const fetchJournals = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const queryParams = filterDate ? `?date=${filterDate}` : "";
      const response = await fetch(`/api/journals${queryParams}`);
      
      if (!response.ok) {
        throw new Error("Failed to fetch journals");
      }
      
      const data = await response.json();
      setJournals(data.journals || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load journals");
      console.error("Journal fetch error:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const formatContent = (content: string | Record<string, unknown>): string => {
    if (typeof content === "string") {
      return content;
    }
    return JSON.stringify(content, null, 2);
  };

  const formatDate = (dateStr: string): string => {
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return dateStr;
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-y-0 right-0 w-2/3 max-w-4xl bg-gray-900 border-l border-gray-700 shadow-2xl z-50 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-700 bg-gray-800">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 bg-green-500 rounded-full" />
          <h2 className="text-lg font-semibold text-white">Trading Journal</h2>
        </div>
        <div className="flex items-center gap-3">
          <input
            type="date"
            value={filterDate}
            onChange={(e) => setFilterDate(e.target.value)}
            className="px-3 py-1.5 bg-gray-700 border border-gray-600 rounded text-sm text-white focus:outline-none focus:border-blue-500"
            placeholder="Filter by date"
          />
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors px-2"
            aria-label="Close journal"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Entries List */}
        <div className="w-1/3 border-r border-gray-700 overflow-y-auto">
          {isLoading ? (
            <div className="p-4 text-center text-gray-400">
              <div className="animate-spin w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full mx-auto" />
              <p className="mt-2 text-sm">Loading journals...</p>
            </div>
          ) : error ? (
            <div className="p-4 text-center">
              <p className="text-red-400 text-sm">{error}</p>
              <button
                onClick={fetchJournals}
                className="mt-2 px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700"
              >
                Retry
              </button>
            </div>
          ) : journals.length === 0 ? (
            <div className="p-4 text-center text-gray-400 text-sm">
              <p>No journal entries found</p>
              {filterDate && (
                <button
                  onClick={() => setFilterDate("")}
                  className="mt-2 text-blue-400 hover:text-blue-300 underline"
                >
                  Clear filter
                </button>
              )}
            </div>
          ) : (
            <div className="divide-y divide-gray-700">
              {journals.map((entry) => (
                <button
                  key={entry.id}
                  onClick={() => setSelectedEntry(entry)}
                  className={`w-full text-left p-4 transition-colors hover:bg-gray-800 ${
                    selectedEntry?.id === entry.id ? "bg-gray-800 border-l-4 border-blue-500" : ""
                  }`}
                >
                  <div className="text-xs text-gray-400 mb-1">{formatDate(entry.created_at)}</div>
                  <div className="text-sm text-white font-medium mb-1">
                    {entry.date}
                  </div>
                  <div className="text-xs text-gray-300 line-clamp-2">
                    {formatContent(entry.content).substring(0, 100)}...
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Entry Detail */}
        <div className="flex-1 overflow-y-auto">
          {selectedEntry ? (
            <div className="p-6">
              <div className="mb-4 pb-4 border-b border-gray-700">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-lg font-semibold text-white">{selectedEntry.date}</h3>
                  <span className="text-xs text-gray-400">{formatDate(selectedEntry.created_at)}</span>
                </div>
              </div>

              <div className="prose prose-invert max-w-none">
                <pre className="bg-gray-800 p-4 rounded text-sm text-gray-200 whitespace-pre-wrap font-mono overflow-x-auto">
                  {formatContent(selectedEntry.content)}
                </pre>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center h-full text-gray-400 text-sm">
              <div className="text-center">
                <p>Select an entry to view details</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
