# Architecture Patterns: v2.0 Enhanced Experience Integration

**Domain:** Chrome MV3 Extension -- File Personalization, Cost Tracking, Reasoning Models, Markdown Rendering, Selection Tooltips, Transcript Editing
**Researched:** 2026-02-09
**Confidence:** HIGH (codebase analysis) / MEDIUM (API integrations based on official docs + web research)

---

## Current Architecture (Post v1.1)

Four execution contexts connected via `chrome.runtime.sendMessage`:

```
+-------------------------------+     +-----------------------------+
| Background Service Worker     |     | Offscreen Document          |
| (entrypoints/background.ts)   |     | (entrypoints/offscreen/)    |
|                               |     |                             |
| - Message hub (switch/case)   |<--->| - AudioContext + Worklet    |
| - LLM API calls (fetch SSE)  |     | - WebSocket to ElevenLabs   |
| - Tab capture stream IDs     |     | - Mic capture               |
| - Zustand store (primary)    |     | - PCM 16-bit 16kHz          |
| - Encrypted chrome.storage   |     | - Full DOM access           |
| - TranscriptBuffer (debounced)|     +-----------------------------+
| - CircuitBreakerManager      |            ^
| - Keep-alive interval        |            |
+-------------------------------+     chrome.runtime.sendMessage
       ^        ^
       |        |
       v        v
+-------------+ +---------------------------+
| Popup       | | Content Script            |
| (React)     | | (React in Shadow DOM)     |
|             | |                           |
| - Settings  | | - Overlay (react-rnd)     |
| - Controls  | | - TranscriptPanel         |
| - Templates | | - ResponsePanel           |
| - Zustand   | | - CaptureIndicator        |
+-------------+ | - HealthIndicator         |
                | - Hotkey capture mode      |
                | - Custom events bridge     |
                | - Zustand sync (webext)    |
                +---------------------------+
```

**Key facts for v2.0 integration:**

1. **LLM Provider Abstraction:** `LLMProvider` interface with `streamResponse()`. Two implementations: `OpenAIProvider` and `OpenRouterProvider`. Both use shared `streamSSE()` utility with `eventsource-parser`. Already handles reasoning model detection via `isReasoningModel()` (checks o1/o3 prefixes, uses `max_completion_tokens`).

2. **State Architecture:** Zustand store with slices (`settingsSlice`, `templatesSlice`, `consentSlice`). Persisted to `chrome.storage.local` via encrypted adapter. Synced across contexts via `webext-zustand`. Current `partialize` list: `apiKeys, models, blurLevel, hotkeys, captureMode, transcriptionLanguage, templates, activeTemplateId, privacyPolicyAccepted, privacyPolicyAcceptedAt, recordingConsentDismissedPermanently`.

3. **Transcript State:** `TranscriptBuffer` class in background.ts with debounced persistence to `chrome.storage.local`. Content script maintains module-level `currentTranscript: TranscriptEntry[]` updated via `TRANSCRIPT_UPDATE` custom events. Entries are `{ id, speaker, text, timestamp, isFinal }`.

4. **Response Rendering:** `ResponsePanel` renders `fastHint` and `fullAnswer` as plain text with Tailwind classes. No markdown parsing. Response state flows: background -> `LLM_STREAM`/`LLM_STATUS` messages -> content script `handleLLMStream()` -> custom event `llm-response-update` -> Overlay React state.

5. **Shadow DOM:** Content script uses `createShadowRootUi(ctx, {...})` from WXT. All overlay CSS is isolated within Shadow DOM. Tailwind styles are injected into shadow root via `cssInjectionMode: 'ui'`.

6. **chrome.storage.local Usage:** Settings store (~2KB), transcript buffer (variable, potentially large during long interviews), overlay position state, circuit breaker state, transcription active flag. No explicit size monitoring.

7. **Message System:** Discriminated union `ExtensionMessage` with exhaustive switch in `handleMessage()`. Adding new message types requires updating: `MessageType` union, message interface, `ExtensionMessage` union, switch cases in background.ts, and content.tsx listener.

8. **Prompt System:** `PromptBuilder.buildPrompt()` takes `DualLLMRequest` + `PromptTemplate` -> produces `{ system, user, userFull }`. Variable substitution via `$highlighted`, `$recent`, `$transcript` using `substituteVariables()`. The `PromptVariables` interface allows arbitrary string keys via index signature.

---

## Feature Integration Analysis

### 1. File Personalization (Resume/JD Upload)

**What it is:** User uploads PDF/text files (resume, job description) that get injected into LLM prompts as context.

**Architecture decision: Client-side text extraction, NOT OpenAI Files API.**

Rationale:
- The OpenAI Files API uploads to OpenAI servers and generates `file_id` references. The Chat Completions API does NOT directly support `file_id` references -- file content must be passed inline in messages or used through the Assistants/Responses API. [MEDIUM confidence -- based on OpenAI community forums and docs]
- Since the extension supports both OpenAI and OpenRouter, file content must be provider-agnostic.
- PDFs for resumes are typically 1-3 pages -- client-side text extraction is trivial.
- Client-side extraction keeps data local (privacy win) and works across all providers.

**Implementation approach:**

```
[Popup Settings UI]
    |
    v
FileReader API (browser) --> Extract text from PDF/DOCX/TXT
    |
    v
Store extracted text in IndexedDB (via idb library)
    |
    v
[Background: PromptBuilder]
    |
    Inject file context as $resume / $jobDescription variables
    into system prompt or user prompt template
    |
    v
[Provider streamResponse() -- unchanged]
```

**New components:**
| Component | Location | Purpose |
|-----------|----------|---------|
| `FileUploadPanel` | `src/components/settings/FileUploadPanel.tsx` | Popup UI for file upload/management |
| `fileExtractionService` | `src/services/files/extraction.ts` | PDF/text parsing (pdf.js for PDF, raw for TXT) |
| `fileStorageService` | `src/services/files/storage.ts` | IndexedDB CRUD for extracted file content |
| `filesSlice` | `src/store/filesSlice.ts` | Zustand slice for file metadata (name, type, size, extractedLength) |

