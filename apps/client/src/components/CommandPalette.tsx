import { useState, useEffect } from 'react';

interface Command {
  id: string;
  label: string;
  action: () => void;
  category?: string;
}

function fuzzyMatch(query: string, target: string): number {
  const q = query.toLowerCase();
  const t = target.toLowerCase();

  if (t.includes(q)) return 100;

  let score = 0;
  let queryIndex = 0;

  for (let i = 0; i < t.length && queryIndex < q.length; i++) {
    if (t[i] === q[queryIndex]) {
      score += 10;
      if (i === queryIndex) score += 5;
      queryIndex++;
    }
  }

  if (queryIndex === q.length) {
    return score;
  }

  return 0;
}

export function CommandPalette() {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [commands] = useState<Command[]>([
    {
      id: 'explain-bar',
      label: 'Explain this bar',
      category: 'Analysis',
      action: () => {
        window.dispatchEvent(new CustomEvent('command:explain-bar'));
        setIsOpen(false);
      },
    },
    {
      id: 'jump-signal',
      label: 'Jump to last signal',
      category: 'Navigation',
      action: () => {
        window.dispatchEvent(new CustomEvent('command:jump-signal'));
        setIsOpen(false);
      },
    },
    {
      id: 'focus-trade',
      label: 'Toggle focus mode (Trade)',
      category: 'View',
      action: () => {
        window.dispatchEvent(new CustomEvent('command:focus-trade'));
        setIsOpen(false);
      },
    },
    {
      id: 'focus-review',
      label: 'Toggle focus mode (Review)',
      category: 'View',
      action: () => {
        window.dispatchEvent(new CustomEvent('command:focus-review'));
        setIsOpen(false);
      },
    },
    {
      id: 'toggle-vwap',
      label: 'Toggle VWAP anchors',
      category: 'Indicators',
      action: () => {
        window.dispatchEvent(new CustomEvent('hotkey:toggle-vwap'));
        setIsOpen(false);
      },
    },
  ]);

  const filteredCommands = query
    ? commands
        .map((cmd) => ({ cmd, score: fuzzyMatch(query, cmd.label) }))
        .filter((item) => item.score > 0)
        .sort((a, b) => b.score - a.score)
        .map((item) => item.cmd)
    : commands;

  useEffect(() => {
    const handleOpen = () => setIsOpen(true);
    window.addEventListener('hotkey:command-palette', handleOpen);

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
        setQuery('');
      }
    };
    document.addEventListener('keydown', handleEscape);

    return () => {
      window.removeEventListener('hotkey:command-palette', handleOpen);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh] bg-black/50">
      <div className="w-full max-w-2xl bg-gray-800 rounded-lg shadow-2xl border border-gray-700">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Type a command or search..."
          className="w-full px-4 py-3 bg-gray-900 border-b border-gray-700 text-white placeholder-gray-400 focus:outline-none"
          autoFocus
        />

        <div className="max-h-96 overflow-y-auto">
          {filteredCommands.length > 0 ? (
            filteredCommands.map((cmd) => (
              <button
                key={cmd.id}
                onClick={cmd.action}
                className="w-full px-4 py-2 text-left hover:bg-gray-700 flex items-center justify-between group"
              >
                <div>
                  <div className="text-white">{cmd.label}</div>
                  {cmd.category && <div className="text-xs text-gray-400">{cmd.category}</div>}
                </div>
              </button>
            ))
          ) : (
            <div className="px-4 py-8 text-center text-gray-400">No commands found</div>
          )}
        </div>

        <div className="border-t border-gray-700 px-4 py-3 bg-gray-900">
          <div className="text-xs text-gray-400">
            <div className="font-semibold text-gray-300 mb-2">Quick Reference</div>
            <div className="grid grid-cols-2 gap-x-6 gap-y-1.5">
              <div className="flex justify-between items-center">
                <span className="text-gray-400">Push-to-talk</span>
                <kbd className="px-1.5 py-0.5 bg-gray-800 rounded text-gray-300 font-mono text-xs">
                  T
                </kbd>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-400">Pause stream</span>
                <kbd className="px-1.5 py-0.5 bg-gray-800 rounded text-gray-300 font-mono text-xs">
                  Space
                </kbd>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-400">Set alert</span>
                <kbd className="px-1.5 py-0.5 bg-gray-800 rounded text-gray-300 font-mono text-xs">
                  A
                </kbd>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-400">Journal note</span>
                <kbd className="px-1.5 py-0.5 bg-gray-800 rounded text-gray-300 font-mono text-xs">
                  J
                </kbd>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-400">VWAP anchor</span>
                <kbd className="px-1.5 py-0.5 bg-gray-800 rounded text-gray-300 font-mono text-xs">
                  G+V
                </kbd>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-400">Timeframes</span>
                <kbd className="px-1.5 py-0.5 bg-gray-800 rounded text-gray-300 font-mono text-xs">
                  1/2/3
                </kbd>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
