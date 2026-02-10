/**
 * Quick Prompt Settings Component
 *
 * Full CRUD settings for configuring quick prompt actions that appear
 * in the text selection tooltip. Includes:
 * - Enable/disable toggle
 * - Sortable list with drag-and-drop reordering (@dnd-kit)
 * - Add/Edit form with icon picker and prompt template editor
 * - Test button with sample text and response preview
 * - Reset to defaults
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useStore } from '../../store';
import type { QuickPromptAction } from '../../store';
import { ICON_MAP, ICON_OPTIONS } from '../../constants/quickPromptIcons';
import { safeSendMessage } from '../../utils/messaging';

/** Maximum number of quick prompt actions */
const MAX_QUICK_PROMPTS = 4;

/** Sample text used for testing prompt templates */
const SAMPLE_TEXT =
  'Microservices architecture provides independent deployability and technology heterogeneity, but introduces complexity in distributed data management and inter-service communication.';

// ---------- SortableItem sub-component ----------

interface SortableItemProps {
  action: QuickPromptAction;
  onEdit: (action: QuickPromptAction) => void;
  onDelete: (id: string) => void;
}

function SortableItem({ action, onEdit, onDelete }: SortableItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
    id: action.id,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2 rounded border border-gray-200 bg-white px-3 py-2"
    >
      {/* Grab handle */}
      <button
        {...attributes}
        {...listeners}
        className="cursor-grab text-gray-400 hover:text-gray-600"
        aria-label="Drag to reorder"
      >
        <span className="text-sm">{'\u2630'}</span>
      </button>
      {/* Icon + Label */}
      <span className="text-base">{ICON_MAP[action.icon] || action.icon}</span>
      <span className="flex-1 text-sm font-medium text-gray-700">{action.label}</span>
      {/* Edit button */}
      <button
        onClick={() => onEdit(action)}
        className="text-xs text-blue-600 hover:text-blue-800"
      >
        Edit
      </button>
      {/* Delete button */}
      <button
        onClick={() => onDelete(action.id)}
        className="text-xs text-red-600 hover:text-red-800"
      >
        Delete
      </button>
    </div>
  );
}

// ---------- Main component ----------

type FormMode = 'closed' | 'add' | 'edit';

interface FormState {
  label: string;
  icon: string;
  promptTemplate: string;
}

const EMPTY_FORM: FormState = { label: '', icon: 'lightbulb', promptTemplate: '' };