**Modified components:**
| Component | Change |
|-----------|--------|
| `PromptBuilder.ts` | Add `$resume`, `$jobDescription` variables to `PromptVariables` |
| `promptSubstitution.ts` | No changes needed -- `PromptVariables` already has `[key: string]: string \| undefined` index signature |
| `store/types.ts` | Add `FilesSlice` types |
| `store/index.ts` | Add `filesSlice` to combined store, update `partialize` |
| `entrypoints/popup/App.tsx` | Add file upload section in settings |

**Data flow:**
- File metadata (name, type, uploadedAt) in Zustand store (synced via webext-zustand, small ~500 bytes)
- File content (extracted text) in IndexedDB (large, not synced -- only needed in background context for prompt building)
- Background reads from IndexedDB when building prompts. This means `buildPrompt()` becomes async or file content is pre-loaded into memory.

**Why IndexedDB for content:**
- chrome.storage.local has 10MB quota (expandable with `unlimitedStorage` permission). IndexedDB uses quota-based storage (~60% of disk for Chrome, effectively unlimited for small data).
- Resume text can be 5-50KB, job descriptions 2-20KB -- manageable in chrome.storage.local but IndexedDB is the correct pattern for file-like content.
- `idb` library provides Promise-based wrapper, ~1.2KB gzipped.
- IndexedDB is available in service workers. [HIGH confidence -- confirmed via Chrome docs]

**Critical design decision: Pre-load vs lazy-load file content.**

Option A (recommended): Pre-load file content into module-level variable in background.ts at startup and on file changes. PromptBuilder stays synchronous.
```typescript
// background.ts
let resumeText: string | null = null;
let jobDescText: string | null = null;

// Load on startup and when files change
async function loadFileContent() {
  const db = await getDB();
  const resume = await db.get('files', 'resume');
  resumeText = resume?.extractedText ?? null;
  // ... same for job description
}
```

Option B: Make buildPrompt() async. Requires changing handleLLMRequest() to await prompt building.

Option A is simpler because `buildPrompt()` is called synchronously in the hot path and the file content rarely changes.

**Shadow DOM impact:** None -- file upload happens in popup, not content script.

**Confidence:** HIGH (standard patterns, no external API dependency)

---

### 2. Cost Tracking Dashboard

**What it is:** Track token usage per request, calculate costs per provider/model, display session and historical cost summaries.

**Architecture decision: Capture usage from streaming responses, store in IndexedDB.**

**Data capture points (two different approaches by provider):**

**OpenAI:** Send `stream_options: { include_usage: true }` in the request body. The final SSE chunk includes a `usage` object: `{ prompt_tokens, completion_tokens, total_tokens }` with `completion_tokens_details` (including `reasoning_tokens`). The `choices` array is empty in this final chunk.
[HIGH confidence -- confirmed via OpenAI streaming docs and community posts]

**OpenRouter:** Usage data is automatically included in the final SSE chunk. No special parameter needed. The response includes `usage: { prompt_tokens, completion_tokens, total_tokens, cost }` plus `completion_tokens_details: { reasoning_tokens }`. OpenRouter also provides `cost` directly in the usage object, and a separate `/api/v1/generation` endpoint for async cost lookup.
[HIGH confidence -- confirmed via OpenRouter docs at openrouter.ai/docs/guides/guides/usage-accounting]

```
[streamSSE.ts]
    |
    Parse final chunk with usage data
    (detect: choices[0] empty + usage object present)
    |
    v
New callback: onUsage(usage: UsageData)
    |
    v
[Background handleLLMRequest()]
    |
    Record to CostTracker service
    |
    v
[IndexedDB: cost_records store]
    |
    v
[Popup: CostDashboard component reads from IndexedDB]
```

**Key modification to streamSSE.ts:**

The current `onEvent` handler in the `createParser` callback needs to additionally check for usage data in parsed chunks:

```typescript
// In streamSSE.ts onEvent handler, after content extraction:
if (chunk.usage) {
  // Final usage chunk - may have empty choices
  options.onUsage?.({
    promptTokens: chunk.usage.prompt_tokens,
    completionTokens: chunk.usage.completion_tokens,
    totalTokens: chunk.usage.total_tokens,
    reasoningTokens: chunk.usage.completion_tokens_details?.reasoning_tokens,
  });
}
```

**New components:**
| Component | Location | Purpose |
|-----------|----------|---------|
| `CostTracker` | `src/services/cost/costTracker.ts` | Record/query usage data from IndexedDB |
| `CostDashboard` | `src/components/CostDashboard.tsx` | Popup UI with per-model, per-session, historical costs |
| `modelPricing` | `src/services/cost/pricing.ts` | Static pricing table per model (input/output per 1M tokens) |
| `CostSummaryWidget` | `src/overlay/CostSummaryWidget.tsx` | Optional small widget in overlay footer showing session cost |

**Modified components:**
| Component | Change |
|-----------|--------|
| `streamSSE.ts` | Parse `usage` from final chunk, call `onUsage` callback |
| `LLMProvider.ts` | Add optional `onUsage` to `ProviderStreamOptions` |
| `OpenAIProvider.ts` | Add `stream_options: { include_usage: true }` to request body |
| `OpenRouterProvider.ts` | Usage already included; pass through `onUsage` callback |
| `background.ts` | Wire `onUsage` callback in `fireModelRequest()`, save to CostTracker |
| `entrypoints/popup/App.tsx` | Add cost dashboard tab/section |

**IndexedDB schema for cost records:**

```typescript
interface CostRecord {
  id: string;                    // crypto.randomUUID()
  timestamp: number;             // Date.now()
  sessionId: string;             // Generated per transcription session
  responseId: string;            // Links to LLM request
  provider: 'openai' | 'openrouter';
  model: string;                 // e.g., 'gpt-4o-mini'
  modelType: 'fast' | 'full';
  promptTokens: number;
  completionTokens: number;
  reasoningTokens: number;       // For o-series models
  totalTokens: number;
  estimatedCost: number;         // Calculated from pricing table (USD)
  reportedCost?: number;         // OpenRouter reports actual cost
}
```

