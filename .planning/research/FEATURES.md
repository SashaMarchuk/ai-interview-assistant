# Feature Landscape: v2.0 Enhanced Experience

**Domain:** Chrome MV3 extension -- AI interview assistant UX enhancements, personalization, cost awareness
**Researched:** 2026-02-09
**Overall Confidence:** HIGH
**Scope:** v2.0 milestone features: file personalization (resume/JD upload), cost tracking dashboard, reasoning models (o-series), markdown rendering, enhanced text selection with floating tooltips, transcript editing

---

## Table Stakes

Features users expect from a mature AI interview assistant. Missing any of these makes the extension feel incomplete or broken.

### 1. Markdown Rendering in AI Responses

| Feature | Why Expected | Complexity | Dependencies |
|---------|--------------|------------|--------------|
| Render markdown in LLM response panels (bold, lists, headers, code) | Every LLM returns markdown; displaying raw `**bold**` and `` `code` `` as plain text looks broken | Medium | New dependency: react-markdown |
| Syntax highlighting in code blocks | Coding interviews produce code responses; unformatted code is unusable for quick reference | Medium | rehype-highlight or sugar-high |
| Streaming-compatible rendering | Responses stream token-by-token; renderer must handle incomplete markdown gracefully | Medium | Existing streaming architecture |
| Copy code block button | Users need to paste code snippets during live interviews quickly | Low | Clipboard API |
| Language label on code blocks | Users need to know what language the snippet is in at a glance | Low | Fenced code block metadata |

**Current state:** `ResponsePanel.tsx` (lines 83, 98) renders `response.fastHint` and `response.fullAnswer` as raw text inside `<div>` elements with no markdown processing. This is the single most visible gap -- every LLM response contains markdown that renders as gibberish.

**Why this is table stakes:** ChatGPT, Claude, and every AI chatbot renders markdown. Users will perceive raw markdown as a **bug**, not a missing feature.

**Implementation approach:** Use `react-markdown` with `rehype-highlight` for syntax highlighting. react-markdown builds a virtual DOM using unified/remark/rehype, allowing React to diff efficiently during streaming. The alternative `markdown-to-jsx` is lighter (~15kB vs ~60kB) but has fewer plugins and worse streaming edge case handling. For a Chrome extension where bundle size matters, `react-markdown` is still recommended because the plugin ecosystem handles incomplete markdown tokens gracefully (receiving `**bol` before `d**` does not break rendering).

**Syntax highlighter choice:**
- **sugar-high** (~1kB gzipped) -- Ultra-lightweight, JSX-compatible, uses CSS classes. Ideal for bundle-constrained environments. Supports fewer languages but covers the common ones.
- **rehype-highlight** (~17kB core with lowlight, bundles 37 common languages) -- More comprehensive, integrates natively with react-markdown's rehype pipeline.
- **react-syntax-highlighter** (~200kB+ full, 17kB async light build) -- Overkill for this use case. Avoid.

**Recommendation:** Use rehype-highlight. The 17kB cost is acceptable for a Chrome extension, and the native react-markdown integration means zero glue code. If bundle size becomes a concern, sugar-high can replace it later with minimal refactoring (just swap the code block component).

**Language loading optimization:** For interview context, load only: JavaScript, TypeScript, Python, Java, Go, C++, SQL, bash, JSON, HTML/CSS. This keeps the highlight bundle well under 30kB.

**Shadow DOM consideration:** react-markdown renders standard React elements. CSS for syntax highlighting themes (highlight.js themes) must be injected into the Shadow DOM, not the host page. This requires importing the CSS theme directly into the overlay's stylesheet or using inline styles. rehype-highlight with highlight.js uses class-based styling; the CSS file (~3kB) needs to be included in the Shadow DOM's adopted stylesheets.

