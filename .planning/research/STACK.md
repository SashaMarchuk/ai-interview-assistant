# Stack Research: v2.0 Enhanced Experience Additions

**Domain:** Chrome MV3 Extension -- File Personalization, Cost Tracking, Reasoning Models, Markdown, Enhanced UI
**Researched:** 2026-02-09
**Confidence:** HIGH (verified via official docs, npm, and multiple sources)

## Context

This research covers **only the new stack additions** needed for v2.0. The existing stack is validated and unchanged:

- **Core:** WXT 0.19.x, React 18, Tailwind v4, Zustand 4 + webext-zustand, Chrome MV3
- **Services:** ElevenLabs WebSocket STT, OpenAI + OpenRouter LLM providers, eventsource-parser
- **UI:** Shadow DOM overlay (via `createShadowRootUi`), react-rnd for drag/resize
- **Storage:** chrome.storage.local/session (Zustand persistence)
- **Security:** WebCrypto AES-GCM encryption, circuit breaker with chrome.alarms, consent system

v2.0 adds six capabilities:
1. **File personalization** -- Upload resume/notes, inject context into LLM prompts
2. **Cost tracking** -- Token usage tracking with visual charts in settings popup
3. **Reasoning models** -- Full o-series support with `reasoning_effort` control
4. **Markdown rendering** -- Rich formatting in LLM response overlay
5. **Enhanced text selection** -- Floating tooltip over selected transcript text for quick prompts
6. **Transcript editing** -- Inline corrections, comments, soft delete

---

## Recommended Stack Additions

### New Dependencies (3 packages)

| Library | Version | Size (min+gzip) | Purpose | Why This Library |
|---------|---------|-----------------|---------|------------------|
| `react-markdown` | ^10.1.0 | ~35KB | Markdown-to-React rendering in overlay | Renders to React virtual DOM (not innerHTML), XSS-safe by design, works inside Shadow DOM because output is React elements, supports streaming via React reconciliation, 10M+ weekly npm downloads |
| `remark-gfm` | ^4.0.0 | ~3KB | GFM tables, strikethrough, task lists | LLM responses regularly use tables and code fences; GFM is table-stakes for technical interview content |
| `recharts` | ^3.7.0 | ~120KB | Cost tracking charts (bar, line, pie) | Declarative React JSX API, SVG-based (Shadow DOM safe), most popular React chart library (4M+/week), v3 has improved state management and perf |

### Zero-Dependency Capabilities (Built-In APIs + Custom Code)

| Capability | Approach | Why No Library |
|------------|----------|----------------|
| File personalization | `FileReader` API + base64 encoding + direct `fetch()` to OpenAI | Simple REST flow; no SDK warranted for file encode + single API shape |
| Token counting (cost) | `stream_options: { include_usage: true }` in streaming requests | OpenAI and OpenRouter return exact token counts in final SSE chunk; tiktoken (5MB+) is overkill |
| Reasoning model support | Extend existing `OpenAIProvider` + `OpenRouterProvider` | Already have `isReasoningModel()` detection; need `reasoning_effort` param and role handling |
| Enhanced text selection | Custom React hooks + browser `Selection` API | Standard DOM API; `window.getSelection()` + `selectionchange` event is sufficient |
| Transcript editing | Zustand store actions + React inline editing | Pure state management; no rich text editor needed for simple corrections |
| Cost data persistence | IndexedDB via native API (or add `idb-keyval` at 573 bytes) | Cost records are simple key-value; `idb-keyval` is optional but adds convenience at negligible size |

---

## Detailed Technology Decisions

### 1. File Personalization

**Approach: Client-side base64 encoding, sent inline in Chat Completions messages.**

Resumes and job descriptions are typically < 1MB. Base64 inline avoids the two-step upload-then-reference flow and keeps file data local (no persistent server-side storage of user documents on OpenAI).

**API message format for file inline:**

