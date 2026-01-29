# Phase 6: Prompts & Settings - Research

**Researched:** 2026-01-29
**Domain:** Chrome Extension State Management, Settings UI, Prompt Templates
**Confidence:** HIGH

## Summary

This phase implements user-configurable settings (API keys, model selection, hotkeys, blur level) and a prompt template system with variable substitution. The core challenge is state management across Chrome extension contexts (popup, content script, background) with persistence via `chrome.storage.local`.

The standard approach is:
1. **Zustand** with `persist` middleware for state management
2. **webext-zustand** or custom chrome.storage adapter for cross-context state sharing
3. **Slices pattern** for modular store organization (settings slice, templates slice)
4. Simple string interpolation for prompt variable substitution (`$variable` syntax)
5. React with Tailwind for settings UI (already established in project)

**Primary recommendation:** Use Zustand with the slices pattern, a custom chrome.storage persistence adapter, and webext-zustand for state synchronization across extension contexts. Keep the popup UI simple - no need for heavy form libraries.

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| zustand | ^4.5.x | State management | Already in project scope, lightweight, excellent TypeScript support |
| webext-zustand | ^1.x | Cross-context state sync | Handles popup/content/background communication automatically |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| zustand/middleware (persist) | included | State persistence | Built-in, use with custom chrome.storage adapter |
| zustand-chrome-storage | ^1.x | Chrome storage adapter | Alternative to custom adapter if simpler approach wanted |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| webext-zustand | @webext-pegasus/store-zustand | More features (storage strategy built-in) but heavier |
| Custom storage adapter | zustand-chrome-storage | Less control but simpler setup |
| Plain Zustand | Manual chrome.runtime.sendMessage | More complex, error-prone cross-context sync |

**Installation:**
```bash
npm install zustand webext-zustand
```

## Architecture Patterns

### Recommended Project Structure
```
src/
├── store/
│   ├── index.ts              # Combined store export
│   ├── settingsSlice.ts      # API keys, model selection, blur, hotkeys
│   ├── templatesSlice.ts     # Prompt templates CRUD
│   ├── chromeStorage.ts      # Custom StateStorage for chrome.storage.local
│   └── types.ts              # Store interfaces
├── popup/
│   ├── App.tsx               # Main popup (will become settings panel)
│   ├── components/
│   │   ├── ApiKeySettings.tsx
│   │   ├── ModelSettings.tsx
│   │   ├── HotkeySettings.tsx
│   │   ├── BlurSettings.tsx
│   │   └── TemplateManager.tsx
│   └── hooks/
│       └── useSettings.ts    # Convenience hooks
└── utils/
    └── promptSubstitution.ts # Variable substitution logic
```

### Pattern 1: Zustand Slices with TypeScript
**What:** Modular store organization using the slices pattern
**When to use:** When store has distinct domains (settings vs templates)
**Example:**
```typescript
// Source: https://zustand.docs.pmnd.rs/guides/slices-pattern

// src/store/types.ts
export interface SettingsSlice {
  apiKeys: {
    elevenLabs: string;
    openRouter: string;
  };
  models: {
    fastModel: string;
    fullModel: string;
  };
  blurLevel: number;  // 0-20
  hotkeys: {
    capture: string;  // e.g., "Ctrl+Shift+C"
  };
  setApiKey: (provider: 'elevenLabs' | 'openRouter', key: string) => void;
  setModel: (type: 'fastModel' | 'fullModel', model: string) => void;
  setBlurLevel: (level: number) => void;
  setHotkey: (action: string, binding: string) => void;
}

export interface TemplatesSlice {
  templates: PromptTemplate[];
  activeTemplateId: string | null;
  addTemplate: (template: Omit<PromptTemplate, 'id'>) => void;
  updateTemplate: (id: string, updates: Partial<PromptTemplate>) => void;
  deleteTemplate: (id: string) => void;
  setActiveTemplate: (id: string) => void;
}

export interface PromptTemplate {
  id: string;
  name: string;
  type: 'system-design' | 'coding' | 'behavioral' | 'custom';
  systemPrompt: string;
  userPromptTemplate: string;  // Contains $variables
  modelOverride?: string;      // Optional per-template model
  isDefault: boolean;
}

// src/store/settingsSlice.ts
import { StateCreator } from 'zustand';
import type { SettingsSlice, TemplatesSlice } from './types';

export const createSettingsSlice: StateCreator<
  SettingsSlice & TemplatesSlice,
  [],
  [],
  SettingsSlice
> = (set) => ({
  apiKeys: {
    elevenLabs: '',
    openRouter: '',
  },
  models: {
    fastModel: 'google/gemini-flash-1.5',
    fullModel: 'anthropic/claude-3-haiku',
  },
  blurLevel: 8,
  hotkeys: {
    capture: 'Ctrl+Shift+Space',
  },
  setApiKey: (provider, key) =>
    set((state) => ({
      apiKeys: { ...state.apiKeys, [provider]: key },
    })),
  setModel: (type, model) =>
    set((state) => ({
      models: { ...state.models, [type]: model },
    })),
  setBlurLevel: (level) => set({ blurLevel: level }),
  setHotkey: (action, binding) =>
    set((state) => ({
      hotkeys: { ...state.hotkeys, [action]: binding },
    })),
});
```

