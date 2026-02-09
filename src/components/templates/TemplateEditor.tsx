/**
 * TemplateEditor Component
 *
 * Form for editing prompt template properties including name, type,
 * system prompt, user prompt template, and model override.
 *
 * Features:
 * - Debounced updates to prevent excessive chrome.storage writes
 * - Disabled editing for default template name/type
 * - Variable hints for prompt template fields
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useStore } from '../../store';
import type { TemplateType } from '../../store/types';
import { OPENROUTER_MODELS, OPENAI_MODELS } from '../../services/llm';

/**
 * Template type options for the type dropdown
 */
const TYPE_OPTIONS: { value: TemplateType; label: string }[] = [
  { value: 'system-design', label: 'System Design' },
  { value: 'coding', label: 'Coding' },
  { value: 'behavioral', label: 'Behavioral' },
  { value: 'custom', label: 'Custom' },
];

/**
 * Custom hook for debounced value updates
 *
 * Note: delay is included in deps for correctness - if delay ever changes,
 * the callback will use the new value. This is intentional.
 * Cleans up pending timeout on unmount to prevent memory leaks and stale calls.
 */
function useDebouncedCallback<T>(callback: (value: T) => void, delay: number): (value: T) => void {
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const callbackRef = useRef(callback);

  // Always keep the ref pointing to the latest callback to avoid stale closures
  useEffect(() => {
    callbackRef.current = callback;
  });

  // Clean up pending timeout on unmount to prevent stale callback execution
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return useCallback(
    (value: T) => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      timeoutRef.current = setTimeout(() => {
        callbackRef.current(value);
      }, delay);
    },
    [delay],
  );
}