```typescript
// Content part for file input
interface FileContentPart {
  type: 'file';
  file: {
    filename: string;
    file_data: string; // "data:application/pdf;base64,{encoded}"
  };
}

// Usage in chat completions message
const message = {
  role: 'user',
  content: [
    {
      type: 'file',
      file: {
        filename: 'resume.pdf',
        file_data: `data:application/pdf;base64,${base64String}`,
      },
    },
    {
      type: 'text',
      text: userPrompt,
    },
  ],
};
```

**Supported file types:** PDF, DOCX, TXT, MD, and images. PDF inputs use vision-capable models (gpt-4o, gpt-4.1, o1) that extract both text and page images.

**Important caveat -- Chat Completions file support stability:**

As of late 2025, there were reports of a regression where Chat Completions temporarily lost file input support. The Responses API is OpenAI's recommended path for file inputs going forward. However, the Chat Completions API still supports base64 file data in content arrays for models with vision capabilities.

**Fallback strategy:** If base64 file inline fails for a given model, extract text client-side from the file and send as a plain text `content` part. For PDFs, this means a basic text extraction (or prompt the user to paste text). This fallback ensures personalization works even if the file content part API changes.

**Alternative approach -- text extraction instead of file upload:**

For maximum reliability, consider extracting text from uploaded files client-side and injecting as plain text into prompts. This avoids all API-level file support concerns:
- PDF: Use a lightweight parser or have the user paste text
- TXT/MD: Read directly with `FileReader.readAsText()`
- DOCX: More complex; consider limiting to PDF/TXT/MD

**Recommendation:** Start with text extraction approach (most reliable), add base64 file inline as an enhancement for PDF-heavy users who want layout-aware context.

**Storage:** Uploaded file stored in `chrome.storage.local` as base64 string (encrypted via existing `EncryptedStorage` service). Persists across sessions. Included in every LLM request when enabled.

**OpenRouter note:** OpenRouter's OpenAI-compatible API does not universally support file content parts. File personalization should be OpenAI-provider-only initially, with text-extraction fallback for OpenRouter models.

**Limitations:**
- 100 pages max per PDF, 32MB total across all file inputs per request
- Only vision-capable models support PDF files: gpt-4o, gpt-4o-mini, gpt-4.1, gpt-4.1-mini, o1
- PDF inputs consume more tokens than plain text (each page rendered as image)

**Confidence:** MEDIUM -- base64 file inline is documented but has had stability issues. Text extraction fallback is HIGH confidence.

---

### 2. Cost Tracking with Charts

**Token counting strategy:**

| Source | Method | Accuracy |
|--------|--------|----------|
| **Streaming with `stream_options`** | Set `stream_options: { include_usage: true }` in request body; final SSE chunk includes usage | Exact |
| **Response `usage` object** | Non-streaming responses return `{ prompt_tokens, completion_tokens, total_tokens }` | Exact |
| **Fallback estimate** | `Math.ceil(text.length / 4)` for English text | ~75% accurate |

**Recommendation:** Use `stream_options: { include_usage: true }` because the extension already streams all responses. Both OpenAI and OpenRouter support this parameter. The final SSE chunk returns exact token counts with no additional API call.

**Cost record data model:**

```typescript
interface TokenUsageRecord {
  id: string;                    // crypto.randomUUID()
  sessionId: string;             // Links to interview session
  timestamp: number;             // Date.now()
  provider: 'openai' | 'openrouter';
  model: string;                 // e.g., 'gpt-4o', 'o4-mini'
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCostUSD: number;      // Calculated from pricing table
}
```

**Storage approach:**

Use IndexedDB for cost records because:
- Records accumulate over time (hundreds/thousands of entries)
- Need aggregation queries (sum by day, group by model)
- `chrome.storage.local` has a 10MB quota and no query support
- IndexedDB has no practical size limit and supports indexes

**Implementation options:**
1. **Native IndexedDB** -- verbose but zero dependencies
2. **`idb-keyval`** (573 bytes gzip) -- simple get/set, no queries
3. **`idb`** (~1KB gzip) -- promise-based wrapper, supports transactions and indexes

**Recommendation: Native IndexedDB with a thin wrapper.** Cost tracking needs indexed queries (by date, by model) which `idb-keyval` cannot do. Native IndexedDB with a ~50-line wrapper class avoids any dependency while providing the queries needed. Alternatively, `idb` at ~1KB is acceptable if the wrapper feels too verbose.

