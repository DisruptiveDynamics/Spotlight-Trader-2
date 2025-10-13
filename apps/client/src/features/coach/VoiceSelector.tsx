import { useState } from 'react';

interface VoiceSelectorProps {
  isOpen: boolean;
  onClose: () => void;
  currentVoice: string;
  onVoiceChange: (voiceId: string) => void;
}

const VOICES = [
  {
    id: 'alloy',
    name: 'Alloy',
    description: 'Neutral and professional',
    emoji: '🎯',
  },
  {
    id: 'echo',
    name: 'Echo',
    description: 'Clear and technical',
    emoji: '🔊',
  },
  {
    id: 'shimmer',
    name: 'Shimmer',
    description: 'Warm and friendly',
    emoji: '✨',
  },
  {
    id: 'fable',
    name: 'Fable',
    description: 'Expressive and engaging',
    emoji: '📖',
  },
  {
    id: 'onyx',
    name: 'Onyx',
    description: 'Deep and authoritative',
    emoji: '⚫',
  },
  {
    id: 'nova',
    name: 'Nova',
    description: 'Bright and energetic',
    emoji: '⭐',
  },
];

export function VoiceSelector({ isOpen, onClose, currentVoice, onVoiceChange }: VoiceSelectorProps) {
  const [selectedVoice, setSelectedVoice] = useState(currentVoice);
  const [isLoading, setIsLoading] = useState(false);
  const [previewingVoice, setPreviewingVoice] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleVoiceSelect = async () => {
    if (selectedVoice === currentVoice) {
      onClose();
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch('/api/coach/voice', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ voiceId: selectedVoice }),
      });

      if (!response.ok) {
        throw new Error('Failed to update voice');
      }

      onVoiceChange(selectedVoice);
      onClose();
    } catch (error) {
      console.error('Failed to update voice:', error);
      alert('Failed to update voice. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handlePreview = async (voiceId: string) => {
    setPreviewingVoice(voiceId);
    try {
      const response = await fetch(`/api/voice/preview?voice=${voiceId}`, {
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Preview failed');
      }

      const blob = await response.blob();
      const audio = new Audio(URL.createObjectURL(blob));
      
      // Clear previewing state only when audio finishes or errors
      audio.onended = () => setPreviewingVoice(null);
      audio.onerror = () => setPreviewingVoice(null);
      
      audio.play();
    } catch (error) {
      console.error('Preview error:', error);
      setPreviewingVoice(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-gray-900 border border-gray-700 rounded-lg shadow-xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-white">Select Voice</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            ✕
          </button>
        </div>

        <p className="text-sm text-gray-400 mb-4">
          Choose Nexa's voice. Changes take effect on next session.
        </p>

        <div className="space-y-2 mb-6">
          {VOICES.map((voice) => (
            <div
              key={voice.id}
              className={`w-full flex items-center justify-between p-3 rounded-lg border transition-all cursor-pointer ${
                selectedVoice === voice.id
                  ? 'border-blue-500 bg-blue-500/10'
                  : 'border-gray-700 hover:border-gray-600'
              }`}
              onClick={() => setSelectedVoice(voice.id)}
            >
              <div className="flex items-center gap-3">
                <span className="text-2xl">{voice.emoji}</span>
                <div className="text-left">
                  <div className="font-medium text-white flex items-center gap-2">
                    {voice.name}
                    {currentVoice === voice.id && (
                      <span className="text-xs bg-gray-700 px-2 py-0.5 rounded">Current</span>
                    )}
                  </div>
                  <div className="text-sm text-gray-400">{voice.description}</div>
                </div>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handlePreview(voice.id);
                }}
                disabled={previewingVoice === voice.id}
                className="px-3 py-1 text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 rounded transition-colors disabled:opacity-50"
              >
                {previewingVoice === voice.id ? '...' : 'Preview'}
              </button>
            </div>
          ))}
        </div>

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleVoiceSelect}
            disabled={isLoading || selectedVoice === currentVoice}
            className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? 'Saving...' : selectedVoice === currentVoice ? 'No Change' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