**Pricing table approach:**
- Static JSON mapping `modelId -> { inputPer1M, outputPer1M }` in code
- Updated manually when pricing changes (acceptable for private-use extension)
- For OpenRouter, use the reported `cost` field directly when available (more accurate than calculation)
- Reasoning tokens counted as output tokens for cost calculation

**Storage architecture:**
- IndexedDB `ai-interview-assistant` database, `costRecords` object store, indexed by `timestamp`, `sessionId`, `model`
- Each record is ~200 bytes. 1000 requests = ~200KB. No size concerns.
- Not in Zustand store -- only popup reads it, background writes it

**Session ID management:**
- Generate `sessionId` when transcription starts (`START_TRANSCRIPTION` handler)
- Store in module-level variable in background.ts
- Include in every `CostRecord`

**Shadow DOM impact:** None -- cost dashboard is in popup. Optional session cost widget in overlay footer uses existing Tailwind styles.

**Service Worker constraint:** IndexedDB available in service workers. CostTracker writes from background, reads from popup.

**Confidence:** HIGH (OpenRouter usage format verified from official docs; OpenAI `stream_options` is well-documented standard)

---

### 3. Reasoning Models Support (o-series)

**What it is:** Properly support o1, o1-mini, o3, o3-mini, o4-mini models with their unique API parameters, plus a dedicated reasoning effort control and optional reasoning token display.

**Current state analysis:**

The codebase ALREADY handles reasoning models partially:
- `OpenAIProvider.ts` line 19-31: `isReasoningModel()` detects o1/o3 prefixes
- Line 77-79: Uses `max_completion_tokens` instead of `max_tokens` for reasoning models
- `OpenRouterProvider.ts` lines 18-29: Same detection logic
- Model list includes o1, o1-mini, o1-preview, o3-mini

**What's missing (verified against official docs):**

1. **`developer` message role:** Reasoning models treat `system` as `developer` internally. Current code sends `{ role: 'system' }` which works (API auto-converts) but `developer` is the explicit correct role. [HIGH confidence -- confirmed via Azure OpenAI docs and OpenAI community]

2. **`reasoning_effort` parameter:** Not supported. All reasoning models (o1, o1-mini, o3, o3-mini, o4-mini) support `low`, `medium`, `high` values. [HIGH confidence -- confirmed via official docs]

3. **Unsupported parameters:** Reasoning models reject `temperature`, `top_p`, `presence_penalty`, `frequency_penalty`, `logprobs`, `top_logprobs`, `logit_bias`. Current code doesn't send these, so no issue. [HIGH confidence]

4. **Streaming support differences:**
   - o1: Does NOT support streaming (Chat Completions API) [HIGH confidence]
   - o1-mini: Supports streaming [HIGH confidence]
   - o3: Supports streaming (limited access via direct OpenAI) [MEDIUM confidence]
   - o3-mini: Supports streaming [HIGH confidence]
   - o4-mini: Supports streaming [HIGH confidence]

   The current `streamSSE()` flow needs a fallback for o1 (non-streaming fetch). This is the most significant integration challenge.

5. **Reasoning tokens in response:** Streaming chunks include `reasoning_details` in `choices[].delta` (via OpenRouter). For OpenAI, `reasoning_summary` is available for o3 and o4-mini only. [MEDIUM confidence -- availability varies by model and access level]

6. **Model list outdated:** Missing o3, o4-mini from both provider model lists. o3-pro and deep-research variants are not suitable for real-time use (long latency).

7. **o4-mini prefix detection:** Current `OPENAI_REASONING_MODEL_PREFIXES = ['o1', 'o3']` -- needs `'o4'` added. [HIGH confidence]

**Architecture changes:**

```
[Settings: reasoning_effort selector (per-model or global)]
    |
    v
[Store: settingsSlice -- add reasoningEffort: 'low' | 'medium' | 'high']
    |
    v
[Provider.streamResponse()]
    |
    For reasoning models:
    |-- Use 'developer' role instead of 'system'
    |-- Add reasoning_effort to request body
    |-- For o1: use non-streaming fetch, call onToken with full response
    |-- For others: use existing streamSSE()
    |
    v
[streamSSE -- optionally parse reasoning_details from delta]
    |
    v
[Content script: ReasoningPanel (new) -- show thinking summary]
```

**Critical: o1 non-streaming fallback.**

Since o1 does not support streaming, the provider needs a non-streaming code path:

```typescript
// In OpenAIProvider.streamResponse():
if (model === 'o1' && !canStream) {
  // Non-streaming: single fetch, parse response, emit all tokens at once
  const response = await fetch(url, { method: 'POST', body, headers });
  const data = await response.json();
  const content = data.choices[0]?.message?.content ?? '';
  options.onToken(content);
  options.onComplete();
  return;
}
```

This is a targeted exception for o1 only. All other reasoning models support streaming.

**Modified components:**
| Component | Change |
|-----------|--------|
| `OpenAIProvider.ts` | Use `developer` role for reasoning models, add `reasoning_effort`, add o1 non-streaming fallback, update model list (add o3, o4-mini), add `'o4'` to prefix detection |
| `OpenRouterProvider.ts` | Same role handling, add `reasoning_effort`, update model list |
| `streamSSE.ts` | Optionally parse `reasoning_details` from delta chunks, add `onReasoning` callback |
| `LLMProvider.ts` | Add `reasoningEffort?` and `onReasoning?` to `ProviderStreamOptions` |
| `store/settingsSlice.ts` | Add `reasoningEffort: 'low' \| 'medium' \| 'high'` setting (default: 'medium') |
| `store/types.ts` | Add `ReasoningEffort` type |
| `background.ts` | Pass `reasoningEffort` from store to provider, handle `LLM_REASONING` messages |
| `messages.ts` | Add `LLM_REASONING` message type |

**New components:**
| Component | Location | Purpose |
|-----------|----------|---------|
| `ReasoningPanel` | `src/overlay/ReasoningPanel.tsx` | Collapsible panel showing reasoning summary (when available) |
| `ReasoningEffortSelector` | `src/components/settings/ReasoningEffortSelector.tsx` | Settings UI for reasoning effort level |