**Why Recharts for charts:**

| Factor | Recharts 3.7 | Chart.js (react-chartjs-2) | visx (Airbnb) |
|--------|-------------|---------------------------|---------------|
| API style | Declarative JSX | Imperative canvas config | Low-level D3 primitives |
| Rendering | SVG (Shadow DOM safe) | Canvas (positioning tricky in Shadow DOM) | SVG (compatible) |
| Learning curve | Low | Medium | High |
| Bundle | ~120KB gzip | ~60KB gzip | ~30KB (multiple sub-packages) |
| React integration | Native components | Wrapper around imperative lib | Native but verbose |

**Decision: Recharts.** The ~120KB cost is justified because:
1. Charts load ONLY in the popup settings page, never in the content script overlay
2. The overlay bundle is completely unaffected
3. Declarative JSX API means dramatically less code than alternatives
4. SVG output works in any DOM context without positioning hacks

**Charts to build:**
1. **Daily cost bar chart** -- last 7/14/30 days
2. **Model usage pie chart** -- cost breakdown by model
3. **Session cost summary** -- per-session totals

**Confidence:** HIGH for token counting via `stream_options` (verified in OpenAI API docs). MEDIUM for exact Recharts bundle size (sources cite 120-200KB range; tree-shaking may reduce with Vite).

---

### 3. Reasoning Model Support (o-series Enhancement)

**Current codebase state:** Already has `isReasoningModel()` detection in `OpenAIProvider.ts` and uses `max_completion_tokens` instead of `max_tokens` for o-series. The existing `OPENAI_REASONING_MODEL_PREFIXES` covers `['o1', 'o3']`.

**What needs to change:**

| Gap | Implementation |
|-----|----------------|
| **Add o4-mini detection** | Extend prefixes: `['o1', 'o3', 'o4']` |
| **`reasoning_effort` parameter** | Add optional field to `ProviderStreamOptions`; include in request body for o-series |
| **`developer` message role** | o3/o4-mini accept `system` messages (treated as `developer` internally); use `developer` role explicitly for clarity |
| **Model list update** | Add `o4-mini` to `OPENAI_MODELS` list |
| **Temperature omission** | Already handled implicitly; reasoning models ignore `temperature`, but should omit it explicitly |
| **Streaming nuances** | o1, o1-mini, o3-mini: full streaming support. o3, o4-mini: streaming works but may require org verification (Tier 3+) |

**`reasoning_effort` values per model:**

| Model | Supported Values | Default | Notes |
|-------|-----------------|---------|-------|
| o1 | Not supported | N/A | Older model, no reasoning_effort param |
| o1-mini | Not supported | N/A | Older model |
| o3-mini | `low`, `medium`, `high` | `medium` | Three levels for speed/quality tradeoff |
| o3 | `low`, `medium`, `high` | `medium` | Same three levels |
| o4-mini | `low`, `medium`, `high` | `medium` | Same three levels |

**Important:** The values `none`, `minimal`, and `xhigh` are only for GPT-5 series models (not o-series). Do NOT use them with o3-mini/o4-mini.

**Streaming support matrix:**

| Model | Chat Completions Streaming | Notes |
|-------|---------------------------|-------|
| o1 | Yes | Full support |
| o1-mini | Yes | Full support |
| o3-mini | Yes | Full support, function calling supported |
| o3 | Limited access | Requires org verification; non-streaming fallback needed |
| o4-mini | Limited access | Requires org verification; non-streaming fallback needed |

**Non-streaming fallback for o3/o4-mini:** When streaming fails with `stream: true`, retry with `stream: false` and display the complete response at once. This handles orgs without streaming verification.

**API body changes:**

```typescript
// Updated request body for reasoning models
const body = {
  model,
  messages: [
    // o3/o4-mini treat 'system' as 'developer' internally
    // Use 'developer' explicitly for newer models
    { role: isNewerReasoning(model) ? 'developer' : 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ],
  max_completion_tokens: maxTokens,
  // Only include for models that support it (o3-mini, o3, o4-mini)
  ...(supportsReasoningEffort(model) && reasoningEffort
    ? { reasoning_effort: reasoningEffort }
    : {}),
  stream: true,
  stream_options: { include_usage: true },
};
```