### Pattern 2: Custom Chrome Storage Adapter
**What:** StateStorage implementation for chrome.storage.local
**When to use:** For persisting Zustand state in Chrome extension storage
**Example:**
```typescript
// Source: https://zustand.docs.pmnd.rs/integrations/persisting-store-data

// src/store/chromeStorage.ts
import { StateStorage } from 'zustand/middleware';

export const chromeStorage: StateStorage = {
  getItem: async (name: string): Promise<string | null> => {
    const result = await chrome.storage.local.get(name);
    return result[name] ?? null;
  },
  setItem: async (name: string, value: string): Promise<void> => {
    await chrome.storage.local.set({ [name]: value });
  },
  removeItem: async (name: string): Promise<void> => {
    await chrome.storage.local.remove(name);
  },
};
```

### Pattern 3: Combined Store with Persistence
**What:** Main store combining slices with chrome.storage persistence
**When to use:** As the single store export
**Example:**
```typescript
// src/store/index.ts
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { wrapStore } from 'webext-zustand';
import { createSettingsSlice } from './settingsSlice';
import { createTemplatesSlice } from './templatesSlice';
import { chromeStorage } from './chromeStorage';
import type { SettingsSlice, TemplatesSlice } from './types';

export type StoreState = SettingsSlice & TemplatesSlice;

export const useStore = create<StoreState>()(
  persist(
    (...a) => ({
      ...createSettingsSlice(...a),
      ...createTemplatesSlice(...a),
    }),
    {
      name: 'ai-interview-settings',
      storage: createJSONStorage(() => chromeStorage),
      partialize: (state) => ({
        // Persist only these fields
        apiKeys: state.apiKeys,
        models: state.models,
        blurLevel: state.blurLevel,
        hotkeys: state.hotkeys,
        templates: state.templates,
        activeTemplateId: state.activeTemplateId,
      }),
    }
  )
);

// For cross-context state sync
export const storeReadyPromise = wrapStore(useStore);
```

### Pattern 4: Prompt Variable Substitution
**What:** Simple string replacement for template variables
**When to use:** When rendering prompts with context data
**Example:**
```typescript
// src/utils/promptSubstitution.ts

export interface PromptVariables {
  highlighted?: string;  // User-selected text
  recent?: string;       // Recent transcript (last N seconds)
  transcript?: string;   // Full transcript
  [key: string]: string | undefined;  // Allow custom variables
}

export function substituteVariables(
  template: string,
  variables: PromptVariables
): string {
  return template.replace(/\$(\w+)/g, (match, varName) => {
    const value = variables[varName];
    return value !== undefined ? value : match;  // Keep original if not found
  });
}

// Usage:
// const prompt = substituteVariables(
//   "Explain this code: $highlighted\n\nContext: $recent",
//   { highlighted: selectedText, recent: lastMinuteTranscript }
// );
```