**Key integration point -- message role at provider level (NOT PromptBuilder):**

The role change should happen at the provider level because PromptBuilder is provider-agnostic. The provider knows which model is being used and can make the role decision:

```typescript
// In OpenAIProvider.streamResponse():
const role = isReasoningModel(model) ? 'developer' : 'system';
const messages = [
  { role, content: systemPrompt },
  { role: 'user', content: userPrompt },
];
```

This keeps `BuildPromptResult` unchanged (`{ system, user, userFull }` -- just text, no role info).

**Shadow DOM impact:** ReasoningPanel renders inside the overlay Shadow DOM. Same styling patterns as existing panels.

**Confidence:** MEDIUM-HIGH (API parameters confirmed, but o1 non-streaming fallback and reasoning_details parsing need runtime validation)

---

### 4. Markdown Rendering for LLM Responses

**What it is:** Render LLM responses with proper formatting: code blocks with syntax highlighting, headers, lists, bold/italic, tables.

**Architecture decision: Use `react-markdown` with `react-syntax-highlighter` for code highlighting.**

Rationale for `react-markdown`:
- Creates virtual DOM (no `dangerouslySetInnerHTML`), XSS-safe
- Supports GFM (tables, strikethrough) via `remark-gfm` plugin
- ~15KB gzipped (react-markdown core). Well-maintained, widely used.
- `components` prop allows custom rendering of every HTML element with Tailwind classes

**Syntax highlighting decision: `react-syntax-highlighter` with inline styles (NOT sugar-high, NOT rehype-highlight).**

This is a critical decision for Shadow DOM compatibility:

| Library | Style method | Shadow DOM compatible? | Size |
|---------|-------------|----------------------|------|
| `react-syntax-highlighter` | Inline styles (default, `useInlineStyles={true}`) | YES -- inline styles bypass Shadow DOM CSS isolation | ~50KB (with PrismLight, tree-shakeable) |
| `sugar-high` | CSS custom properties (`--sh-` prefix) | REQUIRES injecting CSS vars into shadow root's `:host` | ~1KB |
| `rehype-highlight` | CSS class names from highlight.js themes | REQUIRES injecting theme CSS into shadow root | ~20KB |

**Recommendation: `react-syntax-highlighter` because its default inline style approach works in Shadow DOM without any CSS injection workarounds.** The size cost (~50KB) is acceptable for a Chrome extension.

The `PrismLight` build from `react-syntax-highlighter/dist/esm/prism-light` allows tree-shaking -- register only needed languages (javascript, typescript, python, java, sql, bash, json) to keep bundle small.

Sugar-high was initially considered but upon verification it uses CSS custom properties, NOT inline styles. These CSS variables need to be defined in the shadow root's `:host` scope. While doable (Tailwind injection via `cssInjectionMode: 'ui'` could include the vars in `app.css`), it adds fragile coupling. [HIGH confidence -- verified via sugar-high GitHub repo]

**Implementation:**

```
[LLM_STREAM message with token]
    |
    v
[Content script: accumulate in currentLLMResponse.fullAnswer]
    |
    v
[ResponsePanel]
    |
    Before: <div>{response.fullAnswer}</div>  (plain text)
    After:  <MarkdownRenderer content={response.fullAnswer} />
    |
    v
[MarkdownRenderer component]
    |
    react-markdown with:
    - remark-gfm for tables/strikethrough
    - Custom components map:
      - code blocks -> react-syntax-highlighter (PrismLight, inline styles)
      - headings -> Tailwind-styled h2/h3 with text-white/90
      - lists -> Tailwind-styled ul/li with proper spacing
      - tables -> Tailwind-styled table with border-white/20
      - inline code -> <code> with bg-white/10 px-1 rounded
      - paragraphs -> text-sm text-white/90 with mb-2 spacing
```

**New components:**
| Component | Location | Purpose |
|-----------|----------|---------|
| `MarkdownRenderer` | `src/overlay/MarkdownRenderer.tsx` | react-markdown wrapper with custom component map |
| `CodeBlock` | `src/overlay/CodeBlock.tsx` | Code block with react-syntax-highlighter + copy button |

**Modified components:**
| Component | Change |
|-----------|--------|
| `ResponsePanel.tsx` | Replace plain text `{response.fullAnswer}` and `{response.fastHint}` with `<MarkdownRenderer>` |

**Performance during streaming:**

react-markdown re-parses the full content on every render. During streaming, `fullAnswer` changes every ~50ms. Mitigation strategies:

1. **Debounced rendering (recommended):** Use a `useDeferredValue` or custom debounce (~200ms) during streaming. Show raw text between debounce intervals, full markdown on debounce tick and on completion. This gives perceived real-time updates without parsing overhead.

2. **Streaming-aware rendering:** During `status === 'streaming'`, render markdown only up to the last complete paragraph/block. On `status === 'complete'`, render the full markdown. This avoids re-parsing incomplete markdown that produces broken output.

3. **React 18 `useDeferredValue`:** Wrap the markdown content in `useDeferredValue(content)`. React will prioritize rendering the raw text update and defer the expensive markdown parse. This is the simplest approach.

**Recommended: Use `useDeferredValue` for the markdown content string.** It requires zero custom logic and leverages React 18's concurrent features (already in the project).

**Shadow DOM impact:** ADDRESSED. Custom components use Tailwind classes (already injected into Shadow DOM). `react-syntax-highlighter` uses inline styles. No external CSS sheets needed. No shadow DOM issues.

**Confidence:** HIGH (react-markdown is well-established, react-syntax-highlighter inline styles verified, Shadow DOM CSS injection via WXT confirmed from codebase analysis)

---

### 5. Enhanced Text Selection -> LLM (Floating Tooltip)

**What it is:** When user selects text in the overlay (transcript or response panel), show a floating tooltip with quick action buttons (e.g., "Explain", "Rephrase", "Deeper") -- no hotkey required.

**Architecture challenge: Selection detection in Shadow DOM.**