**Unsupported parameters for reasoning models (must be omitted):**
- `temperature`
- `top_p`
- `presence_penalty`
- `frequency_penalty`
- `logprobs`
- `top_logprobs`
- `logit_bias`

**No new dependencies.** This is logic changes to existing `OpenAIProvider.ts` and `OpenRouterProvider.ts`.

**Confidence:** HIGH -- verified via OpenAI Reasoning Models Guide, OpenAI Models Reference, and multiple community sources.

---

### 4. Markdown Rendering in Overlay

**Why `react-markdown` over `marked` + `dangerouslySetInnerHTML`:**

| Factor | react-markdown | marked + DOMPurify |
|--------|---------------|-------------------|
| XSS safety | Safe by default (React virtual DOM) | Requires DOMPurify sanitization |
| Shadow DOM | Outputs React elements natively | HTML string works but loses React benefits |
| Streaming | Re-renders efficiently via React reconciliation | Must re-parse entire HTML on each token |
| Code blocks | Pluggable via custom components or rehype plugins | Must wire up separately via marked-highlight |
| Bundle size | ~35KB gzip + ~3KB remark-gfm = ~38KB | ~14KB marked + ~10KB DOMPurify = ~24KB |
| React integration | Native `<Markdown>{text}</Markdown>` | Wrapper with dangerouslySetInnerHTML |

**Decision: `react-markdown`.** The ~14KB size premium over marked+DOMPurify is justified by:
1. Zero XSS risk by architecture (no innerHTML ever)
2. Efficient streaming updates via React reconciliation (critical for token-by-token rendering)
3. Custom component overrides for Tailwind styling in Shadow DOM
4. No sanitization step needed

**Shadow DOM compatibility:** `react-markdown` outputs React components, not raw HTML. Since the overlay already renders React inside `createShadowRootUi`, markdown components render identically to other React elements. The existing Tailwind v4 Shadow DOM workarounds in `app.css` (`:host` variable fallbacks) apply to markdown output automatically.

**Styling approach -- custom component overrides with Tailwind:**

```tsx
<Markdown
  remarkPlugins={[remarkGfm]}
  components={{
    h1: ({ children }) => <h1 className="text-lg font-bold text-white/90 mb-2">{children}</h1>,
    h2: ({ children }) => <h2 className="text-base font-semibold text-white/85 mb-1.5">{children}</h2>,
    p: ({ children }) => <p className="text-sm text-white/85 mb-1.5">{children}</p>,
    code: ({ children, className }) => {
      const isBlock = className?.startsWith('language-');
      return isBlock
        ? <pre className="bg-black/30 rounded p-2 text-xs overflow-x-auto mb-2"><code>{children}</code></pre>
        : <code className="bg-white/10 rounded px-1 text-xs font-mono">{children}</code>;
    },
    ul: ({ children }) => <ul className="list-disc list-inside text-sm mb-1.5">{children}</ul>,
    ol: ({ children }) => <ol className="list-decimal list-inside text-sm mb-1.5">{children}</ol>,
    a: ({ href, children }) => (
      <a href={href} target="_blank" rel="noopener noreferrer" className="text-blue-300 underline">
        {children}
      </a>
    ),
    table: ({ children }) => (
      <table className="text-xs border-collapse w-full mb-2">{children}</table>
    ),
    th: ({ children }) => (
      <th className="border border-white/20 px-2 py-1 text-left font-medium">{children}</th>
    ),
    td: ({ children }) => (
      <td className="border border-white/20 px-2 py-1">{children}</td>
    ),
  }}
>
  {markdownContent}
</Markdown>
```

**Streaming performance:** `react-markdown` re-parses the full markdown string on each render. For typical LLM responses this is fast (~1-2ms). React's reconciliation only updates changed DOM nodes, so token-by-token rendering is efficient. The existing `memo()` on `ResponsePanel` prevents unnecessary parent re-renders.