### Pattern 5: Default Templates on First Install
**What:** Seed default templates when storage is empty
**When to use:** On extension install or first load
**Example:**
```typescript
// src/store/defaultTemplates.ts
import type { PromptTemplate } from './types';
import { v4 as uuid } from 'uuid';

export const DEFAULT_TEMPLATES: PromptTemplate[] = [
  {
    id: uuid(),
    name: 'System Design',
    type: 'system-design',
    systemPrompt: `You are a senior software architect helping in a system design interview.
Provide clear, structured answers with diagrams described in text.
Focus on: scalability, reliability, maintainability.`,
    userPromptTemplate: `Question: $highlighted

Recent context: $recent

Provide a comprehensive system design answer.`,
    isDefault: true,
  },
  {
    id: uuid(),
    name: 'Coding',
    type: 'coding',
    systemPrompt: `You are an expert programmer helping in a coding interview.
Provide clean, efficient code with clear explanations.
Consider edge cases and time/space complexity.`,
    userPromptTemplate: `Problem: $highlighted

Recent discussion: $recent

Provide a solution with explanation.`,
    isDefault: true,
  },
  {
    id: uuid(),
    name: 'Behavioral',
    type: 'behavioral',
    systemPrompt: `You are a career coach helping with behavioral interview questions.
Use the STAR method: Situation, Task, Action, Result.
Be specific and professional.`,
    userPromptTemplate: `Question: $highlighted

Help me structure a strong STAR response.`,
    isDefault: true,
  },
];

// In templatesSlice.ts, check if empty and seed:
// if (state.templates.length === 0) {
//   set({ templates: DEFAULT_TEMPLATES, activeTemplateId: DEFAULT_TEMPLATES[0].id });
// }
```

### Anti-Patterns to Avoid
- **Storing API keys in plaintext localStorage:** Use chrome.storage.local which provides some isolation, though not encryption
- **Syncing state on every keystroke:** Use debounced updates for input fields
- **Hardcoding model names:** Store model options as configuration, not hardcoded
- **Separate stores for settings and templates:** Use slices in one store for simpler persistence
- **Manual chrome.runtime.sendMessage for state sync:** Use webext-zustand for automatic synchronization

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Cross-context state sync | Custom message passing | webext-zustand | Race conditions, reconnection logic, typing |
| Chrome storage adapter | Direct chrome.storage calls | StateStorage adapter | Integration with persist middleware |
| UUID generation | Math.random() | crypto.randomUUID() or uuid | Collision risk, not truly random |
| Form validation | Manual checks | Native HTML5 validation | Already handles edge cases |
| Debouncing | setTimeout/clearTimeout | Use React's useDeferredValue or lodash.debounce | Memory leaks, cleanup issues |

**Key insight:** Cross-context state synchronization in Chrome extensions is deceptively complex. Every context (popup, content script, background) runs in a separate process. Manual implementation requires handling connection lifecycle, message queueing, error recovery, and race conditions.

## Common Pitfalls

### Pitfall 1: Async Hydration Race Condition
**What goes wrong:** Store shows default/empty values on first render, then jumps to persisted values
**Why it happens:** chrome.storage is async; Zustand hydrates after initial render
**How to avoid:**
1. Use `storeReadyPromise` before rendering
2. Show loading state while hydrating
3. Use `onFinishHydration` callback
**Warning signs:** UI "flashes" default values before showing saved settings

### Pitfall 2: Service Worker Storage Access
**What goes wrong:** Background script loses state on wake-up
**Why it happens:** Service workers terminate after idle; global variables are lost
**How to avoid:**
1. Always read from chrome.storage.local, never rely on in-memory state in background
2. Use async initialization pattern from Chrome docs
**Warning signs:** Settings "reset" randomly, especially after browser idle

### Pitfall 3: Storage Quota Exceeded
**What goes wrong:** Settings fail to save silently
**Why it happens:** chrome.storage.local has 10MB limit; transcript storage can exceed this
**How to avoid:**
1. Don't persist transcripts in settings store
2. Use `partialize` to exclude large data
3. Handle storage errors explicitly
**Warning signs:** Settings don't persist across restarts

