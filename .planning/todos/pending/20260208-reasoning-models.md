---
created: 2026-02-08
title: Reasoning Button + o-series Models Support
area: feature
priority: P0
version: v2.0
complexity: low-medium
estimate: 1-2 days
files:
  - src/types/models.ts
  - src/components/overlay/Footer.tsx
  - src/components/overlay/ReasoningPanel.tsx
  - src/components/settings/PromptsSection.tsx
  - src/services/llm/openai.ts
---

## Problem

Users need access to OpenAI's reasoning models (o1, o3-mini, etc.) for deep analytical responses. Current implementation only supports standard GPT models. Additionally, need a dedicated "Reasoning" button for generating thoughtful, step-by-step responses.

## User Requirements

- **Add o-series models:**
  - o1, o1-mini, o1-preview, o1-pro, o3-mini
- **Add new GPT-4.x models** (check latest OpenAI releases)
- **Reasoning button** in overlay footer
- **Hotkey for reasoning:** Cmd+R (or user-configurable)
- **Separate reasoning prompt** in Settings → Prompts
- **Respects global file upload toggle** (if files enabled, include in reasoning request)

## Solution

### Architecture

1. **Model Registry Updates**
   ```typescript
   // src/types/models.ts
   export const MODEL_OPTIONS: ModelOption[] = [
     // Existing GPT models...

     // Add Reasoning Models category
     {
       id: 'o1',
       name: 'o1',
       provider: 'openai',
       category: 'reasoning',
       pricing: { input: 15, output: 60 } // per 1M tokens
     },
     {
       id: 'o1-mini',
       name: 'o1-mini',
       provider: 'openai',
       category: 'reasoning',
       pricing: { input: 3, output: 12 }
     },
     {
       id: 'o1-preview',
       name: 'o1-preview',
       provider: 'openai',
       category: 'reasoning',
       pricing: { input: 15, output: 60 }
     },
     {
       id: 'o1-pro',
       name: 'o1-pro',
       provider: 'openai',
       category: 'reasoning',
       pricing: { input: 30, output: 120 } // estimate
     },
     {
       id: 'o3-mini',
       name: 'o3-mini',
       provider: 'openai',
       category: 'reasoning',
       pricing: { input: 5, output: 20 } // estimate, verify
     }
   ];
   ```

2. **UI Components**
   - **Footer Button:**
     - Icon: Brain/thinking emoji or custom SVG
     - Label: "Generate Reasoning Response"
     - Enabled only when transcript capture exists
     - Shows loading state during generation
   - **Reasoning Panel:**
     - New collapsible panel in overlay
     - Similar to Fast/Full panels but distinct styling
     - Shows step-by-step reasoning output
     - Markdown rendering support

3. **Prompt System**
   - Settings → Prompts → Reasoning Prompt (new field)
   - **Default prompt:**
     ```
     Analyze this interview question deeply. Think step-by-step about:
     1. What the interviewer is really asking
     2. Key concepts to address
     3. Optimal structure for the answer
     4. Common pitfalls to avoid

     Then provide a comprehensive, well-reasoned response.

     Reply in {detected_language}.
     {file_context_if_enabled}
     ```

4. **Hotkey Integration**
   - Default: Cmd/Ctrl+R
   - Configurable in Settings → Hotkeys (v2.1)
   - Triggers reasoning generation on current transcript

### Implementation Steps

1. Update MODEL_OPTIONS with o-series models
2. Add reasoning prompt field to settings store
3. Create ReasoningPanel component
4. Add reasoning button to Footer
5. Implement reasoning generation handler
   - Use selected reasoning model (or default to o1-mini)
   - Inject file context if enabled
   - Apply language detection
6. Hook up hotkey handler
7. Add loading/error states
8. Update Settings → Prompts UI

### Integration Points

- **File personalization:** If global "include files" checkbox enabled, inject file_id
- **Language detection (v2.1):** Auto-inject detected language
- **Cost tracking:** Record reasoning API calls with token usage
- **Hotkeys system (v2.1):** Register Cmd+R hotkey

### Technical Notes

- **Reasoning models may have different API parameters:**
  - Check OpenAI docs for o-series specific requirements
  - Some may not support streaming
  - Temperature/top_p settings may differ
- **Response format:** Reasoning models output structured thinking process
- **Cost implications:** o-series models are expensive; warn user if needed

### Default Reasoning Model

- Start with **o1-mini** as default (balance of quality/cost)
- User can override in Settings → Models → Reasoning Model

### Dependencies

- Existing OpenAI API integration
- Hotkey system (basic version for v2.0, enhanced in v2.1)
- Settings store updates

### Testing Checklist

- [ ] o-series models appear in model selector
- [ ] Reasoning button appears in footer
- [ ] Button disabled when no transcript
- [ ] Cmd+R hotkey triggers reasoning
- [ ] Reasoning prompt used correctly
- [ ] File context injected if enabled
- [ ] Loading state shows during generation
- [ ] Reasoning panel displays response
- [ ] Markdown rendering works
- [ ] Cost tracking records reasoning calls
- [ ] Error handling for API failures
- [ ] Settings persistence works