The overlay lives in a Shadow DOM created by WXT's `createShadowRootUi`. Key facts about selection APIs:

- `window.getSelection()` works for selections in the main document. For selections within Shadow DOM, Chrome provides the non-standard `shadowRoot.getSelection()`. [MEDIUM confidence -- behavior may vary]
- The newer `Selection.getComposedRanges()` API can return ranges that cross shadow boundaries. Available since August 2025 in latest browsers. [MEDIUM confidence -- recently available]
- The current `getHighlightedText()` in `useCaptureMode.ts` uses `window.getSelection()` which will detect text selected WITHIN the overlay because WXT uses `mode: 'open'` shadow DOM.
- `selectionchange` event fires on `document`, not on shadow roots. Must listen on `document` and then check if the selection is within the overlay's shadow root.

**Implementation approach:**

```
[User selects text in overlay panels]
    |
    document 'selectionchange' event listener
    |
    v
[Check if selection is within our shadow root]
    |
    shadowRoot.getSelection() (Chrome) or
    window.getSelection() + check if anchorNode is within overlay
    |
    If selection.toString().trim() has text:
    |
    v
[Get selection coordinates via Range.getBoundingClientRect()]
    |
    Coordinates are viewport-relative (works across shadow boundary)
    |
    v
[Show <SelectionTooltip> positioned near selection]
    |
    Tooltip actions: "Ask AI", "Explain", "Rephrase", "Copy"
    |
    On action click:
    |
    v
[sendLLMRequest(actionPrefix + selectedText, 'highlight')]
    |
    Uses existing LLM_REQUEST message flow
```

**New components:**
| Component | Location | Purpose |
|-----------|----------|---------|
| `SelectionTooltip` | `src/overlay/SelectionTooltip.tsx` | Floating tooltip with action buttons |
| `useTextSelection` | `src/overlay/hooks/useTextSelection.ts` | Hook to detect text selection within overlay and position tooltip |
| `quickPrompts` | `src/services/llm/quickPrompts.ts` | Predefined action prompts ("Explain this concept: ...", "Rephrase for clarity: ...") |

**Modified components:**
| Component | Change |
|-----------|--------|
| `Overlay.tsx` | Add `<SelectionTooltip>` component, wire `useTextSelection` hook |
| `content.tsx` | May need to expose `sendLLMRequest` more flexibly (currently takes `question` and `mode`) |

**Tooltip positioning strategy:**

Render the tooltip as a child of the overlay container (inside Shadow DOM), positioned with `position: fixed` using viewport coordinates from `getBoundingClientRect()`. Since the overlay itself uses `react-rnd` with absolute positioning, the tooltip should be a portal-like element at the shadow root level to avoid coordinate translation.

```typescript
// useTextSelection.ts
function useTextSelection(shadowRoot: ShadowRoot | null) {
  const [tooltipState, setTooltipState] = useState<{
    visible: boolean;
    text: string;
    x: number;
    y: number;
  }>({ visible: false, text: '', x: 0, y: 0 });

  useEffect(() => {
    const handler = () => {
      const selection = shadowRoot?.getSelection?.() ?? window.getSelection();
      const text = selection?.toString().trim() ?? '';
      if (text.length > 3) {
        const range = selection!.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        setTooltipState({
          visible: true,
          text,
          x: rect.left + rect.width / 2,
          y: rect.top - 8, // Position above selection
        });
      } else {
        setTooltipState(prev => prev.visible ? { ...prev, visible: false } : prev);
      }
    };

    document.addEventListener('selectionchange', handler);
    return () => document.removeEventListener('selectionchange', handler);
  }, [shadowRoot]);

  return tooltipState;
}
```

**Edge cases:**
- Selection spans outside overlay -> check `anchorNode` is descendant of overlay container
- Selection disappears on click elsewhere -> `mousedown` handler hides tooltip
- Tooltip obscures selected text -> position above by default, flip below if near viewport top
- Tooltip action click clears selection -> capture text before clearing
- Rapid selection changes -> debounce `selectionchange` handler (100ms)

**Shadow DOM impact:** Selection events work within Shadow DOM in Chrome. `getBoundingClientRect()` returns viewport-relative coords correctly. Tooltip renders within Shadow DOM (isolated styles). The `shadowRoot.getSelection()` is Chrome-specific but this is a Chrome extension. [HIGH confidence for Chrome-only target]

**Service Worker constraint:** None -- all UI-side logic.

**Confidence:** HIGH (standard DOM APIs, Chrome-only target simplifies selection API concerns)

---

### 6. Transcript Editing (Inline Corrections)

**What it is:** Allow user to edit transcript entries inline (fix STT errors), add comments, and soft-delete entries.

**Architecture decision: Local edit overlay in content script, NOT modifying TranscriptBuffer directly.**

Rationale:
- `TranscriptBuffer` in background.ts receives live STT entries. Modifying it during active transcription creates race conditions (new entries arriving while user edits).
- Edits are user-facing corrections, not changes to the raw STT data.
- An edit layer on top preserves original data and enables undo.
- Keeps the edit feature entirely in the content script context (no new messages needed for basic editing).

**Implementation approach:**

```
[TranscriptEntry from STT]   [TranscriptEdit from user]
        |                              |
        v                              v
[TranscriptBuffer]           [transcriptEdits Map<entryId, Edit>]
(background.ts)              (content script / useTranscriptEdits hook)
        |                              |
        +-------> merge at display <---+
                      |
                      v
              [TranscriptPanel renders merged view]
              [getFullTranscript() returns edited text for LLM]
```

**Edit types:**

```typescript
interface TranscriptEdit {
  entryId: string;
  type: 'correction' | 'comment' | 'delete';
  correctedText?: string;      // For corrections
  comment?: string;            // For comments
  deleted?: boolean;           // For soft delete
  editedAt: number;            // Timestamp
}

// Undo stack
type UndoEntry = {
  edit: TranscriptEdit;
  previousState: TranscriptEdit | null;  // null = entry was unedited
};
```

**State management:**

