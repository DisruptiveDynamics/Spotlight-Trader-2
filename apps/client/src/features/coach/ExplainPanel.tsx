import { useState, useEffect, useRef } from 'react';
import { useExplainSignal } from './useExplainSignal';
import { useInsightJournal } from './useInsightJournal';
import type { InsightContext } from '@spotlight/shared';

interface ExplainPanelProps {
  isOpen: boolean;
  onClose: () => void;
  context: InsightContext | null;
}

export function ExplainPanel({ isOpen, onClose, context }: ExplainPanelProps) {
  const [question, setQuestion] = useState('');
  const { explain, response, lastQuestion, isLoading, error, clearResponse } = useExplainSignal();
  const { saveInsight } = useInsightJournal();
  const lastSavedTimestampRef = useRef<number>(0);

  const handleAsk = async () => {
    if (!question.trim() || !context) return;
    
    const userQuestion = question;
    clearResponse(); // Clear previous response
    await explain(userQuestion, context);
    setQuestion('');
  };

  // Save insights to journal when NEW response is received
  useEffect(() => {
    if (response && context && lastQuestion && response.timestamp > lastSavedTimestampRef.current) {
      saveInsight({
        symbol: context.symbol,
        timeframe: context.timeframe,
        question: lastQuestion,
        response: response.text,
      });
      lastSavedTimestampRef.current = response.timestamp;
    }
  }, [response, context, lastQuestion, saveInsight]);

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleAsk();
    }
  };

  // Quick questions
  const quickQuestions = [
    "What's happening with this price action?",
    "Explain the current setup",
    "What are the key support/resistance levels?",
    "Is this a good entry point?",
  ];

  const handleQuickQuestion = async (q: string) => {
    if (!context || isLoading) return;
    setQuestion(q);
    clearResponse(); // Clear previous response
    await explain(q, context);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed right-4 bottom-20 w-96 bg-gray-900 border border-gray-700 rounded-lg shadow-2xl z-50">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-700">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
          <h3 className="text-sm font-semibold">AI Coach</h3>
        </div>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-white transition-colors"
        >
          ✕
        </button>
      </div>

      {/* Context Info */}
      {context && (
        <div className="px-4 py-2 bg-gray-800 text-xs text-gray-400 border-b border-gray-700">
          {context.symbol} • {context.timeframe} • {context.bars.length} bars
        </div>
      )}

      {/* Response */}
      <div className="p-4 max-h-64 overflow-y-auto">
        {isLoading && (
          <div className="flex items-center gap-2 text-sm text-gray-400">
            <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            Analyzing chart...
          </div>
        )}
        
        {error && (
          <div className="p-3 bg-red-500/10 border border-red-500/20 rounded text-sm text-red-400">
            {error}
          </div>
        )}
        
        {response && !isLoading && (
          <div className="space-y-3">
            <div className="text-sm text-gray-300 leading-relaxed">
              {response.text}
            </div>
            <div className="text-xs text-gray-500">
              {new Date(response.timestamp).toLocaleTimeString()}
            </div>
          </div>
        )}

        {!response && !isLoading && !error && (
          <div className="text-sm text-gray-500">
            Ask me anything about the chart...
          </div>
        )}
      </div>

      {/* Quick Questions */}
      <div className="px-4 pb-3">
        <div className="text-xs text-gray-500 mb-2">Quick questions:</div>
        <div className="flex flex-wrap gap-1">
          {quickQuestions.map((q) => (
            <button
              key={q}
              onClick={() => handleQuickQuestion(q)}
              disabled={isLoading}
              className="px-2 py-1 text-xs bg-gray-800 hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed rounded transition-colors"
            >
              {q}
            </button>
          ))}
        </div>
      </div>

      {/* Input */}
      <div className="p-4 border-t border-gray-700">
        <div className="flex gap-2">
          <input
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Ask about the chart..."
            className="flex-1 px-3 py-2 text-sm bg-gray-800 border border-gray-700 rounded focus:outline-none focus:border-blue-500"
            disabled={!context || isLoading}
          />
          <button
            onClick={handleAsk}
            disabled={!question.trim() || !context || isLoading}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Ask
          </button>
        </div>
      </div>
    </div>
  );
}
