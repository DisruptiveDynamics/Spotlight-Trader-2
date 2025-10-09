import React from 'react';
import { CoachBubble } from './features/coach/CoachBubble';

function App() {
  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <header className="bg-gray-800 border-b border-gray-700 p-4">
        <h1 className="text-2xl font-bold">Spotlight Trader</h1>
      </header>
      <main className="container mx-auto p-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-gray-800 p-6 rounded-lg">
            <h2 className="text-xl font-semibold mb-4">Market Chart</h2>
            <p className="text-gray-400">Real-time market data visualization</p>
          </div>
          <div className="bg-gray-800 p-6 rounded-lg">
            <h2 className="text-xl font-semibold mb-4">Coach</h2>
            <p className="text-gray-400">AI trading coach</p>
          </div>
          <div className="bg-gray-800 p-6 rounded-lg">
            <h2 className="text-xl font-semibold mb-4">Rules</h2>
            <p className="text-gray-400">Trading rules engine</p>
          </div>
          <div className="bg-gray-800 p-6 rounded-lg">
            <h2 className="text-xl font-semibold mb-4">Journal</h2>
            <p className="text-gray-400">Trading journal and notes</p>
          </div>
        </div>
      </main>
      <CoachBubble />
    </div>
  );
}

export default App;
