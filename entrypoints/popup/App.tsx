import { useState } from 'react';
import type { PongMessage, OffscreenReadyMessage } from '../../src/types/messages';

function App() {
  const [status, setStatus] = useState<string>('Ready');
  const [pingResult, setPingResult] = useState<string | null>(null);
  const [offscreenStatus, setOffscreenStatus] = useState<string>('Not created');

  const handlePing = async () => {
    setStatus('Pinging...');
    try {
      const response = (await chrome.runtime.sendMessage({
        type: 'PING',
        timestamp: Date.now(),
      })) as PongMessage;

      const roundTrip = response.receivedAt - response.timestamp;
      setPingResult(`Round trip: ${roundTrip}ms`);
      setStatus('Connected');
    } catch (error) {
      setStatus('Error');
      setPingResult(error instanceof Error ? error.message : 'Unknown error');
    }
  };

  const handleCreateOffscreen = async () => {
    setOffscreenStatus('Creating...');
    try {
      const response = (await chrome.runtime.sendMessage({
        type: 'CREATE_OFFSCREEN',
      })) as OffscreenReadyMessage;

      if (response.type === 'OFFSCREEN_READY') {
        setOffscreenStatus('Created successfully');
      }
    } catch (error) {
      setOffscreenStatus(error instanceof Error ? error.message : 'Error');
    }
  };

  return (
    <div className="w-80 p-4 bg-white">
      <h1 className="text-lg font-bold mb-4 text-gray-900">AI Interview Assistant</h1>

      <div className="space-y-4">
        {/* Service Worker Test */}
        <div className="border rounded p-3">
          <h2 className="font-medium text-gray-700 mb-2">Service Worker</h2>
          <div className="text-sm text-gray-600 mb-2">Status: {status}</div>
          <button
            onClick={handlePing}
            className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 text-sm"
          >
            Test Connection
          </button>
          {pingResult && <div className="mt-2 text-sm text-gray-600">{pingResult}</div>}
        </div>

        {/* Offscreen Document Test */}
        <div className="border rounded p-3">
          <h2 className="font-medium text-gray-700 mb-2">Offscreen Document</h2>
          <div className="text-sm text-gray-600 mb-2">Status: {offscreenStatus}</div>
          <button
            onClick={handleCreateOffscreen}
            className="bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600 text-sm"
          >
            Create Offscreen
          </button>
        </div>
      </div>

      <div className="mt-4 text-xs text-gray-400">v0.1.0 - Phase 1 Foundation</div>
    </div>
  );
}

export default App;
