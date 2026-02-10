/**
 * Quick Prompts Slice
 *
 * Zustand slice for managing quick prompt actions that appear
 * in the text selection tooltip. Supports up to 4 configurable
 * actions with CRUD operations and reordering.
 */

import type { StateCreator } from 'zustand';
import type { QuickPromptAction, QuickPromptsSlice, StoreState } from './types';

/** Maximum number of quick prompt actions allowed */
const MAX_QUICK_PROMPTS = 4;

/**
 * Default quick prompt actions seeded on first install.
 * These cover common interview assistance scenarios.
 */
export const DEFAULT_QUICK_PROMPTS: QuickPromptAction[] = [
  {
    id: 'explain',
    label: 'Explain',
    icon: 'lightbulb',
    promptTemplate: 'Explain this: {{selection}}',
    order: 0,
  },
  {
    id: 'elaborate',
    label: 'Elaborate',
    icon: 'expand',
    promptTemplate: 'Elaborate on this in more detail: {{selection}}',
    order: 1,
  },
  {
    id: 'summarize',
    label: 'Summarize',
    icon: 'compress',
    promptTemplate: 'Summarize the key points of this: {{selection}}',
    order: 2,
  },
  {
    id: 'counter',
    label: 'Counter',
    icon: 'scales',
    promptTemplate:
      'Provide a counter-argument to this point, as an interviewer might challenge it: {{selection}}',
    order: 3,
  },
];

/**
 * Create the quick prompts slice
 *
 * Provides state and actions for managing quick prompt configurations.
 * Follows the same pattern as settingsSlice and templatesSlice.
 */
export const createQuickPromptsSlice: StateCreator<StoreState, [], [], QuickPromptsSlice> = (
  set,
  get,
) => ({
  // State
  quickPrompts: [...DEFAULT_QUICK_PROMPTS],
  quickPromptsEnabled: true,

  // Actions
  setQuickPrompts: (prompts: QuickPromptAction[]) => {
    set(() => ({ quickPrompts: prompts }));
  },

  setQuickPromptsEnabled: (enabled: boolean) => {
    set(() => ({ quickPromptsEnabled: enabled }));
  },

  addQuickPrompt: (prompt: Omit<QuickPromptAction, 'id' | 'order'>) => {
    const current = get().quickPrompts;
    // Enforce max 4 limit - silently reject if at capacity
    if (current.length >= MAX_QUICK_PROMPTS) {
      return;
    }

    const newPrompt: QuickPromptAction = {
      ...prompt,
      id: crypto.randomUUID(),
      order: current.length,
    };

    set(() => ({ quickPrompts: [...current, newPrompt] }));
  },

  updateQuickPrompt: (id: string, updates: Partial<Omit<QuickPromptAction, 'id'>>) => {
    set((state) => ({
      quickPrompts: state.quickPrompts.map((p) => (p.id === id ? { ...p, ...updates } : p)),
    }));
  },

  removeQuickPrompt: (id: string) => {
    set((state) => {
      const filtered = state.quickPrompts.filter((p) => p.id !== id);
      // Recalculate order values 0..N-1
      const reordered = filtered.map((p, index) => ({ ...p, order: index }));
      return { quickPrompts: reordered };
    });
  },

  reorderQuickPrompts: (orderedIds: string[]) => {
    set((state) => {
      const promptMap = new Map(state.quickPrompts.map((p) => [p.id, p]));
      const reordered: QuickPromptAction[] = [];

      for (let i = 0; i < orderedIds.length; i++) {
        const prompt = promptMap.get(orderedIds[i]);
        if (prompt) {
          reordered.push({ ...prompt, order: i });
        }
      }

      return { quickPrompts: reordered };
    });
  },

  resetQuickPromptsToDefaults: () => {
    set(() => ({ quickPrompts: [...DEFAULT_QUICK_PROMPTS] }));
  },
});