Edits stored in a React hook state (`useTranscriptEdits`) within the content script. Not in Zustand because:
- Edits are session-scoped (cleared when transcription session ends)
- Only needed in the overlay context (content script)
- No cross-context sync required
- Optional persistence to `chrome.storage.local` for crash recovery

For undo: maintain a stack of `UndoEntry` objects. `Ctrl+Z` pops the last entry. Simple and sufficient.

**New components:**
| Component | Location | Purpose |
|-----------|----------|---------|
| `EditableTranscriptEntry` | `src/overlay/EditableTranscriptEntry.tsx` | Inline edit mode for a single entry |
| `useTranscriptEdits` | `src/overlay/hooks/useTranscriptEdits.ts` | Hook managing edit state, undo stack, persistence |
| `TranscriptActions` | `src/overlay/TranscriptActions.tsx` | Per-entry action buttons (edit, comment, delete, undo) |

**Modified components:**
| Component | Change |
|-----------|--------|
| `TranscriptPanel.tsx` | Replace static `TranscriptEntryRow` with `EditableTranscriptEntry`, add edit controls visible on hover |
| `content.tsx` | Modify `getFullTranscript()` and `getRecentTranscript()` to merge edits before sending to LLM |

**Critical integration: Edited text in LLM context.**

When user corrects a transcript entry, the LLM must receive the corrected text, not the original STT output. The `getFullTranscript()` and `getRecentTranscript()` functions in content.tsx must be updated:

```typescript
// content.tsx -- module-level or passed from Overlay context
let transcriptEdits: Map<string, TranscriptEdit> = new Map();

// Updated in response to edits from overlay (via custom event or ref)
function getFullTranscript(): string {
  const merged = currentTranscript
    .filter(e => e.isFinal)
    .map(entry => {
      const edit = transcriptEdits.get(entry.id);
      if (edit?.deleted) return null;
      if (edit?.correctedText) return { ...entry, text: edit.correctedText };
      return entry;
    })
    .filter(Boolean) as TranscriptEntry[];
  return formatEntries(merged);
}
```

The challenge is that `transcriptEdits` lives in the React component tree (Overlay -> useTranscriptEdits) but `getFullTranscript()` is a module-level function in content.tsx. Bridge this via:
- Custom event: Overlay dispatches `transcript-edits-update` with the edits map
- Ref pattern: content.tsx creates a ref that the Overlay updates
- Module-level setter: export `setTranscriptEdits()` from content.tsx

**Recommended: Module-level setter exported from content.tsx.** Simplest, most direct.

**Inline editing UX:**
- Click pencil icon or double-click entry text to enter edit mode
- Controlled `<textarea>` (not `contenteditable` -- more predictable with React)
- Enter to save, Escape to cancel
- Visual indicator: edited entries show subtle "edited" badge and original text on hover
- Deleted entries show strikethrough with "restore" button

**Shadow DOM impact:** Editing UI renders within Shadow DOM. Standard React controlled components. No special considerations.

**Service Worker constraint:** Edits stay in content script state. No background communication needed for basic editing.

**Confidence:** HIGH (standard React patterns, no external dependencies)

---

## Component Boundaries Summary

### New Services (src/services/)

```
src/services/
  files/
    extraction.ts     -- PDF/text file parsing (pdf.js for PDF, raw for TXT)
    storage.ts         -- IndexedDB CRUD for file content
  cost/
    costTracker.ts     -- IndexedDB CRUD for cost records
    pricing.ts         -- Static model pricing table (USD per 1M tokens)
  db.ts                -- Shared IndexedDB database initialization (idb wrapper)
  llm/
    quickPrompts.ts    -- Predefined selection action prompts
    providers/
      (existing files modified)
```

### New Store Slices

```
src/store/
  filesSlice.ts        -- File metadata (name, type, size, extractedLength)
  (settingsSlice.ts    -- Add reasoningEffort: 'low' | 'medium' | 'high')
  (types.ts            -- Add FilesSlice, ReasoningEffort types)
  (index.ts            -- Add filesSlice, update partialize)
```

### New Overlay Components

```
src/overlay/
  MarkdownRenderer.tsx         -- react-markdown wrapper with Tailwind component map
  CodeBlock.tsx                 -- PrismLight code block with copy button
  ReasoningPanel.tsx            -- Collapsible reasoning summary display
  SelectionTooltip.tsx          -- Floating action tooltip on text selection
  EditableTranscriptEntry.tsx   -- Inline transcript editing
  TranscriptActions.tsx         -- Per-entry action buttons (edit/comment/delete)
  CostSummaryWidget.tsx         -- Optional session cost in overlay footer
  hooks/
    useTextSelection.ts         -- Selection detection + tooltip positioning
    useTranscriptEdits.ts       -- Edit state management + undo stack
```

### New Popup Components

```
src/components/
  settings/
    FileUploadPanel.tsx         -- File upload/management UI
    ReasoningEffortSelector.tsx  -- Reasoning effort level selector
  CostDashboard.tsx              -- Cost tracking charts/summary
```

---

## Data Flow Changes

### Current Data Flow (v1.1)

```
STT Audio -> Offscreen -> Background (TranscriptBuffer) -> Content Script (TRANSCRIPT_UPDATE)
Hotkey/Selection -> Content Script -> Background (LLM_REQUEST) -> Provider (fetch SSE) -> Background (LLM_STREAM) -> Content Script
Settings -> Popup -> Zustand store -> chrome.storage.local -> All contexts
```

### New Data Flows (v2.0)

