---
phase: 08-openai-provider-support
plan: 02
subsystem: settings
tags: [store, ui, settings, openai, zustand]
status: complete
dependency-graph:
  requires:
    - "08-01"
  provides:
    - "OpenAI key in store types and persistence"
    - "OpenAI API key input in settings UI"
    - "Provider-aware model selection with optgroup UI"
  affects:
    - "08-03"
tech-stack:
  added: []
  patterns:
    - "Dynamic model filtering via provider layer"
    - "Optgroup-based provider grouping in select elements"
key-files:
  created: []
  modified:
    - "src/store/types.ts"
    - "src/store/settingsSlice.ts"
    - "src/components/settings/ApiKeySettings.tsx"
    - "src/components/settings/ModelSettings.tsx"
decisions:
  - id: "08-02-01"
    decision: "Import models from provider layer instead of duplicating"
    rationale: "Single source of truth for model definitions - changes in provider layer automatically reflected in UI"
  - id: "08-02-02"
    decision: "Optgroup-based provider grouping"
    rationale: "Clear visual separation of OpenAI vs OpenRouter models in dropdown"
  - id: "08-02-03"
    decision: "Show unavailable current model as disabled option"
    rationale: "User sees their current selection even if API key not configured, with clear indication it requires setup"
metrics:
  duration: "~8 minutes"
  completed: "2026-01-30"
---

# Phase 8 Plan 2: Store & Settings UI Summary

OpenAI API key support in store types and settings UI with provider-aware model selection.

## What Was Built

### Store Types (`src/store/types.ts`)

Updated ApiKeyProvider type:
```typescript
export type ApiKeyProvider = 'elevenLabs' | 'openRouter' | 'openAI';
```

Updated SettingsSlice.apiKeys interface:
```typescript
apiKeys: {
  elevenLabs: string;
  openRouter: string;
  openAI: string;
};
```

### Settings Slice (`src/store/settingsSlice.ts`)

Updated DEFAULT_SETTINGS with openAI field:
```typescript
apiKeys: {
  elevenLabs: '',
  openRouter: '',
  openAI: '',
},
```

The setApiKey action uses dynamic key `[provider]: key` - no changes needed.

### API Key Settings (`src/components/settings/ApiKeySettings.tsx`)

Added OpenAI to API_KEY_FIELDS array:
```typescript
{
  provider: 'openAI',
  label: 'OpenAI API Key',
  placeholder: 'Enter your OpenAI API key',
}
```

Added openAI to showKey initial state for show/hide toggle.

### Model Settings (`src/components/settings/ModelSettings.tsx`)

Complete rewrite to use provider layer:
- Removed hardcoded FAST_MODELS and FULL_MODELS arrays
- Import `getAvailableModels` from `../../services/llm`
- Dynamic model fetching based on configured API keys
- Filter models by category (fast/full)
- Group by provider using `<optgroup>` labels
- Yellow border warning when current model requires unconfigured provider
- Warning message when no API keys configured

## Task Execution

| Task | Name | Commit | Status |
|------|------|--------|--------|
| 1 | Update store types and settings slice | 90ec9d8 | Complete |
| 2 | Update ApiKeySettings and ModelSettings UI | 11e18a1 | Complete |

## Deviations from Plan

None - plan executed exactly as written.

## Verification Results

| Check | Status |
|-------|--------|
| `npx tsc --noEmit` passes | PASS |
| `npm run build` completes | PASS |
| ApiKeyProvider includes 'openAI' | PASS |
| Settings slice has openAI default | PASS |
| ApiKeySettings shows OpenAI field | PASS |
| ModelSettings imports getAvailableModels | PASS |
| Model dropdowns use optgroup | PASS |

## Key Changes

### Before (ModelSettings.tsx)
- Hardcoded FAST_MODELS and FULL_MODELS arrays
- Static model list regardless of API key configuration
- No provider indication

### After (ModelSettings.tsx)
- Dynamic model fetching from provider registry
- Only shows models for configured providers
- Optgroup labels clearly indicate OpenAI vs OpenRouter
- Warning when current selection requires unconfigured API key
- Warning when no API keys configured at all

## Technical Notes

- chrome.storage.local persistence handles the new openAI field automatically via zustand chromeStorage adapter
- The setApiKey action's dynamic key approach `[provider]: key` requires no code changes
- ModelInfo type from provider layer ensures type safety for model data
- getAvailableModels returns union of models from all configured providers

## Next Phase Readiness

Plan 08-03 (Background Service Integration) can proceed:
- [x] Store has openAI key in types and persistence
- [x] UI allows entering OpenAI API key
- [x] Model selection shows provider-aware options
- [x] getAvailableModels and resolveProviderForModel available for background service
