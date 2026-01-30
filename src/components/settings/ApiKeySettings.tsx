/**
 * API Key Settings Component
 *
 * Allows users to enter and save API keys for ElevenLabs and OpenRouter.
 * Features show/hide toggle for secure entry.
 */

import { useState } from 'react';
import { useStore } from '../../store';
import type { ApiKeyProvider } from '../../store';

const API_KEY_FIELDS: { provider: ApiKeyProvider; label: string; placeholder: string }[] = [
  {
    provider: 'elevenLabs',
    label: 'ElevenLabs API Key',
    placeholder: 'Enter your ElevenLabs API key',
  },
  {
    provider: 'openRouter',
    label: 'OpenRouter API Key',
    placeholder: 'Enter your OpenRouter API key',
  },
  {
    provider: 'openAI',
    label: 'OpenAI API Key',
    placeholder: 'Enter your OpenAI API key',
  },
];

export default function ApiKeySettings() {
  const apiKeys = useStore((state) => state.apiKeys);
  const setApiKey = useStore((state) => state.setApiKey);

  // Track visibility state for each key field
  const [showKey, setShowKey] = useState<Record<string, boolean>>({
    elevenLabs: false,
    openRouter: false,
    openAI: false,
  });

  const toggleShowKey = (provider: string) => {
    setShowKey((prev) => ({
      ...prev,
      [provider]: !prev[provider],
    }));
  };

  return (
    <div className="space-y-4">
      {API_KEY_FIELDS.map(({ provider, label, placeholder }) => (
        <div key={provider}>
          <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
          <div className="relative">
            <input
              type={showKey[provider] ? 'text' : 'password'}
              value={apiKeys[provider]}
              onChange={(e) => setApiKey(provider, e.target.value)}
              placeholder={placeholder}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 pr-16"
            />
            <button
              type="button"
              onClick={() => toggleShowKey(provider)}
              className="absolute right-2 top-1/2 -translate-y-1/2 px-2 py-1 text-xs text-gray-500 hover:text-gray-700"
            >
              {showKey[provider] ? 'Hide' : 'Show'}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