export function TemplateEditor() {
  const templates = useStore((state) => state.templates);
  const activeTemplateId = useStore((state) => state.activeTemplateId);
  const updateTemplate = useStore((state) => state.updateTemplate);

  // Find the active template
  const template = templates.find((t) => t.id === activeTemplateId);

  /**
   * Model options for the model override dropdown.
   * Built from provider model lists to ensure consistency.
   */
  const modelOptions = useMemo(() => {
    const options = [{ value: '', label: 'Use default model' }];

    // Add OpenRouter models (full category for template overrides)
    for (const model of OPENROUTER_MODELS.filter((m) => m.category === 'full')) {
      options.push({ value: model.id, label: model.name });
    }

    // Add OpenAI direct models (full category)
    for (const model of OPENAI_MODELS.filter((m) => m.category === 'full')) {
      options.push({ value: model.id, label: `${model.name} (OpenAI Direct)` });
    }

    return options;
  }, []);

  // Local state for form values (enables debouncing)
  const [localName, setLocalName] = useState('');
  const [localType, setLocalType] = useState<TemplateType>('custom');
  const [localSystemPrompt, setLocalSystemPrompt] = useState('');
  const [localUserPromptTemplate, setLocalUserPromptTemplate] = useState('');
  const [localModelOverride, setLocalModelOverride] = useState('');

  // Sync local state when template changes (controlled form pattern)
  /* eslint-disable react-hooks/set-state-in-effect -- syncing local form state from parent prop is intentional */
  useEffect(() => {
    if (template) {
      setLocalName(template.name);
      setLocalType(template.type);
      setLocalSystemPrompt(template.systemPrompt);
      setLocalUserPromptTemplate(template.userPromptTemplate);
      setLocalModelOverride(template.modelOverride || '');
    }
  }, [template]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Debounced update for system prompt
  const debouncedUpdateSystemPrompt = useDebouncedCallback(
    useCallback(
      (value: string) => {
        if (activeTemplateId) {
          updateTemplate(activeTemplateId, { systemPrompt: value });
        }
      },
      [activeTemplateId, updateTemplate],
    ),
    500,
  );

  // Debounced update for user prompt template
  const debouncedUpdateUserPrompt = useDebouncedCallback(
    useCallback(
      (value: string) => {
        if (activeTemplateId) {
          updateTemplate(activeTemplateId, { userPromptTemplate: value });
        }
      },
      [activeTemplateId, updateTemplate],
    ),
    500,
  );

  // Handlers for immediate updates (name, type, model)
  const handleNameChange = (value: string) => {
    setLocalName(value);
    if (activeTemplateId && !template?.isDefault) {
      updateTemplate(activeTemplateId, { name: value });
    }
  };

  const handleTypeChange = (value: TemplateType) => {
    setLocalType(value);
    if (activeTemplateId && !template?.isDefault) {
      updateTemplate(activeTemplateId, { type: value });
    }
  };

  const handleModelOverrideChange = (value: string) => {
    setLocalModelOverride(value);
    if (activeTemplateId) {
      updateTemplate(activeTemplateId, {
        modelOverride: value || undefined,
      });
    }
  };

  // Handlers for debounced updates (prompts)
  const handleSystemPromptChange = (value: string) => {
    setLocalSystemPrompt(value);
    debouncedUpdateSystemPrompt(value);
  };

  const handleUserPromptChange = (value: string) => {
    setLocalUserPromptTemplate(value);
    debouncedUpdateUserPrompt(value);
  };

  // No template selected state
  if (!template) {
    return (
      <div className="flex h-48 items-center justify-center text-gray-500">
        <p>Select a template to edit</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h3 className="mb-2 text-sm font-medium text-gray-700">Edit Template</h3>

      {/* Name Field */}
      <div>
        <label htmlFor="template-name" className="mb-1 block text-sm font-medium text-gray-700">
          Name
        </label>
        <input
          id="template-name"
          type="text"
          value={localName}
          onChange={(e) => handleNameChange(e.target.value)}
          disabled={template.isDefault}
          className={`w-full rounded border px-3 py-2 text-sm ${
            template.isDefault
              ? 'cursor-not-allowed bg-gray-100 text-gray-500'
              : 'bg-white text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-500'
          } `}
        />
        {template.isDefault && (
          <p className="mt-1 text-xs text-gray-500">Default templates cannot be renamed</p>
        )}
      </div>

      {/* Type Field */}
      <div>
        <label htmlFor="template-type" className="mb-1 block text-sm font-medium text-gray-700">
          Type
        </label>
        <select
          id="template-type"
          value={localType}
          onChange={(e) => handleTypeChange(e.target.value as TemplateType)}
          disabled={template.isDefault}
          className={`w-full rounded border px-3 py-2 text-sm ${
            template.isDefault
              ? 'cursor-not-allowed bg-gray-100 text-gray-500'
              : 'bg-white text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-500'
          } `}
        >
          {TYPE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      {/* System Prompt Field */}
      <div>
        <label htmlFor="system-prompt" className="mb-1 block text-sm font-medium text-gray-700">
          System Prompt
        </label>
        <textarea
          id="system-prompt"
          value={localSystemPrompt}
          onChange={(e) => handleSystemPromptChange(e.target.value)}
          placeholder="Instructions for the AI..."
          rows={4}
          className="min-h-[100px] w-full resize-y rounded border bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
        />
        <p className="mt-1 text-xs text-gray-500">This sets the AI's behavior and expertise</p>
      </div>

      {/* User Prompt Template Field */}
      <div>
        <label htmlFor="user-prompt" className="mb-1 block text-sm font-medium text-gray-700">
          User Prompt Template
        </label>
        <textarea
          id="user-prompt"
          value={localUserPromptTemplate}
          onChange={(e) => handleUserPromptChange(e.target.value)}
          placeholder="Question: $highlighted&#10;&#10;Context: $recent"
          rows={4}
          className="min-h-[100px] w-full resize-y rounded border bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
        />
        <p className="mt-1 text-xs text-gray-500">Variables: $highlighted, $recent, $transcript</p>
      </div>

      {/* Model Override Field */}
      <div>
        <label htmlFor="model-override" className="mb-1 block text-sm font-medium text-gray-700">
          Model Override
        </label>
        <select
          id="model-override"
          value={localModelOverride}
          onChange={(e) => handleModelOverrideChange(e.target.value)}
          className="w-full rounded border bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
        >
          {modelOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-gray-500">
          Override the default full model for this template
        </p>
      </div>
    </div>
  );
}

export default TemplateEditor;