export default function QuickPromptSettings() {
  // Store state
  const quickPrompts = useStore((state) => state.quickPrompts);
  const quickPromptsEnabled = useStore((state) => state.quickPromptsEnabled);
  const setQuickPromptsEnabled = useStore((state) => state.setQuickPromptsEnabled);
  const addQuickPrompt = useStore((state) => state.addQuickPrompt);
  const updateQuickPrompt = useStore((state) => state.updateQuickPrompt);
  const removeQuickPrompt = useStore((state) => state.removeQuickPrompt);
  const reorderQuickPrompts = useStore((state) => state.reorderQuickPrompts);
  const resetQuickPromptsToDefaults = useStore((state) => state.resetQuickPromptsToDefaults);

  // Form state
  const [formMode, setFormMode] = useState<FormMode>('closed');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  // Test state
  const [testLoading, setTestLoading] = useState(false);
  const [testResponse, setTestResponse] = useState<string | null>(null);
  const [testError, setTestError] = useState<string | null>(null);

  // Message listener cleanup ref
  const listenerRef = useRef<((message: unknown) => void) | null>(null);

  // Sorted prompts
  const sortedPrompts = [...quickPrompts].sort((a, b) => a.order - b.order);

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  // Cleanup listener on unmount
  useEffect(() => {
    return () => {
      if (listenerRef.current) {
        chrome.runtime.onMessage.removeListener(listenerRef.current);
        listenerRef.current = null;
      }
    };
  }, []);

  // ---------- DnD ----------

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (active.id !== over?.id) {
        const oldIndex = sortedPrompts.findIndex((p) => p.id === active.id);
        const newIndex = sortedPrompts.findIndex((p) => p.id === over!.id);
        const reordered = arrayMove(sortedPrompts, oldIndex, newIndex);
        reorderQuickPrompts(reordered.map((p) => p.id));
      }
    },
    [sortedPrompts, reorderQuickPrompts],
  );

  // ---------- Form actions ----------

  function openAddForm() {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setFormMode('add');
    setTestResponse(null);
    setTestError(null);
  }

  function openEditForm(action: QuickPromptAction) {
    setForm({
      label: action.label,
      icon: action.icon,
      promptTemplate: action.promptTemplate,
    });
    setEditingId(action.id);
    setFormMode('edit');
    setTestResponse(null);
    setTestError(null);
  }

  function closeForm() {
    setFormMode('closed');
    setEditingId(null);
    setForm(EMPTY_FORM);
    setTestResponse(null);
    setTestError(null);
  }

  function handleSave() {
    // Validation
    if (!form.label.trim() || !form.promptTemplate.trim()) {
      return;
    }

    if (formMode === 'add') {
      addQuickPrompt({
        label: form.label.trim(),
        icon: form.icon,
        promptTemplate: form.promptTemplate.trim(),
      });
    } else if (formMode === 'edit' && editingId) {
      updateQuickPrompt(editingId, {
        label: form.label.trim(),
        icon: form.icon,
        promptTemplate: form.promptTemplate.trim(),
      });
    }

    closeForm();
  }

  function handleDelete(id: string) {
    removeQuickPrompt(id);
    // If we're editing this prompt, close the form
    if (editingId === id) {
      closeForm();
    }
  }

  function handleReset() {
    if (window.confirm('Reset all quick prompts to defaults? This will remove any custom prompts.')) {
      resetQuickPromptsToDefaults();
      closeForm();
    }
  }

  // ---------- Test button ----------

  function handleTest() {
    if (!form.promptTemplate.trim()) return;

    setTestLoading(true);
    setTestResponse(null);
    setTestError(null);

    const responseId = `qp-test-${Date.now()}`;
    let accumulated = '';

    // Clean up any existing listener
    if (listenerRef.current) {
      chrome.runtime.onMessage.removeListener(listenerRef.current);
    }

    // Set up temporary message listener for streaming response
    const listener = (message: unknown) => {
      const msg = message as { type?: string; responseId?: string; token?: string; status?: string; error?: string };
      if (!msg || msg.responseId !== responseId) return;

      if (msg.type === 'LLM_STREAM') {
        accumulated += msg.token || '';
        setTestResponse(accumulated);
      } else if (msg.type === 'LLM_STATUS') {
        if (msg.status === 'complete') {
          setTestLoading(false);
          chrome.runtime.onMessage.removeListener(listener);
          listenerRef.current = null;
        } else if (msg.status === 'error') {
          setTestLoading(false);
          setTestError(msg.error || 'Request failed');
          chrome.runtime.onMessage.removeListener(listener);
          listenerRef.current = null;
        }
      }
    };

    listenerRef.current = listener;
    chrome.runtime.onMessage.addListener(listener);

    // Send the quick prompt request
    safeSendMessage({
      type: 'QUICK_PROMPT_REQUEST',
      responseId,
      selectedText: SAMPLE_TEXT,
      promptTemplate: form.promptTemplate.trim(),
      actionLabel: form.label.trim() || 'Test',
    } as unknown as Record<string, unknown>).then((result) => {
      if (result.contextInvalid || !result.success) {
        setTestLoading(false);
        setTestError(result.error || 'Failed to send request');
        chrome.runtime.onMessage.removeListener(listener);
        listenerRef.current = null;
      }
    });
  }

  // ---------- Render ----------

  const isAtCapacity = quickPrompts.length >= MAX_QUICK_PROMPTS;
  const isFormValid = form.label.trim().length > 0 && form.promptTemplate.trim().length > 0;

  return (
    <div className={quickPromptsEnabled ? '' : 'opacity-50'}>
      {/* Enable/Disable toggle */}
      <div className="mb-3 flex items-center justify-between">
        <label className="text-sm font-medium text-gray-700">
          Enable Quick Prompts
        </label>
        <button
          onClick={() => setQuickPromptsEnabled(!quickPromptsEnabled)}
          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
            quickPromptsEnabled ? 'bg-blue-600' : 'bg-gray-300'
          }`}
          role="switch"
          aria-checked={quickPromptsEnabled}
        >
          <span
            className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${
              quickPromptsEnabled ? 'translate-x-4.5' : 'translate-x-0.5'
            }`}
          />
        </button>
      </div>

      {/* Sortable action list */}
      <div className={`space-y-2 ${quickPromptsEnabled ? '' : 'pointer-events-none'}`}>
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={sortedPrompts.map((p) => p.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-1">
              {sortedPrompts.map((action) => (
                <SortableItem
                  key={action.id}
                  action={action}
                  onEdit={openEditForm}
                  onDelete={handleDelete}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>

        {sortedPrompts.length === 0 && (
          <p className="py-2 text-center text-xs text-gray-400">No quick prompts configured</p>
        )}

        {/* Action buttons */}
        <div className="flex gap-2 pt-1">
          <button
            onClick={openAddForm}
            disabled={isAtCapacity || formMode !== 'closed'}
            className={`flex-1 rounded border px-3 py-1.5 text-xs font-medium transition-colors ${
              isAtCapacity || formMode !== 'closed'
                ? 'cursor-not-allowed border-gray-200 bg-gray-50 text-gray-400'
                : 'border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-100'
            }`}
            title={isAtCapacity ? 'Maximum 4 actions' : undefined}
          >
            + Add Action
          </button>
          <button
            onClick={handleReset}
            className="rounded border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-50"
          >
            Reset to Defaults
          </button>
        </div>

        {/* Add/Edit Form */}
        {formMode !== 'closed' && (
          <div className="mt-2 rounded border border-gray-200 bg-gray-50 p-3">
            <h3 className="mb-2 text-xs font-semibold text-gray-700">
              {formMode === 'add' ? 'Add Quick Prompt' : 'Edit Quick Prompt'}
            </h3>

            {/* Label input */}
            <div className="mb-2">
              <label className="mb-1 block text-xs text-gray-600">Label</label>
              <input
                type="text"
                value={form.label}
                onChange={(e) => setForm((s) => ({ ...s, label: e.target.value }))}
                placeholder="e.g., Explain"
                maxLength={20}
                className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              />
            </div>

            {/* Icon picker */}
            <div className="mb-2">
              <label className="mb-1 block text-xs text-gray-600">Icon</label>
              <div className="grid grid-cols-6 gap-1">
                {ICON_OPTIONS.map((opt) => (
                  <button
                    key={opt.key}
                    onClick={() => setForm((s) => ({ ...s, icon: opt.key }))}
                    className={`rounded border p-1.5 text-center text-base transition-colors ${
                      form.icon === opt.key
                        ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500'
                        : 'border-gray-200 hover:bg-gray-100'
                    }`}
                    title={opt.label}
                  >
                    {opt.emoji}
                  </button>
                ))}
              </div>
            </div>

            {/* Prompt template */}
            <div className="mb-2">
              <label className="mb-1 block text-xs text-gray-600">Prompt Template</label>
              <textarea
                value={form.promptTemplate}
                onChange={(e) => setForm((s) => ({ ...s, promptTemplate: e.target.value }))}
                placeholder="e.g., Explain this: {{selection}}"
                rows={3}
                className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              />
              <p className="mt-0.5 text-xs text-gray-400">
                Use {'{{selection}}'} where the selected text should appear
              </p>
            </div>

            {/* Form buttons */}
            <div className="flex gap-2">
              <button
                onClick={handleSave}
                disabled={!isFormValid}
                className={`rounded px-3 py-1.5 text-xs font-medium transition-colors ${
                  isFormValid
                    ? 'bg-blue-600 text-white hover:bg-blue-700'
                    : 'cursor-not-allowed bg-gray-200 text-gray-400'
                }`}
              >
                Save
              </button>
              <button
                onClick={closeForm}
                className="rounded border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleTest}
                disabled={!form.promptTemplate.trim() || testLoading}
                className={`ml-auto rounded px-3 py-1.5 text-xs font-medium transition-colors ${
                  !form.promptTemplate.trim() || testLoading
                    ? 'cursor-not-allowed bg-gray-200 text-gray-400'
                    : 'bg-teal-600 text-white hover:bg-teal-700'
                }`}
              >
                {testLoading ? 'Testing...' : 'Test'}
              </button>
            </div>

            {/* Test response preview */}
            {(testResponse || testError) && (
              <div className="mt-2">
                {testError ? (
                  <div className="rounded border border-red-200 bg-red-50 p-2 text-xs text-red-700">
                    {testError}
                  </div>
                ) : (
                  <div className="max-h-32 overflow-y-auto rounded border border-teal-200 bg-teal-50 p-2 text-xs text-gray-700">
                    {testResponse}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
