import React, { useState, useEffect, Suspense, lazy } from 'react';
import { LatencyHUD } from './components/LatencyHUD';
import { SignalDensityControl } from './components/SignalDensityControl';
import { Brand } from './components/Brand';
import { Splash } from './components/Splash';
import { Toolbar } from './features/chart/Toolbar';
import { focusManager } from './services/FocusManager';
import { startFlagSync, stopFlagSync } from './state/flags';
import type { InsightContext } from '@spotlight/shared';
import { MarketStatus } from './features/hud/MarketStatus';

// Lazy load heavy components for code-splitting
const MultiChart = lazy(() =>
  import('./features/chart/MultiChart').then((m) => ({ default: m.MultiChart }))
);
const TapePeek = lazy(() => import('./components/TapePeek').then((m) => ({ default: m.TapePeek })));
const TapePanel = lazy(() => import('./components/TapePanel').then((m) => ({ default: m.TapePanel })));
const PresenceBubble = lazy(() =>
  import('./features/coach/PresenceBubble').then((m) => ({ default: m.PresenceBubble }))
);
const CalloutsOverlay = lazy(() =>
  import('./features/copilot/CalloutsOverlay').then((m) => ({ default: m.CalloutsOverlay }))
);
const ExplainPanel = lazy(() =>
  import('./features/coach/ExplainPanel').then((m) => ({ default: m.ExplainPanel }))
);
const CommandPalette = lazy(() =>
  import('./components/CommandPalette').then((m) => ({ default: m.CommandPalette }))
);
const AdminConsole = lazy(() =>
  import('./components/AdminConsole').then((m) => ({ default: m.AdminConsole }))
);
const SettingsPanel = lazy(() =>
  import('./components/SettingsPanel').then((m) => ({ default: m.SettingsPanel }))
);

// Minimal loading fallback for Suspense boundaries
const LoadingFallback = () => (
  <div className="flex items-center justify-center p-4">
    <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
  </div>
);

function App() {
  const [focusMode, setFocusMode] = useState(focusManager.getMode());
  const [explainPanelOpen, setExplainPanelOpen] = useState(false);
  const [explainContext, setExplainContext] = useState<InsightContext | null>(null);
  const [showSplash, setShowSplash] = useState(false); // Bypass splash for POC
  const [showAdminConsole, setShowAdminConsole] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  // Initialize feature flag syncing
  useEffect(() => {
    startFlagSync();
    return () => stopFlagSync();
  }, []);

  useEffect(() => {
    const unsubscribe = focusManager.subscribe(setFocusMode);

    // Listen for chart context requests
    const handleExplainRequest = (e: CustomEvent) => {
      setExplainContext(e.detail.context);
      setExplainPanelOpen(true);
    };

    window.addEventListener('chart:explain-request', handleExplainRequest as EventListener);

    const handleFocusTrade = () => focusManager.toggleTradeMode();
    const handleFocusReview = () => focusManager.toggleReviewMode();
    const handleToggleAdmin = () => setShowAdminConsole((prev) => !prev);
    const handleToggleSettings = () => setShowSettings((prev) => !prev);

    window.addEventListener('command:focus-trade', handleFocusTrade);
    window.addEventListener('command:focus-review', handleFocusReview);
    window.addEventListener('command:toggle-admin', handleToggleAdmin);
    window.addEventListener('command:toggle-settings', handleToggleSettings);

    return () => {
      unsubscribe();
      window.removeEventListener('command:focus-trade', handleFocusTrade);
      window.removeEventListener('command:focus-review', handleFocusReview);
      window.removeEventListener('command:toggle-admin', handleToggleAdmin);
      window.removeEventListener('command:toggle-settings', handleToggleSettings);
      window.removeEventListener('chart:explain-request', handleExplainRequest as EventListener);
    };
  }, []);

  // Bootstrap splash: hide after SSE connection or 1.5s timeout
  useEffect(() => {
    let sseConnected = false;

    const handleSseConnect = () => {
      sseConnected = true;
      setShowSplash(false);
    };

    // Listen for SSE connection event (from market stream)
    window.addEventListener('sse:connected', handleSseConnect);

    // Fallback timeout: hide splash after 1.5s regardless
    const timeoutId = setTimeout(() => {
      if (!sseConnected) {
        setShowSplash(false);
      }
    }, 1500);

    return () => {
      window.removeEventListener('sse:connected', handleSseConnect);
      clearTimeout(timeoutId);
    };
  }, []);

  const opacity = focusManager.getNonPriceOpacity();

  return (
    <>
      <Splash isVisible={showSplash} />
      <div className="min-h-screen bg-gray-900 text-white flex flex-col">
        <header
          className="bg-gray-800 border-b border-gray-700 p-4 flex-shrink-0"
          style={{ opacity }}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Brand />
              <Suspense fallback={null}>
                <PresenceBubble compact />
              </Suspense>
            </div>
            <div className="flex items-center gap-4">
              <LatencyHUD />
              {focusMode !== 'normal' && (
                <div className="px-3 py-1 bg-blue-500 rounded text-sm font-semibold">
                  {focusMode.toUpperCase()} MODE
                </div>
              )}
              <button
                onClick={() => setShowSettings(true)}
                className="p-2 hover:bg-gray-700 rounded-lg transition-colors"
                title="Settings"
              >
                <svg
                  className="w-5 h-5 text-gray-300 hover:text-white"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                  />
                </svg>
              </button>
            </div>
          </div>
        </header>
        <main className="flex-1 flex flex-col min-h-0 max-h-[85vh]">
          <Toolbar status="live" />
          <div className="flex-1 flex gap-2 min-h-0 p-2">
            {/* Main Chart Area - Takes 85% of width */}
            <div className="flex-1 min-w-0">
              <Suspense fallback={<LoadingFallback />}>
                <MultiChart />
              </Suspense>
            </div>

            {/* Right Sidebar - Takes 15% of width */}
            <div className="w-96 flex-shrink-0 space-y-2 overflow-y-auto">
              <SignalDensityControl />

              {/* Time & Sales Tape Panel */}
              <div className="h-96">
                <Suspense fallback={<LoadingFallback />}>
                  <TapePanel symbol="SPY" maxTicks={100} />
                </Suspense>
              </div>

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
        <Suspense fallback={null}>
          <CommandPalette />
        </Suspense>
        <Suspense fallback={null}>
          <TapePeek />
        </Suspense>
        <Suspense fallback={null}>
          <ExplainPanel
            isOpen={explainPanelOpen}
            onClose={() => setExplainPanelOpen(false)}
            context={explainContext}
          />
        </Suspense>
        <MarketStatus />
        <Suspense fallback={null}>
          <CalloutsOverlay />
        </Suspense>
        {showAdminConsole && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="relative w-full max-w-7xl max-h-[90vh] overflow-auto">
              <button
                onClick={() => setShowAdminConsole(false)}
                className="absolute top-4 right-4 z-10 bg-gray-700 hover:bg-gray-600 rounded-full p-2 text-white"
              >
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
              <Suspense fallback={<LoadingFallback />}>
                <AdminConsole />
              </Suspense>
            </div>
          </div>
        )}
        {showSettings && (
          <Suspense fallback={<LoadingFallback />}>
            <SettingsPanel onClose={() => setShowSettings(false)} />
          </Suspense>
        )}
      </div>
    </>
  );
}

export default App;
