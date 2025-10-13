import { useState } from "react";
import { KnowledgeUploadModal } from "./KnowledgeUploadModal";
import { MemoryViewer } from "./MemoryViewer";
import { VoiceSelector } from "./VoiceSelector";

interface NexaMenuProps {
  isConnected: boolean;
  onDisconnect: () => void;
}

export function NexaMenu({ isConnected, onDisconnect }: NexaMenuProps) {
  const [showMenu, setShowMenu] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showMemoryViewer, setShowMemoryViewer] = useState(false);
  const [showVoiceSelector, setShowVoiceSelector] = useState(false);
  const [currentVoice, setCurrentVoice] = useState("nova"); // Default voice

  return (
    <>
      <div className="relative">
        <button
          onClick={() => setShowMenu(!showMenu)}
          className={`p-3 rounded-full transition-all ${
            isConnected
              ? "bg-blue-500 hover:bg-blue-600 text-white shadow-lg shadow-blue-500/50"
              : "bg-gray-700 hover:bg-gray-600 text-gray-300"
          }`}
          title="Nexa Menu"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
            />
          </svg>
        </button>

        {showMenu && (
          <div className="absolute bottom-full right-0 mb-2 w-64 bg-gray-900 border border-gray-700 rounded-lg shadow-xl overflow-hidden">
            <div className="p-3 border-b border-gray-700 bg-gray-800/50">
              <div className="flex items-center gap-2">
                <div
                  className={`w-2 h-2 rounded-full ${isConnected ? "bg-green-500" : "bg-gray-500"}`}
                />
                <span className="text-sm font-medium text-white">Nexa</span>
                <span className="text-xs text-gray-400">she/her</span>
              </div>
            </div>

            <div className="p-2">
              <button
                onClick={() => {
                  setShowUploadModal(true);
                  setShowMenu(false);
                }}
                className="w-full flex items-center gap-3 px-3 py-2 text-sm text-left text-gray-300 rounded hover:bg-gray-800 transition-colors"
              >
                <span className="text-lg">📚</span>
                <div>
                  <div className="font-medium">Add Knowledge</div>
                  <div className="text-xs text-gray-500">Teach Nexa your strategies</div>
                </div>
              </button>

              <button
                onClick={() => {
                  setShowMemoryViewer(true);
                  setShowMenu(false);
                }}
                className="w-full flex items-center gap-3 px-3 py-2 text-sm text-left text-gray-300 rounded hover:bg-gray-800 transition-colors"
              >
                <span className="text-lg">🧠</span>
                <div>
                  <div className="font-medium">View Memory</div>
                  <div className="text-xs text-gray-500">See what Nexa remembers</div>
                </div>
              </button>

              <button
                onClick={() => {
                  setShowVoiceSelector(true);
                  setShowMenu(false);
                }}
                className="w-full flex items-center gap-3 px-3 py-2 text-sm text-left text-gray-300 rounded hover:bg-gray-800 transition-colors"
              >
                <span className="text-lg">🎙️</span>
                <div>
                  <div className="font-medium">Change Voice</div>
                  <div className="text-xs text-gray-500">Select from 6 voices</div>
                </div>
              </button>

              {isConnected && (
                <>
                  <div className="my-2 border-t border-gray-700" />
                  <button
                    onClick={() => {
                      onDisconnect();
                      setShowMenu(false);
                    }}
                    className="w-full flex items-center gap-3 px-3 py-2 text-sm text-left text-red-400 rounded hover:bg-red-900/20 transition-colors"
                  >
                    <span className="text-lg">🔌</span>
                    <div>
                      <div className="font-medium">Disconnect</div>
                      <div className="text-xs text-red-400/60">End voice session</div>
                    </div>
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      <KnowledgeUploadModal isOpen={showUploadModal} onClose={() => setShowUploadModal(false)} />
      <MemoryViewer isOpen={showMemoryViewer} onClose={() => setShowMemoryViewer(false)} />
      <VoiceSelector
        isOpen={showVoiceSelector}
        onClose={() => setShowVoiceSelector(false)}
        currentVoice={currentVoice}
        onVoiceChange={(voiceId) => {
          setCurrentVoice(voiceId);
          alert(`Voice changed to ${voiceId}! Disconnect and reconnect to hear the new voice.`);
        }}
      />
    </>
  );
}
