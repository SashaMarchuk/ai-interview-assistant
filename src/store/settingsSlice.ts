/**
 * Settings Slice
 *
 * Zustand slice for user settings including API keys, model selections,
 * blur level, and hotkey bindings.
 */

import type { StateCreator } from 'zustand';
import type { SettingsSlice, StoreState, ApiKeyProvider, ModelType, HotkeyAction, CaptureMode } from './types';

/**
 * Default settings values
 */
const DEFAULT_SETTINGS = {
  apiKeys: {
    elevenLabs: '',
    openRouter: '',
    openAI: '',
  },
  models: {
    fastModel: 'gpt-4o-mini',
    fullModel: 'gpt-4o',
  },
  blurLevel: 8,
  hotkeys: {
    capture: 'Ctrl+Shift+Space',
  },
  captureMode: 'hold' as CaptureMode,
  transcriptionLanguage: '', // Empty = auto-detect
} as const;

/**
 * Clamp a value between min and max
 */
const clamp = (value: number, min: number, max: number): number => {
  return Math.max(min, Math.min(max, value));
};

/**
 * Create the settings slice
 *
 * Provides state and actions for managing user settings.
 * Uses immutable updates via Zustand's set function.
 */
export const createSettingsSlice: StateCreator<StoreState, [], [], SettingsSlice> = (set) => ({
  // State
  apiKeys: { ...DEFAULT_SETTINGS.apiKeys },
  models: { ...DEFAULT_SETTINGS.models },
  blurLevel: DEFAULT_SETTINGS.blurLevel,
  hotkeys: { ...DEFAULT_SETTINGS.hotkeys },
  captureMode: DEFAULT_SETTINGS.captureMode,
  transcriptionLanguage: DEFAULT_SETTINGS.transcriptionLanguage,

  // Actions
  setApiKey: (provider: ApiKeyProvider, key: string) => {
    set((state) => ({
      apiKeys: {
        ...state.apiKeys,
        [provider]: key,
      },
    }));
  },

  setModel: (type: ModelType, model: string) => {
    set((state) => ({
      models: {
        ...state.models,
        [type]: model,
      },
    }));
  },

  setBlurLevel: (level: number) => {
    set(() => ({
      blurLevel: clamp(level, 0, 20),
    }));
  },

  setHotkey: (action: HotkeyAction, binding: string) => {
    set((state) => ({
      hotkeys: {
        ...state.hotkeys,
        [action]: binding,
      },
    }));
  },

  setCaptureMode: (mode: CaptureMode) => {
    set(() => ({
      captureMode: mode,
    }));
  },

  setTranscriptionLanguage: (language: string) => {
    set(() => ({
      transcriptionLanguage: language,
    }));
  },
});