```
FILE UPLOAD:
Popup -> FileReader API -> extraction service -> IndexedDB
Background (PromptBuilder) <- reads IndexedDB at startup + on change -> injects $resume/$jobDescription

COST TRACKING:
Provider (streamSSE final chunk) -> onUsage callback -> Background -> CostTracker -> IndexedDB
Popup (CostDashboard) <- reads IndexedDB for cost records
Optional: Background -> LLM_USAGE message -> Content Script -> CostSummaryWidget

REASONING MODELS:
Provider (streamSSE reasoning delta) -> onReasoning callback -> Background -> LLM_REASONING message -> Content Script -> ReasoningPanel
o1 model: Provider (non-streaming fetch) -> onToken(full content) -> onComplete
Settings: reasoningEffort -> Zustand -> Background -> provider request body

MARKDOWN RENDERING:
LLM_STREAM tokens -> content script accumulates fullAnswer string ->
ResponsePanel -> MarkdownRenderer (react-markdown + react-syntax-highlighter inline styles)
No new messages. No data flow change. Pure rendering change.

SELECTION TOOLTIP:
User selects text in overlay -> useTextSelection detects via selectionchange ->
SelectionTooltip shows -> User clicks action -> sendLLMRequest(prefix + text, 'highlight')
Uses existing LLM_REQUEST flow. No new messages.

TRANSCRIPT EDITING:
User double-clicks entry -> EditableTranscriptEntry -> useTranscriptEdits hook ->
transcriptEdits Map in content script -> getFullTranscript() merges edits
No new messages. Edits are content-script-local.
```

---

## IndexedDB Schema Design

Single IndexedDB database with multiple object stores, shared initialization:

```typescript
// src/services/db.ts
import { openDB, type IDBPDatabase } from 'idb';

interface AppDB {
  files: {
    key: string;
    value: {
      id: string;
      name: string;
      type: 'resume' | 'job-description' | 'notes';
      mimeType: string;
      extractedText: string;
      uploadedAt: number;
      sizeBytes: number;
    };
  };
  costRecords: {
    key: string;
    value: CostRecord;
    indexes: {
      'by-timestamp': number;
      'by-session': string;
      'by-model': string;
    };
  };
}

export function getDB(): Promise<IDBPDatabase<AppDB>> {
  return openDB<AppDB>('ai-interview-assistant', 1, {
    upgrade(db) {
      if (!db.objectStoreNames.contains('files')) {
        db.createObjectStore('files', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('costRecords')) {
        const store = db.createObjectStore('costRecords', { keyPath: 'id' });
        store.createIndex('by-timestamp', 'timestamp');
        store.createIndex('by-session', 'sessionId');
        store.createIndex('by-model', 'model');
      }
    },
  });
}
```

**Why shared database:** Single `openDB()` call, schema versioning in one place, consistent access patterns across features.

**Access contexts:**
- Background service worker: reads files (for prompts), writes cost records
- Popup: reads/writes files (upload UI), reads cost records (dashboard)
- Content script: does NOT access IndexedDB directly (routes through background or popup handles its own)

---

## Message System Extensions

Minimal new message types needed:

```typescript
// Reasoning tokens display (background -> content script)
export interface LLMReasoningMessage extends BaseMessage {
  type: 'LLM_REASONING';
  responseId: string;
  model: LLMModelType;
  reasoning: string;  // Reasoning token content or summary
}

// Optional: usage data for overlay widget (background -> content script)
export interface LLMUsageMessage extends BaseMessage {
  type: 'LLM_USAGE';
  responseId: string;
  model: LLMModelType;
  promptTokens: number;
  completionTokens: number;
  estimatedCost: number;
}
```

Most new features are either popup-only (files, cost dashboard) or content-script-only (selection tooltip, transcript editing), requiring no new messages.

**Update required in messages.ts:** Add to `MessageType` union, add message interfaces, add to `ExtensionMessage` union. Update exhaustive switch in background.ts and content.tsx listener.

---

## Suggested Build Order (Dependencies)

```
Phase 1: Markdown Rendering
  |  (foundational -- improves ALL subsequent LLM output display)
  |  (no external dependencies, pure rendering change)
  |
Phase 2: IndexedDB Foundation + File Personalization
  |  (establishes IndexedDB patterns used by cost tracking)
  |  (high user value -- personalized LLM responses)
  |
Phase 3: Reasoning Models Enhancement
  |  (benefits from markdown rendering for reasoning output)
  |  (modifies LLM provider layer, affects cost tracking)
  |
Phase 4: Cost Tracking
  |  (depends on: IndexedDB foundation from Phase 2, streamSSE changes)
  |  (benefits from: reasoning model support for reasoning_tokens)
  |
Phase 5: Enhanced Text Selection Tooltip
  |  (depends on: markdown rendering for formatted display of results)
  |  (uses existing LLM_REQUEST flow, low coupling)
  |
Phase 6: Transcript Editing
  |  (most isolated, no dependencies on other v2.0 work)
  |  (can be deferred without blocking)
```

**Rationale for this order:**

1. **Markdown first:** Every subsequent LLM feature produces markdown output. Having rendering in place means Phase 3 reasoning output, Phase 5 selection results, and even Phase 2 file-enhanced prompts all display well from day one.

2. **IndexedDB + Files second:** Establishes the `idb`-based storage pattern. File personalization has high user value (personalized answers). The IndexedDB schema from `db.ts` is reused by cost tracking.

3. **Reasoning models third:** Modifies the LLM provider layer (streamSSE, OpenAIProvider, OpenRouterProvider). Best to do this before cost tracking modifies the same files for usage capture. Avoids merge conflicts.

4. **Cost tracking fourth:** Depends on IndexedDB (Phase 2) and benefits from reasoning model changes (Phase 3) -- reasoning tokens are tracked separately. Modifies `streamSSE.ts` which Phase 3 also touches.

5. **Selection tooltip fifth:** Nice-to-have feature, simpler than others. Benefits from markdown rendering (results look good). Independent of provider layer.

6. **Transcript editing last:** Most isolated feature. No dependencies on other v2.0 work. Can be deferred without blocking other features.

**Parallelization opportunities:**
- Phase 1 (Markdown) and Phase 2 (Files) can run in parallel (no shared files)
- Phase 5 (Selection) and Phase 6 (Transcript Editing) can run in parallel (no shared files)
- Phase 3 (Reasoning) must precede Phase 4 (Cost) due to shared streamSSE.ts modifications

---

## Scalability Considerations

