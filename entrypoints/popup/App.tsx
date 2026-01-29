/**
 * Popup Application Component
 *
 * Settings panel with tabbed navigation for configuring the extension.
 * Replaces Phase 1 test UI with production settings interface.
 */

import { useState } from 'react';
import ApiKeySettings from '../../src/components/settings/ApiKeySettings';
import ModelSettings from '../../src/components/settings/ModelSettings';
import HotkeySettings from '../../src/components/settings/HotkeySettings';
import BlurSettings from '../../src/components/settings/BlurSettings';
import TemplateManager from '../../src/components/templates/TemplateManager';

type Tab = 'settings' | 'templates';

function App() {
  const [activeTab, setActiveTab] = useState<Tab>('settings');

  return (
    <div className="w-96 bg-white">
      {/* Header */}
      <div className="px-4 pt-4 pb-2 border-b border-gray-200">
        <h1 className="text-lg font-bold text-gray-900">AI Interview Assistant</h1>
      </div>

      {/* Tab Navigation */}
      <div className="flex border-b border-gray-200">
        <button
          onClick={() => setActiveTab('settings')}
          className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === 'settings'
              ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50'
              : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
          }`}
        >
          Settings
        </button>
        <button
          onClick={() => setActiveTab('templates')}
          className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === 'templates'
              ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50'
              : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
          }`}
        >
          Templates
        </button>
      </div>

      {/* Tab Content */}
      <div className="max-h-[500px] overflow-y-auto">
        {activeTab === 'settings' ? (
          <div className="p-4 space-y-6">
            {/* API Keys Section */}
            <section>
              <h2 className="text-sm font-semibold text-gray-900 mb-3">API Keys</h2>
              <ApiKeySettings />
            </section>

            {/* Models Section */}
            <section>
              <h2 className="text-sm font-semibold text-gray-900 mb-3">Models</h2>
              <ModelSettings />
            </section>

            {/* Hotkeys Section */}
            <section>
              <h2 className="text-sm font-semibold text-gray-900 mb-3">Hotkeys</h2>
              <HotkeySettings />
            </section>

            {/* Appearance Section */}
            <section>
              <h2 className="text-sm font-semibold text-gray-900 mb-3">Appearance</h2>
              <BlurSettings />
            </section>
          </div>
        ) : (
          <div className="p-4">
            <TemplateManager />
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-4 py-2 border-t border-gray-200">
        <div className="text-xs text-gray-400">v0.2.0 - Settings UI</div>
      </div>
    </div>
  );
}

export default App;
