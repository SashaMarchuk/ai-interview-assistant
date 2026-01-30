/**
 * Store Types
 *
 * TypeScript interfaces for the Zustand store slices.
 * Defines the shape of settings, templates, and combined store state.
 */

/**
 * Capture mode for hotkey behavior
 * - 'hold': Hold hotkey to capture, release to send (default)
 * - 'toggle': Press once to start capture, press again to stop and send
 */
export type CaptureMode = 'hold' | 'toggle';

/**
 * Template type categories for interview prompt templates
 */
export type TemplateType = 'system-design' | 'coding' | 'behavioral' | 'custom';

/**
 * Prompt template structure for interview assistance
 */
export interface PromptTemplate {
  /** Unique identifier (crypto.randomUUID()) */
  id: string;
  /** Display name for the template */
  name: string;
  /** Category of interview question */
  type: TemplateType;
  /** System prompt for LLM context */
  systemPrompt: string;
  /** User prompt template with $variables for substitution */
  userPromptTemplate: string;
  /** Optional model override for this specific template */
  modelOverride?: string;
  /** Whether this is a built-in default template */
  isDefault: boolean;
}

/**
 * API key providers supported by the extension
 */
export type ApiKeyProvider = 'elevenLabs' | 'openRouter' | 'openAI';

/**
 * Model types for different use cases
 */
export type ModelType = 'fastModel' | 'fullModel';

/**
 * Hotkey actions available in the extension
 */
export type HotkeyAction = 'capture';

/**
 * Settings slice state and actions
 */
export interface SettingsSlice {
  /** API keys for external services */
  apiKeys: {
    elevenLabs: string;
    openRouter: string;
    openAI: string;
  };
  /** Model selections for different processing needs */
  models: {
    fastModel: string;
    fullModel: string;
  };
  /** Blur level for overlay (0-20, default 8) */
  blurLevel: number;
  /** Hotkey bindings for actions */
  hotkeys: {
    capture: string;
  };
  /** Capture mode: hold-to-capture or toggle */
  captureMode: CaptureMode;
  /** Set an API key for a provider */
  setApiKey: (provider: ApiKeyProvider, key: string) => void;
  /** Set a model for a specific type */
  setModel: (type: ModelType, model: string) => void;
  /** Set blur level (clamped to 0-20) */
  setBlurLevel: (level: number) => void;
  /** Set a hotkey binding for an action */
  setHotkey: (action: HotkeyAction, binding: string) => void;
  /** Set capture mode */
  setCaptureMode: (mode: CaptureMode) => void;
}

/**
 * Partial template for updates (omit id and isDefault)
 */
export type TemplateUpdate = Partial<Omit<PromptTemplate, 'id' | 'isDefault'>>;

/**
 * Template input for adding new templates (omit id, will be generated)
 */
export type NewTemplate = Omit<PromptTemplate, 'id'>;

/**
 * Templates slice state and actions
 */
export interface TemplatesSlice {
  /** Array of all prompt templates */
  templates: PromptTemplate[];
  /** Currently active template ID */
  activeTemplateId: string | null;
  /** Add a new template (ID will be generated) */
  addTemplate: (template: NewTemplate) => void;
  /** Update an existing template by ID */
  updateTemplate: (id: string, updates: TemplateUpdate) => void;
  /** Delete a template by ID */
  deleteTemplate: (id: string) => void;
  /** Set the active template by ID */
  setActiveTemplate: (id: string | null) => void;
  /** Seed default templates if none exist */
  seedDefaultTemplates: () => void;
}

/**
 * Combined store state with all slices
 */
export type StoreState = SettingsSlice & TemplatesSlice;