| Concern | At 1 session/day | At 10 sessions/day | At 100+ sessions |
|---------|-------------------|---------------------|-------------------|
| IndexedDB cost records | ~5KB | ~50KB | ~5MB (add TTL cleanup) |
| IndexedDB file content | ~100KB | Same (files reused) | Same |
| chrome.storage.local | ~10KB total | Same | Same |
| Transcript buffer | ~50KB peak | Same per session | Same (cleared per session) |
| Markdown re-renders | Deferred via React 18 | Same | Same |
| Transcript edits | ~2KB per session | Same (cleared per session) | Same |

**No scalability concerns for the target use case** (private interview assistant, 1-5 sessions per day). Add a "clear old cost records" button or automatic 90-day TTL for heavy users.

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Storing File Content in Zustand
**What:** Putting extracted resume/JD text (~50KB) in the Zustand store.
**Why bad:** `webext-zustand` syncs the entire store across contexts via `chrome.runtime.sendMessage`. Large text content in every sync message causes performance degradation and exceeds message size best practices.
**Instead:** Store file content in IndexedDB, only store metadata (name, type, size, extractedLength) in Zustand.

### Anti-Pattern 2: Parsing Markdown on Every Streaming Token
**What:** Running react-markdown parse on every streaming token (every ~50ms).
**Why bad:** Markdown parsing is O(n) on content length. With a 2000-token response, later tokens cause parsing of the entire accumulated response every 50ms.
**Instead:** Use React 18 `useDeferredValue()` to let React batch and defer expensive re-renders, or debounce to 200ms intervals during streaming.

### Anti-Pattern 3: Modifying TranscriptBuffer for User Edits
**What:** Pushing user edits back into the `TranscriptBuffer` class in background.ts.
**Why bad:** TranscriptBuffer receives live STT entries with debounced persistence. Mixing user edits creates ordering bugs, race conditions with incoming STT data, and persistence conflicts.
**Instead:** Maintain a separate edit overlay in content script state, merge at display time and when building LLM context.

### Anti-Pattern 4: OpenAI Files API for Cross-Provider File Context
**What:** Using OpenAI's `file_id` reference in chat completions for file context.
**Why bad:** Files API works with Assistants/Responses API, not standard Chat Completions. Also, OpenRouter doesn't support `file_id` references.
**Instead:** Extract text client-side and inject into prompt as a plain text variable (`$resume`, `$jobDescription`).

### Anti-Pattern 5: Storing Cost Records in chrome.storage.local
**What:** Using chrome.storage for cost tracking data.
**Why bad:** 10MB limit, no indexing, no efficient querying by date range or model. Reading all records to display a filtered view is wasteful.
**Instead:** Use IndexedDB with proper indexes (timestamp, sessionId, model) for efficient queries.

### Anti-Pattern 6: Using sugar-high Without Shadow DOM CSS Injection
**What:** Choosing sugar-high for syntax highlighting and expecting it to work in Shadow DOM out of the box.
**Why bad:** Sugar-high uses CSS custom properties (`--sh-keyword`, `--sh-string`, etc.) that must be defined in the shadow root's `:host` scope. Without explicit injection, all code appears unstyled.
**Instead:** Use `react-syntax-highlighter` with `useInlineStyles={true}` (default) -- inline styles bypass Shadow DOM CSS isolation entirely.

### Anti-Pattern 7: Sending Streaming Request for o1 Model
**What:** Using `stream: true` when calling the o1 model via OpenAI API.
**Why bad:** o1 does not support streaming in the Chat Completions API. The request will fail.
**Instead:** Add a non-streaming fallback path in `OpenAIProvider.streamResponse()` specifically for o1. Emit the full response as a single `onToken()` call followed by `onComplete()`.

---

## Sources

- [OpenAI Reasoning Models Guide](https://platform.openai.com/docs/guides/reasoning) -- HIGH confidence
- [Azure OpenAI Reasoning Models](https://learn.microsoft.com/en-us/azure/ai-foundry/openai/how-to/reasoning) -- HIGH confidence, detailed parameter comparison table
- [OpenAI Chat Completions API Reference](https://platform.openai.com/docs/api-reference/chat) -- HIGH confidence
- [OpenAI Streaming API Reference](https://platform.openai.com/docs/api-reference/chat-streaming) -- HIGH confidence
- [OpenRouter Usage Accounting](https://openrouter.ai/docs/guides/guides/usage-accounting) -- HIGH confidence, confirmed usage in final SSE chunk
- [OpenRouter Reasoning Tokens Guide](https://openrouter.ai/docs/guides/best-practices/reasoning-tokens) -- HIGH confidence, reasoning_details format
- [OpenRouter Streaming Reference](https://openrouter.ai/docs/api/reference/streaming) -- HIGH confidence
- [react-markdown GitHub Repository](https://github.com/remarkjs/react-markdown) -- HIGH confidence
- [react-syntax-highlighter GitHub](https://github.com/react-syntax-highlighter/react-syntax-highlighter) -- HIGH confidence, inline styles confirmed
- [sugar-high GitHub Repository](https://github.com/huozhi/sugar-high) -- HIGH confidence, CSS custom properties (NOT inline styles) confirmed
- [MDN Selection API](https://developer.mozilla.org/en-US/docs/Web/API/Window/getSelection) -- HIGH confidence
- [Selection.getComposedRanges() MDN](https://developer.mozilla.org/en-US/docs/Web/API/Selection/getComposedRanges) -- MEDIUM confidence (new API, limited adoption)
- [Chrome Extensions Storage API](https://developer.chrome.com/docs/extensions/reference/api/storage) -- HIGH confidence
- [Chrome IndexedDB Storage Improvements](https://developer.chrome.com/docs/chromium/indexeddb-storage-improvements) -- HIGH confidence
- [WXT Content Script UI (Shadow DOM)](https://wxt.dev/guide/key-concepts/content-script-ui.html) -- HIGH confidence
- [WXT Shadow DOM CSS Issues](https://github.com/wxt-dev/wxt/issues/678) -- MEDIUM confidence, community reports
- [OpenAI Files API Reference](https://platform.openai.com/docs/api-reference/files) -- HIGH confidence
- [OpenAI Community: Files with Chat Completions](https://community.openai.com/t/how-to-use-a-file-via-chat-completions/873600) -- MEDIUM confidence
