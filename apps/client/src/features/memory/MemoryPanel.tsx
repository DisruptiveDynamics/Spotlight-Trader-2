import { useState, useEffect } from 'react';

type MemoryKind = 'playbook' | 'glossary' | 'postmortem';

interface Memory {
  id: string;
  kind: MemoryKind;
  text: string;
  tags: string[];
  createdAt: string;
}

interface MemoryWithScore extends Memory {
  score: number;
}

export function MemoryPanel() {
  const [memories, setMemories] = useState<Memory[]>([]);
  const [searchResults, setSearchResults] = useState<MemoryWithScore[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [newMemory, setNewMemory] = useState<{
    kind: MemoryKind;
    text: string;
    tags: string;
  }>({
    kind: 'playbook',
    text: '',
    tags: '',
  });
  const [selectedKind, setSelectedKind] = useState<MemoryKind | 'all'>('all');
  const [selectedTag, setSelectedTag] = useState<string>('');

  useEffect(() => {
    fetchMemories();
  }, [selectedKind, selectedTag]);

  const fetchMemories = async () => {
    try {
      const params = new URLSearchParams();
      if (selectedKind !== 'all') params.append('kind', selectedKind);
      if (selectedTag) params.append('tag', selectedTag);

      const queryString = params.toString();
      const response = await fetch(`/api/memory${queryString ? `?${queryString}` : ''}`);
      const data = await response.json();
      setMemories(data.memories || []);
    } catch (error) {
      console.error('Failed to fetch memories:', error);
    }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;

    setIsSearching(true);
    try {
      const response = await fetch(`/api/memory/search?q=${encodeURIComponent(searchQuery)}&k=4`);
      const data = await response.json();
      setSearchResults(data.memories || []);
    } catch (error) {
      console.error('Failed to search memories:', error);
    } finally {
      setIsSearching(false);
    }
  };

  const handleSaveMemory = async () => {
    try {
      const tags = newMemory.tags
        .split(',')
        .map((t) => t.trim())
        .filter((t) => t.length > 0);

      await fetch('/api/memory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: newMemory.kind,
          text: newMemory.text,
          tags,
        }),
      });

      setIsModalOpen(false);
      setNewMemory({ kind: 'playbook', text: '', tags: '' });
      fetchMemories();
      showToast('Memory saved successfully');
    } catch (error) {
      console.error('Failed to save memory:', error);
      showToast('Failed to save memory', 'error');
    }
  };

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    console.log(`[${type.toUpperCase()}] ${message}`);
  };

  const getKindBadgeColor = (kind: MemoryKind) => {
    switch (kind) {
      case 'playbook':
        return 'bg-blue-100 text-blue-800';
      case 'glossary':
        return 'bg-purple-100 text-purple-800';
      case 'postmortem':
        return 'bg-orange-100 text-orange-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const displayMemories = searchQuery.trim() ? searchResults : memories;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-white">Coach Memory</h2>
        <button
          onClick={() => setIsModalOpen(true)}
          className="px-3 py-1 text-sm bg-blue-500 text-white rounded hover:bg-blue-600"
        >
          + Add Memory
        </button>
      </div>

      <div className="mb-4 flex gap-2">
        <div className="flex-1 relative">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            placeholder="Search memories..."
            className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white"
          />
        </div>
        <button
          onClick={handleSearch}
          disabled={isSearching}
          className="px-4 py-2 bg-purple-500 text-white rounded hover:bg-purple-600 disabled:opacity-50"
        >
          {isSearching ? 'Searching...' : 'Search'}
        </button>
        {searchQuery && (
          <button
            onClick={() => {
              setSearchQuery('');
              setSearchResults([]);
            }}
            className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-500"
          >
            Clear
          </button>
        )}
      </div>

      <div className="mb-4 flex gap-2">
        {(['all', 'playbook', 'glossary', 'postmortem'] as const).map((kind) => (
          <button
            key={kind}
            onClick={() => setSelectedKind(kind)}
            className={`px-3 py-1 text-sm rounded ${
              selectedKind === kind
                ? 'bg-blue-500 text-white'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            {kind.charAt(0).toUpperCase() + kind.slice(1)}
          </button>
        ))}
      </div>

      <div className="mb-4">
        <input
          type="text"
          value={selectedTag}
          onChange={(e) => setSelectedTag(e.target.value)}
          placeholder="Filter by tag..."
          className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white text-sm"
        />
      </div>

      <div className="flex-1 overflow-y-auto space-y-3">
        {displayMemories.length === 0 ? (
          <p className="text-gray-400 text-sm text-center mt-8">
            {searchQuery.trim() ? 'No memories found' : 'No memories stored yet'}
          </p>
        ) : (
          displayMemories.map((memory) => (
            <div key={memory.id} className="p-4 border border-gray-600 rounded-lg bg-gray-800">
              <div className="flex items-start justify-between mb-2">
                <span className={`px-2 py-1 text-xs rounded ${getKindBadgeColor(memory.kind)}`}>
                  {memory.kind}
                </span>
                {'score' in memory && (
                  <span className="text-xs text-gray-400">
                    Score: {typeof memory.score === 'number' ? memory.score.toFixed(3) : ''}
                  </span>
                )}
              </div>
              <p className="text-gray-300 text-sm mb-2">{memory.text}</p>
              <div className="flex items-center justify-between">
                {memory.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {memory.tags.map((tag, idx) => (
                      <span
                        key={idx}
                        className="px-2 py-0.5 bg-gray-700 text-gray-300 text-xs rounded"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
                <button
                  onClick={async () => {
                    if (confirm('Delete this memory?')) {
                      await fetch(`/api/memory/${memory.id}`, { method: 'DELETE' });
                      fetchMemories();
                    }
                  }}
                  className="ml-auto text-xs text-red-400 hover:text-red-300"
                >
                  Delete
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-gray-800 p-6 rounded-lg w-full max-w-2xl">
            <h3 className="text-lg font-semibold mb-4 text-white">Add Memory</h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Kind</label>
                <select
                  value={newMemory.kind}
                  onChange={(e) =>
                    setNewMemory({ ...newMemory, kind: e.target.value as MemoryKind })
                  }
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white"
                >
                  <option value="playbook">Playbook</option>
                  <option value="glossary">Glossary</option>
                  <option value="postmortem">Postmortem</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Memory</label>
                <textarea
                  value={newMemory.text}
                  onChange={(e) => setNewMemory({ ...newMemory, text: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white h-32"
                  placeholder="Enter the memory text..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  Tags (comma-separated)
                </label>
                <input
                  type="text"
                  value={newMemory.tags}
                  onChange={(e) => setNewMemory({ ...newMemory, tags: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white"
                  placeholder="momentum, breakout, support"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-6">
              <button
                onClick={() => {
                  setIsModalOpen(false);
                  setNewMemory({ kind: 'playbook', text: '', tags: '' });
                }}
                className="px-4 py-2 text-gray-300 hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveMemory}
                disabled={!newMemory.text.trim()}
                className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
