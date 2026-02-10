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
 * Reasoning effort levels for o-series and GPT-5 reasoning models.
 * Defined independently from LLMProvider to avoid circular dependency
 * between store and services layers. Both define the same 3-value union.
 */
export type ReasoningEffort = 'low' | 'medium' | 'high';

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
  /** Transcription language code (ISO 639-3, e.g. 'eng', 'ukr') - empty for auto-detect */
  transcriptionLanguage: string;
  /** Reasoning effort for reasoning models (o-series, GPT-5) */
  reasoningEffort: ReasoningEffort;
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
  /** Set transcription language (ISO 639-3 code or empty for auto-detect) */
  setTranscriptionLanguage: (language: string) => void;
  /** Set reasoning effort for reasoning models */
  setReasoningEffort: (effort: ReasoningEffort) => void;
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
 * Consent slice state and actions
 *
 * Manages privacy policy acceptance, per-session recording consent,
 * and consent reset functionality. Fields are persisted via partialize
 * so consent survives popup close/reopen.
 */
export interface ConsentSlice {
  /** Whether user has accepted the privacy policy (first-time gate) */
  privacyPolicyAccepted: boolean;
  /** ISO timestamp when privacy policy was accepted */
  privacyPolicyAcceptedAt: string | null;
  /** Whether user permanently dismissed per-session recording consent */
  recordingConsentDismissedPermanently: boolean;
  /** Accept the privacy policy (sets accepted=true with timestamp) */
  acceptPrivacyPolicy: () => void;
  /** Permanently dismiss the per-session recording consent */
  dismissRecordingConsentPermanently: () => void;
  /** Reset all consent acknowledgments (re-trigger all flows) */
  resetAllConsents: () => void;
}

/**
 * Quick prompt action configuration for text selection tooltip
 */
export interface QuickPromptAction {
  /** Unique identifier */
  id: string;
  /** Display label (e.g., "Explain") */
  label: string;
  /** Icon key from predefined set (e.g., 'lightbulb', 'expand') */
  icon: string;
  /** Prompt template with {{selection}} placeholder */
  promptTemplate: string;
  /** Display ordering (0-based) */
  order: number;
}

/**
 * Quick prompts slice state and actions
 */
export interface QuickPromptsSlice {
  /** Array of configured quick prompt actions */
  quickPrompts: QuickPromptAction[];
  /** Whether quick prompts feature is enabled */
  quickPromptsEnabled: boolean;
  /** Replace all quick prompts */
  setQuickPrompts: (prompts: QuickPromptAction[]) => void;
  /** Enable or disable quick prompts feature */
  setQuickPromptsEnabled: (enabled: boolean) => void;
  /** Add a new quick prompt (max 4, generates id and order) */
  addQuickPrompt: (prompt: Omit<QuickPromptAction, 'id' | 'order'>) => void;
  /** Update an existing quick prompt by ID */
  updateQuickPrompt: (id: string, updates: Partial<Omit<QuickPromptAction, 'id'>>) => void;
  /** Remove a quick prompt by ID and reorder remaining */
  removeQuickPrompt: (id: string) => void;
  /** Reorder quick prompts by providing ordered array of IDs */
  reorderQuickPrompts: (orderedIds: string[]) => void;
  /** Reset quick prompts to factory defaults */
  resetQuickPromptsToDefaults: () => void;
}

/**
 * Combined store state with all slices
 */
export type StoreState = SettingsSlice & TemplatesSlice & ConsentSlice & QuickPromptsSlice;
