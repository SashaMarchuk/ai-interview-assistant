/**
 * Model Settings Component
 *
 * Allows users to select LLM models for fast hints and full answers.
 * Uses OpenRouter model identifiers.
 */

import { useStore } from '../../store';
import type { ModelType } from '../../store';

/** Fast models for quick hints - low latency, efficient */
const FAST_MODELS = [
  { id: 'google/gemini-flash-1.5', name: 'Gemini Flash 1.5' },
  { id: 'anthropic/claude-3-haiku', name: 'Claude 3 Haiku' },
  { id: 'openai/gpt-4o-mini', name: 'GPT-4o Mini' },
];

/** Full models for comprehensive answers - higher quality */
const FULL_MODELS = [
  { id: 'anthropic/claude-3-5-sonnet', name: 'Claude 3.5 Sonnet' },
  { id: 'openai/gpt-4o', name: 'GPT-4o' },
  { id: 'google/gemini-pro-1.5', name: 'Gemini Pro 1.5' },
];

interface ModelSelectProps {
  label: string;
  description: string;
  modelType: ModelType;
  options: { id: string; name: string }[];
}

function ModelSelect({ label, description, modelType, options }: ModelSelectProps) {
  const models = useStore((state) => state.models);
  const setModel = useStore((state) => state.setModel);

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <select
        value={models[modelType]}
        onChange={(e) => setModel(modelType, e.target.value)}
        className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
      >
        {options.map((model) => (
          <option key={model.id} value={model.id}>
            {model.name}
          </option>
        ))}
      </select>
      <p className="mt-1 text-xs text-gray-500">{description}</p>
    </div>
  );
}

export default function ModelSettings() {
  return (
    <div className="space-y-4">
      <ModelSelect
        label="Fast Model (Hints)"
        description="Used for quick hint generation during conversation"
        modelType="fastModel"
        options={FAST_MODELS}
      />
      <ModelSelect
        label="Full Model (Answers)"
        description="Used for comprehensive answer generation"
        modelType="fullModel"
        options={FULL_MODELS}
      />
    </div>
  );
}