### Pitfall 4: Hotkey Conflicts
**What goes wrong:** User-configured hotkey doesn't work or conflicts with browser/site shortcuts
**Why it happens:** Hotkeys in content scripts compete with page shortcuts
**How to avoid:**
1. Use chrome.commands API for global shortcuts (4 max)
2. Document which shortcuts are safe
3. Allow user customization via chrome://extensions/shortcuts
**Warning signs:** Hotkey works on some sites but not others

### Pitfall 5: API Key Exposure in Content Scripts
**What goes wrong:** API keys visible in content script code/memory
**Why it happens:** Content scripts run in page context, accessible via DevTools
**How to avoid:**
1. Keep API keys in background/service worker only
2. Content script requests go through background
3. Never include keys in content script bundle
**Warning signs:** Keys visible in Sources tab or extension inspector

## Code Examples

Verified patterns from official sources:

### Settings Slice with Type Safety
```typescript
// Source: https://zustand.docs.pmnd.rs/guides/slices-pattern

import { StateCreator } from 'zustand';

interface SettingsState {
  apiKeys: { elevenLabs: string; openRouter: string };
  models: { fastModel: string; fullModel: string };
  blurLevel: number;
}

interface SettingsActions {
  setApiKey: (provider: keyof SettingsState['apiKeys'], key: string) => void;
  setModel: (type: keyof SettingsState['models'], model: string) => void;
  setBlurLevel: (level: number) => void;
}

type SettingsSlice = SettingsState & SettingsActions;

export const createSettingsSlice: StateCreator<SettingsSlice> = (set) => ({
  apiKeys: { elevenLabs: '', openRouter: '' },
  models: { fastModel: 'google/gemini-flash-1.5', fullModel: 'anthropic/claude-3-haiku' },
  blurLevel: 8,

  setApiKey: (provider, key) =>
    set((state) => ({
      apiKeys: { ...state.apiKeys, [provider]: key }
    })),

  setModel: (type, model) =>
    set((state) => ({
      models: { ...state.models, [type]: model }
    })),

  setBlurLevel: (level) => set({ blurLevel: Math.max(0, Math.min(20, level)) }),
});
```

### Popup Entry with Store Ready Check
```typescript
// Source: https://github.com/sinanbekar/webext-zustand

// entrypoints/popup/main.tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { storeReadyPromise } from '../../src/store';
import '../../src/assets/app.css';

// Wait for store to sync with background before rendering
storeReadyPromise.then(() => {
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
});
```

### API Key Input Component
```typescript
// Secure pattern for API key input

import { useState } from 'react';
import { useStore } from '../../store';

export function ApiKeySettings() {
  const { apiKeys, setApiKey } = useStore();
  const [showKey, setShowKey] = useState<Record<string, boolean>>({});

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700">
          ElevenLabs API Key
        </label>
        <div className="relative mt-1">
          <input
            type={showKey.elevenLabs ? 'text' : 'password'}
            value={apiKeys.elevenLabs}
            onChange={(e) => setApiKey('elevenLabs', e.target.value)}
            placeholder="Enter your ElevenLabs API key"
            className="block w-full rounded-md border-gray-300 shadow-sm"
          />
          <button
            type="button"
            onClick={() => setShowKey((s) => ({ ...s, elevenLabs: !s.elevenLabs }))}
            className="absolute inset-y-0 right-0 px-3 text-gray-400"
          >
            {showKey.elevenLabs ? 'Hide' : 'Show'}
          </button>
        </div>
      </div>
      {/* Similar for OpenRouter */}
    </div>
  );
}
```