**Code syntax highlighting -- defer to v2.1:**

For v2.0, use plain styled `<code>` blocks with monospace font and dark background. Full syntax highlighting via `rehype-highlight` (which uses `highlight.js` through `lowlight`) adds ~30KB+ to the overlay bundle. This is not critical for interview assistance responses which contain relatively short code snippets.

When added in v2.1, the recommended approach is:
- `rehype-highlight` (~2KB) + `lowlight/lib/common` (~20KB gzip for common languages)
- Import a single dark theme CSS into the Shadow DOM stylesheet
- Use `adoptedStyleSheets` or inline the theme CSS in `app.css`

**react-markdown v10 breaking change note:** v10 removed the `className` prop. Wrap in a styled div instead: `<div className="prose-dark"><Markdown>...</Markdown></div>`.

**Confidence:** HIGH for react-markdown capabilities and Shadow DOM compatibility. MEDIUM for exact bundle sizes (sources cite 30-45KB range).

---

### 5. Enhanced Text Selection UI

**No new dependencies.** Uses browser's built-in `Selection` API and custom React hooks.

**Implementation approach:**

```typescript
// Custom hook for detecting text selection within transcript panel
function useTextSelection(containerRef: React.RefObject<HTMLElement>) {
  const [selection, setSelection] = useState<{
    text: string;
    rect: DOMRect;
  } | null>(null);

  useEffect(() => {
    const handleMouseUp = () => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || !sel.toString().trim()) {
        setSelection(null);
        return;
      }

      // Verify selection is within our container
      const range = sel.getRangeAt(0);
      if (containerRef.current?.contains(range.commonAncestorContainer)) {
        setSelection({
          text: sel.toString().trim(),
          rect: range.getBoundingClientRect(),
        });
      }
    };

    const handleMouseDown = () => setSelection(null);

    document.addEventListener('mouseup', handleMouseUp);
    document.addEventListener('mousedown', handleMouseDown);
    return () => {
      document.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('mousedown', handleMouseDown);
    };
  }, [containerRef]);

  return selection;
}
```

