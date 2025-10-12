import { useState, useEffect } from 'react';

interface MemoryViewerProps {
  isOpen: boolean;
  onClose: () => void;
}

interface Upload {
  id: string;
  sourceType: string;
  title: string;
  status: string;
  chunksCount: number;
  createdAt: string;
}

export function MemoryViewer({ isOpen, onClose }: MemoryViewerProps) {
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      fetchUploads();
    }
  }, [isOpen]);

  const fetchUploads = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/nexa/uploads', {
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to fetch uploads');
      }

      const data = await response.json();
      setUploads(data.uploads || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load memory');
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  const getSourceIcon = (sourceType: string) => {
    switch (sourceType) {
      case 'youtube':
        return '📺';
      case 'pdf':
        return '📄';
      case 'text':
        return '📝';
      default:
        return '📚';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'text-green-400 bg-green-900/30 border-green-700';
      case 'processing':
        return 'text-yellow-400 bg-yellow-900/30 border-yellow-700';
      case 'failed':
        return 'text-red-400 bg-red-900/30 border-red-700';
      default:
        return 'text-gray-400 bg-gray-800 border-gray-700';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="relative w-full max-w-3xl bg-gray-900 border border-gray-700 rounded-lg shadow-2xl max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <div>
            <h2 className="text-lg font-semibold text-white">Nexa's Memory</h2>
            <p className="text-sm text-gray-400">Knowledge you've taught her</p>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-gray-400 transition-colors rounded hover:text-white hover:bg-gray-800"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 p-6 overflow-y-auto">
          {isLoading && (
            <div className="flex items-center justify-center py-12">
              <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
            </div>
          )}

          {error && (
            <div className="p-4 text-sm text-red-400 bg-red-900/30 border border-red-700 rounded">
              {error}
            </div>
          )}

          {!isLoading && !error && uploads.length === 0 && (
            <div className="py-12 text-center">
              <div className="text-5xl mb-4">🧠</div>
              <p className="text-gray-400 mb-2">No knowledge uploaded yet</p>
              <p className="text-sm text-gray-500">
                Teach Nexa your strategies using the "Add Knowledge" button
              </p>
            </div>
          )}

          {!isLoading && !error && uploads.length > 0 && (
            <div className="space-y-3">
              {uploads.map((upload) => (
                <div
                  key={upload.id}
                  className="p-4 bg-gray-800 border border-gray-700 rounded-lg transition-colors hover:border-gray-600"
                >
                  <div className="flex items-start gap-3">
                    <div className="text-2xl">{getSourceIcon(upload.sourceType)}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="text-sm font-medium text-white truncate">
                          {upload.title}
                        </h3>
                        <span
                          className={`px-2 py-0.5 text-xs rounded border ${getStatusColor(upload.status)}`}
                        >
                          {upload.status}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
                        <span className="capitalize">{upload.sourceType}</span>
                        <span>•</span>
                        <span>{upload.chunksCount} chunks</span>
                        <span>•</span>
                        <span>
                          {new Date(upload.createdAt).toLocaleDateString(undefined, {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                          })}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 text-xs text-center text-gray-500 border-t border-gray-700">
          {uploads.length > 0 && (
            <span>
              {uploads.reduce((sum, u) => sum + u.chunksCount, 0)} total knowledge chunks •{' '}
              {uploads.length} uploads
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