### Template Manager with CRUD
```typescript
// Template management component

import { useStore } from '../../store';
import type { PromptTemplate } from '../../store/types';

export function TemplateManager() {
  const { templates, activeTemplateId, setActiveTemplate, addTemplate, deleteTemplate } = useStore();

  const handleCreateTemplate = () => {
    addTemplate({
      name: 'New Template',
      type: 'custom',
      systemPrompt: '',
      userPromptTemplate: 'Question: $highlighted\n\nContext: $recent',
      isDefault: false,
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-medium">Prompt Templates</h2>
        <button
          onClick={handleCreateTemplate}
          className="bg-blue-500 text-white px-3 py-1 rounded text-sm"
        >
          + New Template
        </button>
      </div>

      <div className="space-y-2">
        {templates.map((template) => (
          <div
            key={template.id}
            className={`p-3 border rounded cursor-pointer ${
              activeTemplateId === template.id ? 'border-blue-500 bg-blue-50' : ''
            }`}
            onClick={() => setActiveTemplate(template.id)}
          >
            <div className="flex justify-between">
              <span className="font-medium">{template.name}</span>
              <span className="text-xs text-gray-500">{template.type}</span>
            </div>
            {!template.isDefault && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  deleteTemplate(template.id);
                }}
                className="text-red-500 text-xs mt-1"
              >
                Delete
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Redux for extensions | Zustand | 2022+ | Simpler, less boilerplate, better TS |
| chrome.storage.sync for all | chrome.storage.local | MV3 | sync has strict limits (8KB/item) |
| Background pages | Service workers | MV3 (2023) | Must handle wake-up, no persistent memory |
| webext-redux | webext-zustand | 2023+ | Native Zustand support, smaller bundle |

**Deprecated/outdated:**
- **Manifest V2 background pages:** Replaced by service workers in MV3
- **chrome.storage.sync for large data:** Use local storage; sync has 8KB per item limit
- **Redux patterns:** Zustand is now preferred for extensions due to simplicity

## Open Questions

Things that couldn't be fully resolved:

1. **Hotkey Customization Depth**
   - What we know: chrome.commands API allows 4 keyboard shortcuts max, user can customize via chrome://extensions/shortcuts
   - What's unclear: Whether additional in-page hotkeys (beyond chrome.commands) need custom key capture
   - Recommendation: Use chrome.commands for the main capture hotkey; if more shortcuts needed, implement custom key listener in content script with user-configurable bindings stored in settings

2. **Model List Source**
   - What we know: OpenRouter provides many models; need a curated list for UI
   - What's unclear: Whether to hardcode popular models or fetch from OpenRouter API
   - Recommendation: Start with hardcoded list of popular models (10-15); can add API fetch later if needed

3. **webext-zustand vs @webext-pegasus/store-zustand**
   - What we know: Both work; pegasus has built-in storage strategy option
   - What's unclear: Stability and maintenance of each
   - Recommendation: Start with webext-zustand (more focused, smaller); migrate if issues arise

## Sources

### Primary (HIGH confidence)
- [Chrome Storage API](https://developer.chrome.com/docs/extensions/reference/api/storage) - Official documentation for chrome.storage methods, quotas, events
- [Zustand Persist Middleware](https://zustand.docs.pmnd.rs/middlewares/persist) - Official documentation for custom storage adapters
- [Zustand Slices Pattern](https://zustand.docs.pmnd.rs/guides/slices-pattern) - Official guide for modular store organization
- [Chrome Commands API](https://developer.chrome.com/docs/extensions/reference/api/commands) - Official keyboard shortcut API

### Secondary (MEDIUM confidence)
- [webext-zustand](https://github.com/sinanbekar/webext-zustand) - Cross-context state sync library
- [zustand-chrome-storage](https://github.com/brokeboiflex/zustand-chrome-storage) - Alternative chrome storage adapter
- [WXT Documentation](https://wxt.dev/) - Framework patterns for extension development

### Tertiary (LOW confidence)
- WebSearch community patterns for React settings UI - Multiple blog posts, general patterns

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Verified with official Zustand and Chrome docs
- Architecture: HIGH - Slices pattern well-documented; chrome.storage adapter is straightforward
- Pitfalls: MEDIUM - Based on official docs + community experience; some edge cases may exist

**Research date:** 2026-01-29
**Valid until:** 60 days (stable technologies, Zustand API unlikely to change)