**Streaming edge cases:**
- Incomplete code fences (receiving ` ``` ` without closing) -- react-markdown handles this by rendering as inline code until the fence closes.
- Partial bold/italic (`**bol` before `d**`) -- React's diff mechanism means partial tokens cause minimal flicker. Debouncing re-render to every 50-100ms (rather than every token) eliminates visual jitter entirely.
- Incomplete lists -- rendered as partial list items, gracefully extending as tokens arrive.

**User workflows:**
1. User triggers LLM request (hotkey or text selection)
2. Fast hint streams with basic markdown (usually just text, maybe bullet points)
3. Full answer streams with rich markdown (code blocks, headers, lists)
4. User sees formatted code, clicks copy button to paste into interview IDE
5. Code block shows language label and copy button in the top-right corner

**Edge cases:**
- Very long code blocks in a small overlay -- need horizontal scroll or word wrap toggle
- Nested markdown in streaming (e.g., code block inside a list) -- handled by react-markdown's AST parser
- Performance with very long responses (5000+ tokens) -- memoize the markdown component, only re-render on content change

**Confidence:** HIGH -- react-markdown has 13k+ GitHub stars, active maintenance, excellent streaming behavior documented. rehype-highlight bundles 37 languages by default and integrates cleanly.

---

### 2. Enhanced Text Selection with Floating Tooltip

| Feature | Why Expected | Complexity | Dependencies |
|---------|--------------|------------|--------------|
| Select transcript text and send to LLM with one click | Basic highlight-to-send already exists but needs a visible, discoverable UI | Medium | Existing capture mechanism |
| Floating action tooltip appears above/below selection | Users expect contextual actions near their selection (Notion, Medium, Google Docs pattern) | Medium | `window.getSelection()` + `Range.getBoundingClientRect()` |
| Action buttons: "Ask AI", "Copy", quick prompts | Multiple contextual actions on selected text | Low | Tooltip React component |
| Quick prompt buttons (e.g., "Explain this", "How to answer", "Counter-argument") | Power users want different actions without navigating menus | Low-Med | Pre-defined prompt actions |
| Tooltip auto-dismisses on outside click or new selection | Standard UX pattern -- tooltips should not persist | Low | `mousedown` event listeners |
| Works inside Shadow DOM overlay context | Overlay runs in content script Shadow DOM; selection API needs careful handling | Medium | Shadow DOM selection API |

**Current state:** The extension has a basic highlight-to-send feature via the `useCaptureMode` hook. This feature enhances it into a polished floating tooltip that appears contextually on text selection, similar to how Notion shows a formatting toolbar on text selection.

**UX pattern (from Notion/Google Docs/Medium research):**
1. User drag-selects text in the transcript panel
2. A floating toolbar appears ~8px above the selection with action buttons
3. User clicks an action (e.g., "Ask AI") -- the selected text is sent as the question
4. The tooltip dismisses immediately after action or on outside click
5. If user clicks "Copy", selected text copies to clipboard, tooltip dismisses

**Implementation approach:**
1. Attach a `mouseup` listener to the transcript panel
2. On mouseup, check `window.getSelection()` for non-empty selection
3. Get position via `selection.getRangeAt(0).getBoundingClientRect()`
4. Render a React portal within the Shadow DOM at calculated position
5. Position tooltip above selection (preferred) or below if near top edge
6. Dismiss on `mousedown` outside tooltip or on `selectionchange` event

**Shadow DOM selection specifics:** `window.getSelection()` works within Chrome's Shadow DOM (both open and closed). However, the `getBoundingClientRect()` coordinates are viewport-relative. The tooltip position must account for:
- The overlay container's scroll position (transcript panel scrolls)
- Any CSS transforms from react-rnd (drag position)
- The Shadow DOM host element's position

**Quick prompt architecture:** Pre-define 3-4 quick prompt actions that modify how the selected text is sent to the LLM:
- "Ask AI" -- sends selected text as-is (default, same as current highlight-to-send)
- "Explain" -- prepends "Explain this in the context of my interview: "
- "How to answer" -- prepends "How should I answer this question: "
- "Key points" -- prepends "What are the key points to mention for: "
These map directly to the existing `sendLLMRequest(question, mode)` function with a modified question prefix.

**Interaction conflict with transcript editing (Feature #7):**
Both features operate on the same `TranscriptPanel`. Resolution:
- **Single click** on entry text = no action (just cursor placement)
- **Double click** on a word = enter edit mode for that entry (Feature #7)
- **Click-and-drag** to select text = show floating tooltip (Feature #2)
- This matches standard text editor behavior (double-click = select word, drag = select range)

**Edge cases:**
- Selection spans multiple transcript entries -- tooltip shows above the first selected entry, selected text includes all entries
- Selection includes speaker labels and timestamps -- strip non-text content before sending to LLM
- Selection is very short (< 3 chars) -- do not show tooltip (likely accidental)
- User selects text in the response panel, not just transcript -- tooltip should work there too for "Copy" and "Explain further" actions
- Rapid selection changes -- debounce tooltip show by 200ms to prevent flicker

**Confidence:** HIGH -- `window.getSelection()` and `getBoundingClientRect()` are well-established Web APIs with excellent Chrome support. Floating toolbar pattern is standard in modern editors.

---

### 3. Cost Tracking per Request

| Feature | Why Expected | Complexity | Dependencies |
|---------|--------------|------------|--------------|
| Capture token counts from API responses | Both OpenAI and OpenRouter return `usage.prompt_tokens` and `usage.completion_tokens` | Medium | Modify `streamSSE.ts` to capture final usage chunk |
| Calculate cost per request using model pricing | Users pay with their own API keys and need to know spending | Medium | Hardcoded pricing table |
| Display cost per response in overlay | Immediate feedback: "This answer cost $0.003" | Low | UI component in ResponsePanel |
| Session total cost accumulator | Running total visible during interview | Low | In-memory state |

**Current state:** `streamSSE.ts` (lines 100-138) processes SSE chunks via `eventsource-parser` but only extracts `choices[0].delta.content`. The `StreamChunk` interface (line 12-24) does not include a `usage` field. The final chunk containing token usage is silently discarded.

**Token availability in streaming:**

**OpenAI Chat Completions API:** Set `stream_options: { "include_usage": true }` in the request body. The final SSE chunk includes:
```json
{
  "usage": {
    "prompt_tokens": 150,
    "completion_tokens": 89,
    "total_tokens": 239,
    "completion_tokens_details": {
      "reasoning_tokens": 0,
      "audio_tokens": 0,
      "accepted_prediction_tokens": 0,
      "rejected_prediction_tokens": 0
    },
    "prompt_tokens_details": {
      "cached_tokens": 0,
      "audio_tokens": 0
    }
  }
}
```
The `choices` array in this final chunk is empty. For reasoning models, `completion_tokens_details.reasoning_tokens` reveals the hidden thinking tokens.

**OpenRouter:** Usage is always included in the final SSE chunk. No additional parameters needed. OpenRouter also provides a generation stats endpoint (`/api/v1/generation?id=`) that returns `native_tokens_prompt`, `native_tokens_completion`, and `total_cost`.

**Pricing data approach:** Hardcode a pricing table for all models in `OPENAI_MODELS` and `OPENROUTER_MODELS`. Current pricing (as of Feb 2026):

| Model | Input/1M | Output/1M | Category |
|-------|----------|-----------|----------|
| gpt-4o-mini | $0.15 | $0.60 | fast |
| gpt-4.1-mini | $0.40 | $1.60 | fast |
| gpt-4.1-nano | $0.10 | $0.40 | fast |
| gpt-4o | $2.50 | $10.00 | full |
| gpt-4.1 | $2.00 | $8.00 | full |
| o3-mini | $1.10 | $4.40 | reasoning |
| o4-mini | $1.10 | $4.40 | reasoning |
| o3 | $2.00 | $8.00 | reasoning |
| o1 | $15.00 | $60.00 | reasoning (legacy) |
| o1-mini | $1.10 | $4.40 | reasoning (legacy) |

**Reasoning model cost specifics:** Reasoning tokens are billed as output tokens. The `completion_tokens_details.reasoning_tokens` field separates them. For cost calculation: `total_cost = (prompt_tokens * input_price) + (completion_tokens * output_price)` where `completion_tokens` already includes reasoning tokens. No separate pricing rate for reasoning tokens.

**Do NOT attempt dynamic pricing fetches.** Pricing changes 2-3x per year at most. Hardcoding avoids network requests, latency, and failure modes during live interviews. Show "Prices as of Feb 2026" in the settings panel.

**Implementation changes to streamSSE.ts:**
1. Add `usage` field to `StreamChunk` interface
2. In the parser's `onEvent`, detect the final chunk (empty `choices` array + `usage` present)
3. Add `onUsage: (usage: TokenUsage) => void` callback to `ProviderStreamOptions`
4. Pass usage data back to the background script, which forwards to content script
5. Content script stores in session state and updates overlay

**User workflow:**
1. User sends LLM request during interview
2. Response streams in with markdown rendering
3. On stream completion, a subtle cost label appears: "$0.003" or "3 tokens" in the response footer
4. Session total updates in overlay footer: "Session: $0.12"

**Edge cases:**
- Dual-stream requests (fast + full) -- each stream has its own cost, display both and sum
- Aborted requests -- partial usage may or may not be returned by provider; handle gracefully with "cost unknown" fallback
- OpenRouter pricing differences -- OpenRouter may charge different rates than direct OpenAI; use OpenRouter's `total_cost` field when available
- Model not in pricing table -- display "cost unavailable" rather than $0.00

**Confidence:** HIGH -- OpenAI and OpenRouter both document usage fields in streaming responses. The streamSSE.ts modification is straightforward.

---

## Differentiators

Features that set this tool apart from competitors like Final Round AI and Interviews.chat. Not universally expected, but high-value.

### 4. File Personalization (Resume + Job Description Upload)

| Feature | Value Proposition | Complexity | Dependencies |
|---------|-------------------|------------|--------------|
| Upload resume (PDF/DOCX/TXT) in settings or popup | LLM responses personalized to user's background and experience | Medium-High | PDF text extraction library |
| Upload/paste job description (PDF/TXT/paste) | LLM answers tailored to specific role requirements | Medium | Text extraction or paste field |
| Context injection into LLM system prompt | Resume/JD automatically prepended to all LLM prompts | Low | Modify `PromptBuilder.ts` |
| Persistent storage across sessions | Upload once, context persists until replaced | Low | `chrome.storage.local` |
| File management UI (view preview, replace, delete) | Users need to see what's uploaded and swap for different interviews | Low-Med | Settings panel extension |
| Token count display for uploaded context | Users know how much context budget is consumed | Low | tiktoken or char-based estimate |

**How competitors handle this (researched):**

**Final Round AI** (the leading competitor): Users upload their resume from the dashboard, then paste the job title + job description. The Interview Copilot then "listens to what the interviewer is asking, looks at your resume and job description, and instantly suggests well-structured talking points (usually in a STAR format)." This confirms that resume + JD is the standard personalization model.

**Interviews.chat:** Resume upload is a Pro feature. The AI "analyzes your resume and the job description to generate the most relevant questions." Same two-document model.

**UX flow (recommended):**
1. User opens Settings panel
2. "Personalization" section shows two upload areas: "Resume" and "Job Description"
3. Each area accepts: file upload (PDF, DOCX, TXT) or paste text directly
4. On file upload, text is extracted client-side and previewed (first 500 chars + token count estimate)
5. User clicks "Save" -- extracted text stored in `chrome.storage.local`
6. When building prompts, `PromptBuilder.ts` injects context automatically
7. User can clear/replace documents for different interview preps

**File formats and extraction:**
- **PDF:** Use `pdfjs-dist` (Mozilla's PDF.js) for text extraction. Known Chrome MV3 issue: PDF.js uses web workers, and MV3 service workers cannot spawn web workers. **Solution:** Run PDF extraction in the popup page or an offscreen document (both have full DOM access including web workers). The popup already handles file upload via `<input type="file">`. Extract text in popup, store plain text string.
- **DOCX:** Use `mammoth.js` (~30kB) for DOCX-to-text extraction. Well-tested, browser-compatible, no worker issues. The ChatGPT Documents Uploader Chrome extension uses mammoth.js successfully.
- **TXT:** Read directly via `FileReader.readAsText()`. No library needed.
- **Paste:** Simple `<textarea>` with paste support. No extraction needed.

**Alternative to PDF.js:** `unpdf` (unjs/unpdf) is a modern PDF text extractor designed for all JS runtimes including workers. Less battle-tested than PDF.js but avoids the web worker compatibility issue entirely. Consider as a fallback if PDF.js offscreen approach proves too complex.

**Simplest viable approach:** Support TXT/paste as the primary input. Many users already have their resume as text or can paste from Google Docs. PDF/DOCX support is a convenience enhancement, not a hard requirement. Ship paste-first, add file upload in a subsequent iteration if needed.

**Prompt injection design:**
```
System prompt = template.systemPrompt
  + "\n\n## Candidate Background\n" + resumeText
  + "\n\n## Target Role\n" + jobDescriptionText
```

The LLM handles unstructured text excellently -- do NOT attempt structured resume parsing (extracting name, skills, experience as separate fields). Inject raw extracted text and let the LLM parse contextually.

**Token budget impact:** A typical resume is 500-1500 tokens. A job description is 200-800 tokens. Together they add ~1000-2300 tokens to every request. Cost impact by model:

| Model | Extra cost per request (1500 tokens) |
|-------|--------------------------------------|
| gpt-4o-mini | $0.000225 |
| gpt-4.1 | $0.003 |
| o4-mini | $0.00165 |
| gpt-4o | $0.00375 |

Negligible for all models. The personalization value far exceeds the cost.

**Storage:** Store extracted text in `chrome.storage.local` (consistent with existing Zustand store pattern via `webext-zustand`). Do NOT store binary files -- only extracted text. A 2-page resume as text is ~3-5KB, well within `chrome.storage.local` limits (5MB per extension).

**Security considerations:**
- Resume text stored locally only (encrypted at rest via v1.1's AES-GCM encryption)
- Never sent to any server other than the LLM provider the user has configured
- Clear button to wipe all personalization data
- Show a privacy notice: "Your resume and job description are stored locally and only sent to your configured AI provider"

**Edge cases:**
- Very large documents (>10 pages) -- truncate with warning: "Document truncated to ~3000 tokens for optimal performance"
- Password-protected PDFs -- show error message, suggest paste instead
- Scanned PDF (image-based, no text layer) -- extraction returns empty/garbage, show warning
- Non-English resumes -- text extraction works for any UTF-8 language, LLM handles multilingual content
- User forgets to update resume between interviews -- show "last updated" date in settings

**Confidence:** MEDIUM -- PDF extraction in Chrome MV3 has known compatibility issues. Text/paste approach is HIGH confidence. The overall feature pattern (resume + JD context injection) is validated by competitor implementations.

---

### 5. Reasoning Model Support (o-series: o1/o3-mini/o3/o4-mini)

| Feature | Value Proposition | Complexity | Dependencies |
|---------|-------------------|------------|--------------|
| Properly handle reasoning model API differences | Users can select o3-mini or o4-mini for higher-quality complex answers | Medium | Modify provider adapters |
| `reasoning_effort` parameter (low/medium/high) exposed in settings | Users control cost vs. quality tradeoff | Low | Settings UI + provider modification |
| `developer` role instead of `system` role for messages | Required API compliance for o-series models | Low | Message construction in providers |
| No `temperature` parameter for reasoning models | Reasoning models reject `temperature`; must be omitted | Low | Conditional parameter inclusion |
| "Reasoning..." UI indicator during thinking phase | Users see longer initial delay before tokens flow; UI must not appear frozen | Low | Status indicator in ResponsePanel |
| Updated model list with o3, o4-mini | New models available since v1.0; stale model lists reduce utility | Low | Model registry update |
| Reasoning token cost awareness in cost tracking | Hidden reasoning tokens are billed; cost tracking must account for them | Low | Feature #3 integration |

**Current codebase state (already partially built):**
- `isReasoningModel()` function exists in both `OpenAIProvider.ts` (line 25-31) and `OpenRouterProvider.ts` (line 24-29)
- `max_completion_tokens` is correctly used instead of `max_tokens` for reasoning models
- Model list includes o1, o1-mini, o1-preview, o3-mini (but missing o3, o4-mini)
- `REASONING_MODEL_PREFIXES = ['o1', 'o3']` -- needs `'o4'` added for o4-mini

**What needs to change:**

1. **`developer` role messages:** Both providers send `{ role: 'system', content: systemPrompt }`. Since o1-2024-12-17, reasoning models expect `{ role: 'developer', content: systemPrompt }`. OpenAI currently silently converts system to developer for o-series models, but this is not guaranteed to continue. When using a system message with o4-mini, o3, o3-mini, and o1, it will be treated as a developer message -- but you should not use both a developer message and a system message in the same API request.

   **Fix:** In both providers' `streamResponse()`, check `isReasoningModel()` and use `developer` role instead of `system`.

2. **`reasoning_effort` parameter:** Not currently exposed. This controls how many thinking tokens the model generates:
   - `low` (~20% of max_tokens for reasoning) -- fast, cheap, less thorough
   - `medium` (~50%) -- balanced
   - `high` (~80%) -- thorough, slower, more expensive

   **Dual-stream optimization:** Configure `reasoning_effort: "low"` for the fast hint stream and `reasoning_effort: "high"` for the full answer stream. This means fast hints arrive quickly with minimal reasoning while full answers get deep analysis. This dual-effort pattern is uniquely suited to the existing dual-stream architecture and represents a genuine differentiator.

3. **Model list update:** Add o3, o4-mini to both `OPENAI_MODELS` and `OPENROUTER_MODELS`. Also update stale OpenRouter models (gemini-flash-1.5 to gemini-2.0-flash, claude-3-haiku to claude-3.5-haiku, claude-3.5-sonnet to claude-4-sonnet, etc.).

4. **REASONING_MODEL_PREFIXES:** Add `'o4'` to match o4-mini. Current `['o1', 'o3']` misses o4-mini.

5. **"Reasoning..." indicator:** Reasoning models have a "thinking" phase where no tokens flow. The existing "Thinking..." indicator (yellow pulse in `StatusIndicator`) works, but should differentiate between "waiting for first token" (standard) and "model is reasoning" (o-series). Show "Reasoning..." with a brain/gear icon for reasoning models specifically.

**Streaming behavior for reasoning models:**
- o3 and o4-mini support streaming via Chat Completions API
- Streaming includes reasoning summary support (available for o4-mini with "detailed" summarizer, o3 with "concise" summarizer)
- First tokens arrive after the thinking phase completes -- users may wait 3-15 seconds before seeing any output
- The `reasoning_effort` parameter directly controls this wait time

**Reasoning summaries:** The API can return a `reasoning` field with a summary of the model's internal thinking. However, for o-series models, reasoning tokens are generally not returned in responses (only summaries). Displaying these in the UI is an anti-feature for v2.0 (see Anti-Features section) -- a "Reasoning..." status indicator is sufficient.

**Edge case: o-series as fast model:** If a user selects o3-mini or o4-mini as the "fast" model, the thinking phase defeats the purpose of quick hints. The UI should warn: "Reasoning models have slower initial response times. Consider using a non-reasoning model for Quick Hints."

**Confidence:** HIGH for API differences (official OpenAI documentation + community confirmation). MEDIUM for the dual-effort optimization (novel approach for this architecture, needs testing).

---

### 6. Cost Tracking Dashboard

| Feature | Value Proposition | Complexity | Dependencies |
|---------|-------------------|------------|--------------|
| Session cost summary in overlay footer | Users see running cost during interview without leaving focus | Low | Feature #3 (per-request tracking) |
| Historical cost view in settings/popup | "This week: $2.34 across 5 sessions" | Medium | Persistent storage (IndexedDB) |
| Per-model cost breakdown | See which models cost the most; inform model selection | Low-Med | Cost data aggregation |
| Cost alerts/warnings | Configurable threshold: "You've spent $5 this session" | Low | Settings + notification |
| Export cost data (CSV/JSON) | Tax deductions, expense reports for interview prep costs | Low | Data serialization |
| Simple bar/line charts for trends | Visual cost trends over time | Low-Med | Lightweight chart library or CSS-only |

**Why this is a differentiator (not table stakes):** Most AI tools do NOT show per-request costs. Users typically discover spending via the OpenAI/OpenRouter billing dashboard after the fact. Real-time cost display during interviews is a power-user feature that builds trust and enables informed model choices. Competitor tools like Final Round AI and Interviews.chat charge subscription fees and do not expose per-request costs at all.

**How AI cost tracking tools present data (researched):**
- **Cursor Token Tracker** (Chrome extension): Shows total cost with daily average, budget projection, cost trends, and usage breakdown by model. All processing local, no data transmitted externally.
- **Helicone/Braintrust**: Real-time dashboards with per-session, per-model, per-feature cost attribution. Overkill for a Chrome extension but instructive for data model.
- **Firebase AI Logic**: Request volume, latency, errors, per-modality token usage. Good pattern for the metrics to track.

**Dashboard layout (two locations):**

**In-overlay (minimal):** During active interviews, show only:
- Session total cost in the overlay footer (replace or augment the "Ready" status): "Session: $0.12"
- Per-response cost label in ResponsePanel footer: "Fast: $0.001 | Full: $0.008"
- Keep it non-intrusive -- the overlay is small and focus should be on interview content

**In-popup/settings (detailed):**
- Session history list: date, duration, total cost, model breakdown
- Aggregate stats: weekly total, monthly total, average session cost
- Per-model breakdown: pie or bar chart showing cost distribution
- Export button for CSV/JSON

**Data model (stored in IndexedDB from v1.1):**
```
cost_records store:
  id: string (UUID)
  sessionId: string (indexed)
  timestamp: number
  requestType: 'fast' | 'full'
  model: string
  promptTokens: number
  completionTokens: number
  reasoningTokens: number
  totalCost: number  // calculated from pricing table
```

**Charts approach:** Do NOT add a heavyweight charting library (Chart.js is 200kB+). Options:
1. **CSS-only bar charts** -- simple percentage-width divs with labels. Sufficient for cost breakdown.
2. **Lightweight library** -- `uPlot` (~30kB) or `sparkline` libraries for trend lines.
3. **Recommendation:** Start with CSS-only bars for v2.0. Add a chart library in v2.1 if users want trend visualization.

**User workflow:**
1. During interview: glance at session cost in overlay footer
2. After interview: open popup, see session summary
3. Weekly: review cost trends, decide if model selection needs adjustment
4. Monthly: export data for expense reports

**Edge cases:**
- Cost data missing (request aborted, provider error) -- show "~" instead of dollar amount
- User switches models mid-session -- aggregate correctly by model
- Storage limit (IndexedDB) -- unlikely to be an issue; 1000 requests x 100 bytes = 100KB
- Multiple concurrent sessions (unlikely for interviews) -- separate by sessionId

**Confidence:** HIGH -- straightforward data aggregation and display built on top of Feature #3.

---

### 7. Transcript Inline Editing

| Feature | Value Proposition | Complexity | Dependencies |
|---------|-------------------|------------|--------------|
| Double-click to edit individual transcript entries | Fix transcription errors before they pollute LLM context | Medium | TranscriptPanel refactor |
| Edit mode with save (Enter/blur) and cancel (Escape) | Standard inline editing UX | Low-Med | Controlled input state |
| Visual indicator for edited entries | Users know which entries were manually corrected | Low | CSS styling (border/icon) |
| Edited text used in LLM context | When transcript is sent to LLM, edited versions are used instead of originals | Low | PromptBuilder reads editedText |
| Soft delete (strikethrough + exclude from context) | Remove irrelevant entries without losing transcript history | Low | `isDeleted` flag on entries |

**Current state:** `TranscriptPanel.tsx` renders transcript entries as read-only `<div>` elements via `TranscriptEntryRow` (lines 60-78). Each entry has `id`, `speaker`, `text`, `timestamp`, `isFinal`. No editing capability.

**Why this matters for interview assistants:** Speech-to-text is imperfect, especially for:
- Technical terms: "Kubernetes" -> "Kubernites", "PostgreSQL" -> "Post Gres Queue El"
- Company names: "Anthropic" -> "Anthropik", proper nouns are frequently wrong
- Acronyms: "API" -> "a pie", "CI/CD" -> "see eye see dee"
If the transcript says "Kubernites" and gets sent as LLM context, the LLM may give answers about the wrong topic or waste tokens clarifying the term.

**How Descript handles this (researched):**
Descript (the gold standard for transcript editing) uses click-to-edit with a "Correct" button. Users can also hold `E` and click a word to correct it. After correction, Descript re-analyzes media alignment. This is far more complex than needed -- our extension has no media alignment requirement.

**Implementation approach (simple controlled input):**

Do NOT use `contenteditable` (too many edge cases with React reconciliation and Shadow DOM). Do NOT use a rich text editor like Tiptap or ProseMirror (50-200kB bundle, massive overkill for fixing typos in short text strings).

Instead:
1. On **double-click** on entry text, replace the `<span>` with a controlled `<input>` or `<textarea>`
2. Auto-focus and auto-select all text for quick replacement
3. On **Enter** or **blur** -- save edit, replace back with `<span>`
4. On **Escape** -- cancel edit, restore original text
5. Store edited text as `editedText?: string` on the `TranscriptEntry`
6. In `PromptBuilder.ts` and context functions (`getRecentTranscript`, `getFullTranscript`), use `entry.editedText ?? entry.text`
7. Show a small pencil icon or subtle border color change on edited entries

**Real-time transcription conflict:** When ElevenLabs sends an update for an entry (`isFinal` changing from false to true, or text being refined), edited entries must NOT be overwritten. Track `isEdited: boolean` on each entry and skip STT updates for edited entries. This prevents the frustrating experience of correcting "Kubernites" to "Kubernetes" only to have it overwritten back.

**Soft delete pattern:**
- Right-click or long-press on entry shows "Remove from context" option
- Entry gets `isDeleted: true` flag
- Visual: strikethrough text, reduced opacity
- Entry excluded from `getFullTranscript()` and `getRecentTranscript()`
- User can "restore" with another right-click

**Undo/redo:** For v2.0, keep it simple: no undo stack. The original text is always preserved in `entry.text`, and `entry.editedText` can be cleared to "undo" any edit. A full undo/redo stack (Ctrl+Z/Y) is unnecessary complexity for a feature that fixes 1-2 words per entry.

**Edge cases:**
- Editing an entry that is still being transcribed (`isFinal: false`) -- disable editing for interim entries, show "Transcribing..." state
- Very long entries (multi-sentence) -- use `<textarea>` with auto-height instead of `<input>`
- Editing speaker label vs. text -- only allow text editing, not speaker label editing (speaker assignment comes from STT diarization and is usually correct)
- Empty edit (user deletes all text) -- treat as soft delete

**Confidence:** HIGH -- simple controlled input pattern, well-understood in React. No external dependencies needed.

---

## Anti-Features

Features to explicitly NOT build in v2.0. These are tempting but add excessive complexity, hurt interview UX, or belong in a later milestone.

### 1. Full Document Viewer / PDF Renderer

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Render uploaded PDF visually in the extension | PDF.js renderer is 500kB+; users do not need to view their resume in the extension | Show extracted text preview (first 500 chars). Store text only, not binary. User views their PDF in any PDF reader |

### 2. Real-Time Cost Estimation Before Request

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Show "This request will cost ~$X.XX" before sending | Requires token counting (tiktoken, ~3MB WASM) before the request, adds latency during live interviews, estimate is wrong because response length is unknown | Show cost AFTER response completes. Accumulate session total. Users care about total spend, not per-request predictions |

### 3. Dynamic Model Pricing Fetched from API

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Fetch current pricing from OpenAI/OpenRouter APIs on startup | Adds network dependency, latency, failure mode. Pricing changes ~2-3x per year | Hardcode pricing table. Update when models are added/changed. Show "Prices as of [date]" in settings |

### 4. Full Rich Text Editor for Transcript

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Tiptap/ProseMirror/Slate editor replacing transcript panel | 50-200kB bundle, complex state management with real-time SST updates, massive overkill for fixing typos | Simple double-click inline input. Users fix 1-2 words, not rewrite paragraphs |

### 5. Structured Resume Parsing

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Parse resume into structured fields (name, skills, experience objects) | Complex NLP/parsing, brittle across resume formats, the LLM handles unstructured text better than any parser | Extract raw text from PDF, inject as-is into system prompt. The LLM parses and uses relevant parts contextually |

### 6. Multi-File Personalization (Portfolio, GitHub, etc.)

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Upload portfolio, GitHub readme, cover letter, certifications | Bloats prompt context, increases cost per request, diminishing returns after resume + JD | Support exactly two document types: resume + job description. These cover 95% of personalization value. Additional context goes in custom prompt templates |

### 7. Reasoning Model "Thinking" Chain Display

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Show the model's internal reasoning chain/summary in the UI | Reasoning summaries are often encrypted/redacted for o-series, adds UI complexity, users need the answer fast during interviews not the reasoning process | Show "Reasoning..." status indicator with optional progress. If reasoning summaries become fully available, consider as future enhancement in v2.1 |

### 8. Collaborative Transcript Editing

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| CRDTs, operational transforms for collaborative editing | This is a single-user extension with zero collaboration use cases | Simple local inline editing |

### 9. OpenAI Responses API Migration

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Migrate from Chat Completions to OpenAI Responses API | The Responses API adds features (file search, code interpreter, stateful conversations) that are irrelevant for this use case. Chat Completions is simpler, well-supported, and works across both OpenAI and OpenRouter | Stay on Chat Completions API. If a specific Responses API feature becomes needed, evaluate per-feature |

---

## Feature Dependencies

```
Independent (no dependencies on other v2.0 features):
  [1] Markdown Rendering       (pure UI enhancement, no other feature deps)
  [5] Reasoning Model Support  (provider adapter changes only)
  [7] Transcript Inline Editing (TranscriptPanel change only)

Sequential chains:
  [3] Cost Tracking per Request
   |
   v
  [6] Cost Tracking Dashboard
      (dashboard displays data captured by per-request tracking)

Cross-feature interactions:
  [2] Enhanced Text Selection  <-->  [7] Transcript Inline Editing
      (both modify TranscriptPanel.tsx; must coordinate click-to-edit
       vs. click-to-select. Solution: double-click = edit, drag = select)

  [5] Reasoning Model Support  -->  [3] Cost Tracking per Request
      (reasoning tokens need cost handling; reasoning_tokens field
       must be captured for accurate cost calculation)

  [4] File Personalization     -->  [1] Markdown Rendering
      (personalized responses are longer/richer; markdown makes them
       usable. Not a hard dep, but should ship together or #1 first.)

v1.1 dependencies (external to v2.0):
  [6] Cost Tracking Dashboard  -->  IndexedDB (from v1.1)
      (historical cost storage requires persistent database)
  [4] File Personalization     -->  AES-GCM encryption (from v1.1)
      (resume text should be encrypted at rest like API keys)
```

**Optimal implementation order:**

```
Phase 1 (Foundation - highest impact, zero deps):
  [1] Markdown Rendering
  [5] Reasoning Model Support
  (Independent, can run in parallel, immediately improve core experience)

Phase 2 (Personalization + Context Quality):
  [4] File Personalization (Resume/JD)
  [7] Transcript Inline Editing
  (Both modify how context is built and sent to LLMs)

Phase 3 (Cost Awareness):
  [3] Cost Tracking per Request
  [6] Cost Tracking Dashboard
  (Sequential pair -- #3 captures data, #6 displays it)

Phase 4 (Selection Polish):
  [2] Enhanced Text Selection with Floating Tooltip
  (Must come after #7 to coordinate interaction patterns in
   TranscriptPanel. Most UI-complex feature, benefits from
   all prior features being stable.)
```

---

## Complexity Assessment Summary

| # | Feature | Complexity | Estimated Effort | Priority | Risk |
|---|---------|------------|------------------|----------|------|
| 1 | Markdown rendering | Medium | 1-2 days | P0 | Low (mature library) |
| 2 | Enhanced text selection + tooltip | Medium | 1.5-2 days | P1 | Medium (Shadow DOM edge cases) |
| 3 | Cost tracking per request | Medium | 1-1.5 days | P1 | Low (API fields documented) |
| 4 | File personalization (resume/JD) | Medium-High | 2-3 days | P1 | Medium (PDF extraction in MV3) |
| 5 | Reasoning model support | Medium | 1-1.5 days | P0 | Low (partial support exists) |
| 6 | Cost tracking dashboard | Medium | 1.5-2 days | P2 | Low (display/aggregation only) |
| 7 | Transcript inline editing | Medium | 1-1.5 days | P1 | Low (simple input pattern) |

**Total estimated effort for v2.0:** 10-14 engineering days

**Risk matrix:**
- **Feature #4** (file personalization) has the highest technical risk due to PDF.js Chrome MV3 web worker incompatibility. Mitigated by: (a) supporting text/paste as the primary input, (b) running extraction in popup/offscreen document, (c) using unpdf as fallback.
- **Feature #2** (enhanced selection) has moderate risk around Shadow DOM selection positioning and interaction conflict with transcript editing. Mitigated by implementing #7 first and defining clear interaction patterns.
- All other features are low risk with well-established patterns and libraries.

---

## MVP Recommendation for v2.0

**Must ship (P0) -- Fixes the two most visible gaps:**
1. **[1] Markdown rendering** -- The single highest-impact UX improvement. Every response immediately looks professional instead of broken. Users will perceive this as a bug fix, not a feature.
2. **[5] Reasoning model support** -- Completes partial implementation, unlocks o3/o4-mini (best price-to-performance ratio in reasoning), enables dual-effort optimization.

**Should ship (P1) -- Makes this tool genuinely better than competitors:**
3. **[4] File personalization** -- The defining differentiator. "AI that knows your resume" transforms generic answers into personalized coaching. Final Round AI charges $96/year for this; we provide it with your own API keys.
4. **[3] Cost tracking per request** -- Trust-building for cost-conscious users who bring their own API keys. Transparency is a selling point.
5. **[7] Transcript inline editing** -- Fixes "garbage in, garbage out" for LLM context quality. Quick to build, immediate value.
6. **[2] Enhanced text selection** -- Polishes highlight-to-send into a professional, discoverable interaction pattern.

**Can defer to v2.1 (P2) -- Nice-to-have but not critical:**
7. **[6] Cost tracking dashboard** -- Historical view is valuable but not urgent. Per-request cost display (#3) covers the immediate need. Dashboard provides value after the user has accumulated multiple sessions.

**Rationale:** P0 items fix what appears broken (raw markdown, outdated models). P1 items add the features that make this tool worth using over free alternatives. P2 items are polish that accumulates value over time.

---

## Sources

### HIGH Confidence (Official docs, verified)
- [react-markdown (GitHub)](https://github.com/remarkjs/react-markdown) -- 13k+ stars, active, official remark/rehype ecosystem
- [sugar-high (GitHub)](https://github.com/huozhi/sugar-high) -- ~1KB syntax highlighter, verified bundle size
- [rehype-highlight (npm)](https://www.npmjs.com/package/rehype-highlight) -- integrates with react-markdown, 37 default languages
- [OpenAI Chat Completions API Reference](https://platform.openai.com/docs/api-reference/chat) -- usage field structure, stream_options
- [OpenAI Reasoning Models Guide](https://platform.openai.com/docs/guides/reasoning) -- reasoning_effort, developer role, max_completion_tokens
- [OpenAI o3 and o4-mini Announcement](https://openai.com/index/introducing-o3-and-o4-mini/) -- capabilities, pricing, tool use
- [OpenRouter Reasoning Tokens Guide](https://openrouter.ai/docs/guides/best-practices/reasoning-tokens) -- effort parameter, provider differences
- [Window.getSelection() (MDN)](https://developer.mozilla.org/en-US/docs/Web/API/Window/getSelection) -- selection API
- [OpenAI Streaming Usage Stats](https://community.openai.com/t/usage-stats-now-available-when-using-streaming-with-the-chat-completions-api-or-completions-api/738156) -- stream_options include_usage
- [Descript Transcript Correction](https://help.descript.com/hc/en-us/articles/10119613609229-Correct-your-transcript) -- inline editing UX patterns

### MEDIUM Confidence (Multiple sources agree)
- [OpenAI API Pricing (CostGoat)](https://costgoat.com/pricing/openai-api) -- current pricing as of Feb 2026
- [Helicone o3/o4-mini Guide](https://www.helicone.ai/blog/o3-and-o4-mini-for-developers) -- pricing, migration strategy
- [Final Round AI (Reviews)](https://favtutor.com/articles/final-round-ai-review/) -- resume/JD upload flow, competitive analysis
- [pdfjs-dist Chrome Extension Issue #10429](https://github.com/mozilla/pdf.js/issues/10429) -- web worker compatibility issue
- [Shadow DOM CSS Isolation in Chrome Extensions](https://sweets.chat/blog/article/isolating-styles-in-chrome-extensions-with-shadow-dom) -- style isolation patterns
- [React-Markdown Copy Code Button (DEV)](https://dev.to/designly/react-markdown-how-to-create-a-copy-code-button-26cm) -- implementation pattern
- [Cursor Token Tracker (Chrome Web Store)](https://chromewebstore.google.com/detail/cursor-token-tracker/nohlfnbgnikhkbaljpdkicgbdaaeofnd) -- local cost tracking UX reference

### LOW Confidence (Needs validation)
- react-markdown exact bundle size (~60kB minzipped) -- varies by version and tree-shaking
- PDF.js web worker workaround via offscreen documents -- logical approach but not confirmed with a working Chrome MV3 implementation
- `reasoning_effort` dual-stream optimization (low for fast, high for full) -- novel approach not documented elsewhere; needs testing
- unpdf as PDF.js alternative in Chrome MV3 -- not tested in this specific context
