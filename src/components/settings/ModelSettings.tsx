/**
 * Model Settings Component
 *
 * Allows users to select LLM models for fast hints and full answers.
 * Dynamically fetches available models from provider layer based on configured API keys.
 */

import { useMemo } from 'react';
import { useStore } from '../../store';
import type { ModelType } from '../../store';
import { getAvailableModels, type ModelInfo } from '../../services/llm';

interface ModelSelectProps {
  label: string;
  description: string;
  modelType: ModelType;
  category: 'fast' | 'full';
}

function ModelSelect({ label, description, modelType, category }: ModelSelectProps) {
  const models = useStore((state) => state.models);
  const setModel = useStore((state) => state.setModel);
  const apiKeys = useStore((state) => state.apiKeys);

  const currentValue = models[modelType];

  // Memoize model lists to avoid re-filtering on every render
  // Only recompute when API keys or category change
  const { availableOptions, openaiModels, openrouterModels, isCurrentAvailable } = useMemo(() => {
    const allModels = getAvailableModels({
      openAI: apiKeys.openAI,
      openRouter: apiKeys.openRouter,
    });
    const available = allModels.filter((model: ModelInfo) => model.category === category);
    return {
      availableOptions: available,
      openaiModels: available.filter((m: ModelInfo) => m.provider === 'openai'),
      openrouterModels: available.filter((m: ModelInfo) => m.provider === 'openrouter'),
      isCurrentAvailable: available.some((m: ModelInfo) => m.id === currentValue),
    };
  }, [apiKeys.openAI, apiKeys.openRouter, category, currentValue]);

  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-gray-700">{label}</label>
      <select
        value={currentValue}
        onChange={(e) => setModel(modelType, e.target.value)}
        className={`w-full rounded-md border px-3 py-2 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500 ${
          !isCurrentAvailable && availableOptions.length > 0
            ? 'border-yellow-400'
            : 'border-gray-300'
        }`}
      >
        {/* Show current value even if not available (grayed out) */}
        {!isCurrentAvailable && (
          <option value={currentValue} disabled className="text-gray-400">
            {currentValue} (requires API key)
          </option>
        )}
        {/* Group by provider */}
        {openaiModels.length > 0 && (
          <optgroup label="OpenAI">
            {openaiModels.map((model: ModelInfo) => (
              <option key={model.id} value={model.id}>
                {model.name}
              </option>
            ))}
          </optgroup>
        )}
        {openrouterModels.length > 0 && (
          <optgroup label="OpenRouter">
            {openrouterModels.map((model: ModelInfo) => (
              <option key={model.id} value={model.id}>
                {model.name}
              </option>
            ))}
          </optgroup>
        )}
      </select>
      <p className="mt-1 text-xs text-gray-500">{description}</p>
      {availableOptions.length === 0 && (
        <p className="mt-1 text-xs text-yellow-600">
          Configure an API key to enable model selection
        </p>
      )}
    </div>
  );
}

export default function ModelSettings() {
  return (
    <div className="space-y-4">
      <ModelSelect
        label="Fast Model"
        description="Used for quick hints - optimized for low latency"
        modelType="fastModel"
        category="fast"
      />
      <ModelSelect
        label="Full Model"
        description="Used for comprehensive answers - optimized for quality"
        modelType="fullModel"
        category="full"
      />
    </div>
  );
}
