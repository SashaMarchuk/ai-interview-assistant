/**
 * Templates Slice
 *
 * Zustand slice for managing prompt templates including CRUD operations,
 * active template selection, and default template seeding.
 */

import type { StateCreator } from 'zustand';
import type { TemplatesSlice, StoreState, PromptTemplate, NewTemplate, TemplateUpdate } from './types';
import { DEFAULT_TEMPLATES } from './defaultTemplates';

/**
 * Create the templates slice
 *
 * Provides state and actions for managing prompt templates.
 * Includes automatic seeding of default templates on first install.
 */
export const createTemplatesSlice: StateCreator<StoreState, [], [], TemplatesSlice> = (set, get) => ({
  // State
  templates: [],
  activeTemplateId: null,

  // Actions
  addTemplate: (template: NewTemplate) => {
    const newTemplate: PromptTemplate = {
      ...template,
      id: crypto.randomUUID(),
    };

    set((state) => ({
      templates: [...state.templates, newTemplate],
    }));
  },

  updateTemplate: (id: string, updates: TemplateUpdate) => {
    set((state) => ({
      templates: state.templates.map((template) =>
        template.id === id ? { ...template, ...updates } : template
      ),
    }));
  },

  deleteTemplate: (id: string) => {
    set((state) => {
      const newTemplates = state.templates.filter((template) => template.id !== id);
      const newActiveId = state.activeTemplateId === id ? null : state.activeTemplateId;

      return {
        templates: newTemplates,
        activeTemplateId: newActiveId,
      };
    });
  },

  setActiveTemplate: (id: string | null) => {
    set(() => ({
      activeTemplateId: id,
    }));
  },

  seedDefaultTemplates: () => {
    const { templates } = get();

    // Only seed if no templates exist
    if (templates.length === 0) {
      // Generate fresh UUIDs for default templates
      const seededTemplates: PromptTemplate[] = DEFAULT_TEMPLATES.map((template) => ({
        ...template,
        id: crypto.randomUUID(),
      }));

      set(() => ({
        templates: seededTemplates,
        activeTemplateId: seededTemplates[0]?.id ?? null,
      }));
    }
  },
});
