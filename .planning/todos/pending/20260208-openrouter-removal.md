---
created: 2026-02-08
title: Remove OpenRouter Integration
area: refactor
priority: P1
version: v2.1
complexity: low
estimate: 1 day
files:
  - src/services/llm/providers/openrouter.ts
  - src/components/settings/LLMSettings.tsx
  - src/types/models.ts
  - src/store/settingsStore.ts
---

## Problem

OpenRouter integration is no longer needed. User feedback: "OpenAI is sufficient for all needs." Maintaining multiple LLM providers adds complexity without value.

## User Requirements

- **Complete removal:** Delete all OpenRouter-related code
- **Migration path:** Existing users transition smoothly to OpenAI
- **Cleanup:** Remove UI components, types, and service files
- **No data loss:** Preserve user settings where possible

## Solution

### Architecture

1. **Files to Remove**
   - `src/services/llm/providers/openrouter.ts`
   - OpenRouter-related UI sections in Settings
   - OpenRouter model definitions
   - OpenRouter API key storage

2. **Code to Update**
   - `src/types/models.ts`: Remove OpenRouter models from MODEL_OPTIONS
   - `src/types/llm.ts`: Remove 'openrouter' from LLMProvider enum
   - `src/store/settingsStore.ts`: Remove OpenRouter settings
   - `src/components/settings/LLMSettings.tsx`: Remove OpenRouter tab/section

3. **Migration Strategy**
   ```typescript
   async function migrateFromOpenRouter() {
     const settings = await chrome.storage.local.get('llmSettings');

     if (settings.provider === 'openrouter') {
       // Show migration notice
       await showMigrationNotice();

       // Switch to OpenAI
       settings.provider = 'openai';

       // Clear OpenRouter API key
       delete settings.openRouterApiKey;

       // Reset to default OpenAI models if needed
       if (!settings.openaiApiKey) {
         settings.fastModel = 'gpt-4o-mini';
         settings.fullModel = 'gpt-4o';
       }

       await chrome.storage.local.set({ llmSettings: settings });
     }
   }
   ```

### Implementation Steps

1. Create migration utility
   - Detect existing OpenRouter users
   - Show migration notice (banner or modal)
   - Transition settings to OpenAI defaults
2. Remove OpenRouter service file
3. Update LLMProvider type and enums
4. Remove OpenRouter models from MODEL_OPTIONS
5. Update Settings UI
   - Remove OpenRouter tab/section
   - Simplify to OpenAI-only configuration
6. Clear OpenRouter data from storage
7. Update documentation/README
8. Test migration path

### Migration Notice UI

Show one-time banner when extension loads:

```
📢 Important Update

OpenRouter support has been removed. Your settings have been migrated to use OpenAI.
Please configure your OpenAI API key in Settings.

[Go to Settings] [Dismiss]
```

### Code Removal Checklist

**Services:**
- [ ] `src/services/llm/providers/openrouter.ts`
- [ ] OpenRouter client initialization in LLM service

**Types:**
- [ ] Remove `'openrouter'` from LLMProvider enum
- [ ] Remove OpenRouter models from MODEL_OPTIONS
- [ ] Remove OpenRouter-specific interfaces

**UI Components:**
- [ ] OpenRouter settings section
- [ ] OpenRouter API key input
- [ ] OpenRouter model selectors
- [ ] OpenRouter-related help text

**Storage:**
- [ ] `openRouterApiKey` from chrome.storage
- [ ] `openRouterBaseUrl` (if exists)
- [ ] Any OpenRouter-specific preferences

**Documentation:**
- [ ] README mentions of OpenRouter
- [ ] Settings documentation
- [ ] Developer docs

### Timing Considerations

- **When to do this:** After v2.0 core features shipped
- **Why not earlier:** Focus on high-value features first
- **User impact:** Minimal (few/no users likely using OpenRouter)

### Fallback Plan

If significant number of users affected:
- Extend migration window (show notice for 2 weeks)
- Provide export of OpenRouter settings
- Add temporary "legacy mode" toggle (remove in v2.2)

### Dependencies

- None (pure cleanup/removal)

### Testing Checklist

- [ ] Existing OpenRouter users see migration notice
- [ ] Settings migrate to OpenAI correctly
- [ ] OpenRouter API keys cleared from storage
- [ ] No OpenRouter UI elements remain
- [ ] No console errors after removal
- [ ] All imports/references removed
- [ ] Extension builds without errors
- [ ] Fresh install works (no OpenRouter mentions)
- [ ] Existing users can still use extension
- [ ] Documentation updated