**Shadow DOM consideration:** `window.getSelection()` can read selections within open Shadow DOM roots in Chrome (which is what WXT's `createShadowRootUi` creates). The floating tooltip renders inside the existing Shadow DOM overlay, maintaining style isolation.

**Floating tooltip pattern:**
- Absolute-positioned div relative to the overlay container
- Positioned at `selection.rect.top - tooltipHeight` (above selection)
- Contains quick action buttons: "Ask about this", "Explain", "Improve", custom prompt
- Disappears on mousedown outside or Escape key

**Confidence:** HIGH -- standard DOM APIs, verified `getSelection()` works in open Shadow DOM.

---

### 6. Transcript Editing

**No new dependencies.** Pure Zustand store actions + React inline editing.

**Implementation:**
- Add `editTranscriptEntry(id, newText)` and `softDeleteEntry(id)` actions
- `TranscriptEntryRow` component gets edit mode (toggled by double-click or edit button)
- Soft delete: mark entry as `deleted: true`, hide from display but retain in data
- Inline editing uses a plain `<input>` element, no rich text editor needed
- Comments: optional `comment` field on `TranscriptEntry`, shown as subtle annotation

**Store changes:**

```typescript
interface TranscriptEditActions {
  editTranscriptEntry: (id: string, newText: string) => void;
  softDeleteTranscriptEntry: (id: string) => void;
  restoreTranscriptEntry: (id: string) => void;
  addTranscriptComment: (id: string, comment: string) => void;
}
```

**Confidence:** HIGH -- pure application logic, no external dependencies.

---

## Installation

```bash
# New dependencies for v2.0 (only 3 packages)
npm install react-markdown@^10.1.0 remark-gfm@^4.0.0 recharts@^3.7.0
```

No new dev dependencies required. No new manifest permissions needed.

### Content Security Policy

No changes needed to `wxt.config.ts`:
- `react-markdown` renders React elements (no eval/innerHTML)
- `recharts` uses SVG (no additional CSP)
- File upload uses `fetch` to `https://api.openai.com` (already in `connect-src`)

---

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| Markdown rendering | `react-markdown` (35KB) | `marked` + `DOMPurify` (24KB) | XSS risk with innerHTML; poor streaming perf (re-parse entire string each token); loses React reconciliation |
| Markdown rendering | `react-markdown` (35KB) | Custom regex parser | Markdown is complex (nested lists, tables, code blocks); custom parser is a maintenance and security nightmare |
| Charts | `recharts` (120KB) | `Chart.js` via `react-chartjs-2` (60KB) | Canvas rendering has positioning issues in Shadow DOM; imperative config style fights React component patterns |
| Charts | `recharts` (120KB) | `visx` by Airbnb (30KB) | Too low-level; building bar/line/pie from D3 primitives requires 10x more code |
| Charts | `recharts` (120KB) | No charts (text-only cost display) | Charts provide instant visual understanding of spending; text tables are hard to scan |
| Charts | `recharts` (120KB) | `uPlot` (~20KB) | Minimal React integration, sparse documentation, requires manual DOM management |
| Token counting | `stream_options.include_usage` | `tiktoken` WASM (~5MB) | Enormous bundle for client-side tokenization; API already returns exact counts |
| Token counting | `stream_options.include_usage` | `gpt-tokenizer` (~1MB) | Still large; unnecessary when API provides exact data |
| File upload | Text extraction + base64 fallback | OpenAI Files API upload | Two-step process, stores documents on OpenAI servers, more complex error handling |
| File upload | Text extraction + base64 fallback | Client-side PDF parsing (`pdfjs-dist` 500KB+) | Massive dependency for something OpenAI handles natively |
| IndexedDB | Native wrapper / `idb-keyval` (573B) | `Dexie.js` (~26KB gzip) | Powerful but overkill for simple cost records; adds unnecessary weight |
| IndexedDB | Native wrapper / `idb-keyval` (573B) | `chrome.storage.local` | 10MB quota limit, no indexing, no aggregation queries |
| Syntax highlighting | Defer to v2.1 | `rehype-highlight` now (~30KB) | Not critical for interview responses; adds unnecessary overlay bundle size |
| Text selection | Native `Selection` API | Third-party tooltip library | Standard APIs are sufficient; libraries add unnecessary bloat |

## What NOT to Add

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `openai` npm SDK | 200KB+, pulls in Node.js polyfills, designed for server-side | Direct `fetch()` -- working pattern already in codebase |
| `tiktoken` / `gpt-tokenizer` | 1-5MB for client-side tokenization | `stream_options: { include_usage: true }` returns exact counts |
| `rehype-highlight` (for v2.0) | ~30KB added to overlay bundle | Plain styled `<code>` blocks; defer highlighting to v2.1 |
| `rehype-raw` | Allows raw HTML in markdown (XSS vector) | LLM output is markdown, not HTML; raw HTML support is a security risk |
| `pdf-lib` / `pdfjs-dist` | Client-side PDF parsing (500KB+) | OpenAI vision models handle PDF natively; fallback to text paste |
| `d3` directly | Low-level, imperative, large bundle | Recharts wraps D3 with React declarative API |
| `@nivo/core` | Full chart suite (~200KB+) | Overkill; Recharts covers bar/line/pie simply |
| `monaco-editor` / `codemirror` | Rich text editing (500KB+) | Plain `<input>` for transcript inline edit is sufficient |
| `Dexie.js` | 26KB for IndexedDB wrapper | Native IndexedDB with thin wrapper; cost records are simple |
| Separate charting page/popup | New entrypoint, more complexity | Embed charts in existing popup settings tab |

---

## Integration Points with Existing Codebase

### Files That Change

| Existing File | Change | Reason |
|---------------|--------|--------|
| `src/services/llm/providers/OpenAIProvider.ts` | Add `reasoning_effort`, `developer` role, `stream_options.include_usage`, file content parts, non-streaming fallback | Reasoning models + cost tracking + file personalization |
| `src/services/llm/providers/OpenRouterProvider.ts` | Add `reasoning_effort`, `stream_options.include_usage` | Reasoning models + cost tracking |
| `src/services/llm/providers/LLMProvider.ts` | Extend `ProviderStreamOptions` with `reasoningEffort?`, `fileData?`, `onUsage?` callback | Interface changes for new features |
| `src/services/llm/providers/streamSSE.ts` | Parse `usage` from final SSE chunk, call `onUsage` callback | Cost tracking data extraction |
| `src/services/llm/types.ts` | Add `reasoningEffort`, `onUsage`, file types to `StreamOptions` | Type definitions |
| `src/services/llm/PromptBuilder.ts` | Include file content in user prompt when personalization enabled | File context injection |
| `src/overlay/ResponsePanel.tsx` | Replace plain text with `<Markdown>` component | Markdown rendering |
| `src/overlay/TranscriptPanel.tsx` | Add edit/delete UI to `TranscriptEntryRow` | Transcript editing |
| `src/store/types.ts` | Add `reasoningEffort`, `personalFile`, cost tracking types | Store type extensions |
| `src/store/settingsSlice.ts` | Add reasoning effort setting, file upload state | New settings |
| `entrypoints/background.ts` | Pass usage data from streams, handle file in LLM requests | Orchestration updates |
| `entrypoints/popup/App.tsx` | Add Cost tab in settings | Cost tracking UI |

### New Files

| New File | Purpose | Est. Lines |
|----------|---------|------------|
| `src/services/cost/costTracker.ts` | IndexedDB operations, cost calculation, aggregation | ~150 |
| `src/services/cost/pricingTable.ts` | Hardcoded model pricing with user override | ~80 |
| `src/services/files/fileManager.ts` | File read, base64 encode, text extract, chrome.storage | ~120 |
| `src/components/markdown/MarkdownRenderer.tsx` | Configured react-markdown with Tailwind component overrides | ~80 |
| `src/components/cost/CostDashboard.tsx` | Recharts-based cost visualization | ~200 |
| `src/components/cost/CostSummary.tsx` | Text-based cost overview | ~60 |
| `src/components/settings/ReasoningSettings.tsx` | Reasoning effort dropdown | ~40 |
| `src/components/settings/FileUploadSettings.tsx` | File upload UI with preview and delete | ~120 |
| `src/overlay/SelectionTooltip.tsx` | Floating tooltip on text selection | ~100 |
| `src/overlay/hooks/useTextSelection.ts` | Text selection detection hook | ~50 |
| `src/store/costSlice.ts` | Zustand slice for cost tracking state | ~60 |
| `src/store/fileSlice.ts` | Zustand slice for personalization file | ~40 |

---

## Bundle Impact Assessment

| Addition | Where Loaded | Size (gzip) | Runtime Cost |
|----------|-------------|-------------|--------------|
| `react-markdown` + `remark-gfm` | Content script (overlay) | ~38KB | ~1-2ms parse per render |
| `recharts` | Popup only | ~120KB | Negligible (renders on settings tab switch) |
| Custom cost tracker | Background + popup | ~2KB | ~1ms per IndexedDB write |
| Custom file manager | Background + popup | ~1.5KB | One-time file read per LLM request |
| Custom markdown renderer | Content script (overlay) | ~1KB | Wraps react-markdown |
| Selection tooltip + hook | Content script (overlay) | ~1.5KB | On text selection only |
| Reasoning model changes | Background | ~0.5KB | Zero additional runtime cost |
| Transcript editing | Content script (overlay) | ~1KB | On user action only |
| **Total overlay addition** | | **~42KB** | |
| **Total popup addition** | | **~122KB** | |

**Key bundle isolation:** Recharts (~120KB) loads ONLY in the popup, never in the overlay content script. The overlay bundle grows by ~42KB (react-markdown + custom code). This is acceptable for an overlay that already includes React 18 (~40KB), react-rnd, Zustand, and Tailwind utilities.

---

## Version Compatibility Matrix

| Package | React 18 | TypeScript 5.4+ | WXT/Vite ESM | Chrome 116+ | Shadow DOM |
|---------|----------|-----------------|--------------|-------------|------------|
| `react-markdown@^10.1.0` | Yes | Yes (ESM) | Yes | Yes | Yes (React elements) |
| `remark-gfm@^4.0.0` | N/A (plugin) | Yes | Yes | N/A | N/A |
| `recharts@^3.7.0` | Yes (18+) | Yes | Yes (ESM) | Yes (SVG) | Yes (SVG) |

---

## OpenAI Model Pricing Reference (for Cost Tracking)

Prices current as of February 2026. Store as editable config so users can update when prices change.

| Model | Input ($/1M tokens) | Output ($/1M tokens) | Cached Input ($/1M) |
|-------|---------------------|---------------------|---------------------|
| gpt-4o | 2.50 | 10.00 | 1.25 |
| gpt-4o-mini | 0.15 | 0.60 | 0.075 |
| gpt-4.1 | 2.00 | 8.00 | 0.50 |
| gpt-4.1-mini | 0.40 | 1.60 | 0.10 |
| gpt-4.1-nano | 0.10 | 0.40 | 0.025 |
| o1 | 15.00 | 60.00 | 7.50 |
| o1-mini | 1.10 | 4.40 | 0.55 |
| o3 | 2.00 | 8.00 | 0.50 |
| o3-mini | 1.10 | 4.40 | 0.55 |
| o4-mini | 1.10 | 4.40 | 0.55 |

Source: [OpenAI Pricing](https://openai.com/api/pricing/)

---

## Sources

### HIGH Confidence (Official Docs, Verified)
- [OpenAI File Inputs Guide](https://platform.openai.com/docs/guides/pdf-files) -- base64 inline and file upload for Chat Completions
- [OpenAI Chat Completions API Reference](https://platform.openai.com/docs/api-reference/chat) -- stream_options, usage object, file content parts
- [OpenAI Reasoning Models Guide](https://platform.openai.com/docs/guides/reasoning) -- reasoning_effort, max_completion_tokens, developer role, unsupported params
- [OpenAI Models Reference](https://platform.openai.com/docs/models) -- o3, o3-mini, o4-mini capabilities
- [OpenAI o3 and o4-mini Announcement](https://openai.com/index/introducing-o3-and-o4-mini/) -- streaming support details, function calling
- [react-markdown GitHub](https://github.com/remarkjs/react-markdown) -- v10.1.0, API, breaking changes
- [react-markdown npm](https://www.npmjs.com/package/react-markdown) -- 10M+ weekly downloads
- [recharts GitHub](https://github.com/recharts/recharts) -- v3.7.0, React 18 support
- [recharts npm](https://www.npmjs.com/package/recharts) -- 4M+ weekly downloads
- [MDN window.getSelection()](https://developer.mozilla.org/en-US/docs/Web/API/Window/getSelection) -- Selection API reference
- [idb-keyval GitHub](https://github.com/jakearchibald/idb-keyval) -- 573 bytes, tree-shakeable

### MEDIUM Confidence (Multiple Sources Agree)
- [Recharts Bundlephobia](https://bundlephobia.com/package/recharts) -- ~120KB gzip (GitHub issues corroborate)
- [react-markdown Bundlephobia](https://bundlephobia.com/package/react-markdown) -- ~35KB gzip (GitHub issues cite 30-45KB)
- [Chat Completions file support regression thread](https://community.openai.com/t/regression-support-for-file-uploads-in-chat-completions/1357818) -- September 2025 instability
- [o3/o4-mini streaming limited access](https://community.openai.com/t/need-verification-for-o3-streaming-despite-being-tier-5/1230334) -- org verification required
- [rehype-highlight GitHub](https://github.com/rehypejs/rehype-highlight) -- uses lowlight/highlight.js, ~30KB gzip total

### LOW Confidence (Needs Phase-Specific Validation)
- Exact Recharts tree-shaking with Vite -- actual bundle may be smaller than 120KB
- OpenRouter file content part support per-model -- needs runtime testing
- o3/o4-mini streaming access tiers -- may change as models mature

---

*Stack research for: AI Interview Assistant v2.0 Enhanced Experience*
*Researched: 2026-02-09*
