import React, { useState, useEffect, Suspense, lazy } from 'react';
import { AuthGate } from './features/auth/AuthGate';
import { LatencyHUD } from './components/LatencyHUD';
import { SignalDensityControl } from './components/SignalDensityControl';
import { AccessibilityControls } from './components/AccessibilityControls';
import { Brand } from './components/Brand';
import { Splash } from './components/Splash';
import { Toolbar } from './features/chart/Toolbar';
import { focusManager } from './services/FocusManager';
import { startFlagSync, stopFlagSync } from './state/flags';
import type { InsightContext } from '@spotlight/shared';

// Lazy load heavy components for code-splitting
const MultiChart = lazy(() =>
  import('./features/chart/MultiChart').then((m) => ({ default: m.MultiChart }))
);
const TapePeek = lazy(() => import('./components/TapePeek').then((m) => ({ default: m.TapePeek })));
const CoachBubble = lazy(() =>
  import('./features/coach/CoachBubble').then((m) => ({ default: m.CoachBubble }))
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
  const [showSplash, setShowSplash] = useState(true);
  const [showAdminConsole, setShowAdminConsole] = useState(false);

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

    window.addEventListener('command:focus-trade', handleFocusTrade);
    window.addEventListener('command:focus-review', handleFocusReview);
    window.addEventListener('command:toggle-admin', handleToggleAdmin);

    return () => {
      unsubscribe();
      window.removeEventListener('command:focus-trade', handleFocusTrade);
      window.removeEventListener('command:focus-review', handleFocusReview);
      window.removeEventListener('command:toggle-admin', handleToggleAdmin);
      window.removeEventListener('chart:explain-request', handleExplainRequest as EventListener);
    };
  }, []);

  // Bootstrap splash: hide after SSE connection or 1.5s timeout
  useEffect(() => {
    let sseConnected = false;
    let timeoutId: NodeJS.Timeout;

    const handleSseConnect = () => {
      sseConnected = true;
      setShowSplash(false);
    };

    // Listen for SSE connection event (from market stream)
    window.addEventListener('sse:connected', handleSseConnect);

    // Fallback timeout: hide splash after 1.5s regardless
    timeoutId = setTimeout(() => {
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
    <AuthGate>
      <Splash isVisible={showSplash} />
      <div className="min-h-screen bg-gray-900 text-white flex flex-col">
        <header
          className="bg-gray-800 border-b border-gray-700 p-4 flex-shrink-0"
          style={{ opacity }}
        >
          <div className="flex items-center justify-between">
            <Brand />
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
              <Suspense fallback={<LoadingFallback />}>
                <MultiChart />
              </Suspense>
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
        <Suspense fallback={null}>
          <CoachBubble />
        </Suspense>
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
      </div>
    </AuthGate>
  );
}

export default App;
