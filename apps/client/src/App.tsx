import React, { useState, useEffect } from 'react';
import { CoachBubble } from './features/coach/CoachBubble';
import { CommandPalette } from './components/CommandPalette';
import { LatencyHUD } from './components/LatencyHUD';
import { SignalDensityControl } from './components/SignalDensityControl';
import { TapePeek } from './components/TapePeek';
import { AccessibilityControls } from './components/AccessibilityControls';
import { MultiChart } from './features/chart/MultiChart';
import { Toolbar } from './features/chart/Toolbar';
import { focusManager } from './services/FocusManager';

function App() {
  const [focusMode, setFocusMode] = useState(focusManager.getMode());

  useEffect(() => {
    const unsubscribe = focusManager.subscribe(setFocusMode);

    const handleFocusTrade = () => focusManager.toggleTradeMode();
    const handleFocusReview = () => focusManager.toggleReviewMode();

    window.addEventListener('command:focus-trade', handleFocusTrade);
    window.addEventListener('command:focus-review', handleFocusReview);

    return () => {
      unsubscribe();
      window.removeEventListener('command:focus-trade', handleFocusTrade);
      window.removeEventListener('command:focus-review', handleFocusReview);
    };
  }, []);

  const opacity = focusManager.getNonPriceOpacity();

  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col">
      <header
        className="bg-gray-800 border-b border-gray-700 p-4 flex-shrink-0"
        style={{ opacity }}
      >
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Spotlight Trader</h1>
          <div className="flex items-center gap-4">
            <LatencyHUD />
            {focusMode !== 'normal' && (
              <div className="px-3 py-1 bg-blue-500 rounded text-sm font-semibold">
                {focusMode.toUpperCase()} MODE
              </div>
            )}
          </div>
        </div>
      </header>
      <main className="flex-1 flex flex-col min-h-0">
        <Toolbar status="live" />
        <div className="flex-1 flex gap-2 min-h-0 p-2">
          {/* Main Chart Area - Takes 85% of width */}
          <div className="flex-1 min-w-0">
            <MultiChart />
          </div>

          {/* Right Sidebar - Takes 15% of width */}
          <div className="w-64 flex-shrink-0 space-y-2 overflow-y-auto">
            <SignalDensityControl />
            <AccessibilityControls />

            {focusManager.isPanelVisible('coach') && (
              <div className="bg-gray-800 p-4 rounded-lg">
                <h3 className="text-sm font-semibold mb-2">Coach</h3>
                <p className="text-xs text-gray-400">AI trading coach</p>
              </div>
            )}

            {focusManager.isPanelVisible('rules') && (
              <div className="bg-gray-800 p-4 rounded-lg" style={{ opacity }}>
                <h3 className="text-sm font-semibold mb-2">Rules</h3>
                <p className="text-xs text-gray-400">Trading rules engine</p>
              </div>
            )}

            {focusManager.isPanelVisible('journal') && (
              <div className="bg-gray-800 p-4 rounded-lg" style={{ opacity }}>
                <h3 className="text-sm font-semibold mb-2">Journal</h3>
                <p className="text-xs text-gray-400">Trading journal and notes</p>
              </div>
            )}
          </div>
        </div>
      </main>
      <CoachBubble />
      <CommandPalette />
      <TapePeek />
    </div>
  );
}

export default App;
