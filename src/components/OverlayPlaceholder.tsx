import { useState } from 'react';

export default function OverlayPlaceholder() {
  const [isMinimized, setIsMinimized] = useState(false);

  if (isMinimized) {
    return (
      <div
        className="fixed bottom-4 right-4 z-[999999]"
        style={{ fontFamily: 'system-ui, sans-serif' }}
      >
        <button
          onClick={() => setIsMinimized(false)}
          className="bg-blue-500 text-white px-3 py-2 rounded-lg shadow-lg hover:bg-blue-600 text-sm font-medium"
        >
          AI Assistant
        </button>
      </div>
    );
  }

  return (
    <div
      className="fixed bottom-4 right-4 w-80 z-[999999]"
      style={{ fontFamily: 'system-ui, sans-serif' }}
    >
      <div className="bg-white/90 backdrop-blur-sm rounded-lg shadow-xl border border-gray-200 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2 bg-gray-50 border-b">
          <span className="font-medium text-gray-700 text-sm">
            AI Interview Assistant
          </span>
          <button
            onClick={() => setIsMinimized(true)}
            className="text-gray-400 hover:text-gray-600 text-lg leading-none"
          >
            -
          </button>
        </div>

        {/* Content */}
        <div className="p-4">
          {/* Transcript placeholder */}
          <div className="mb-3">
            <div className="text-xs font-medium text-gray-500 mb-1">
              Transcript
            </div>
            <div className="bg-gray-50 rounded p-2 text-sm text-gray-400 italic h-20 overflow-y-auto">
              Waiting for audio...
            </div>
          </div>

          {/* Response placeholder */}
          <div>
            <div className="text-xs font-medium text-gray-500 mb-1">
              AI Response
            </div>
            <div className="bg-gray-50 rounded p-2 text-sm text-gray-400 italic h-24 overflow-y-auto">
              Hold hotkey to capture question...
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 py-2 bg-gray-50 border-t text-xs text-gray-400">
          Phase 1 - Foundation
        </div>
      </div>
    </div>
  );
}
