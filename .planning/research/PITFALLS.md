# Domain Pitfalls: v2.0 Enhanced Experience

**Domain:** Adding file personalization, cost tracking, reasoning models, markdown rendering, text selection tooltips, and transcript editing to existing Chrome MV3 interview assistant extension
**Researched:** 2026-02-09
**Confidence:** HIGH (verified against codebase analysis + official documentation + community reports)

---

## Critical Pitfalls

Mistakes that cause broken features, data loss, or require architectural rewrites.

---

### Pitfall 1: Reasoning Models Return Empty Responses When max_completion_tokens Is Too Low

**What goes wrong:** The current `OpenAIProvider.ts` (line 77-79) sets `max_completion_tokens` for reasoning models. But reasoning models (o1, o3, o4-mini) consume reasoning tokens from the same `max_completion_tokens` budget before producing visible output. If the budget is too small, ALL tokens are consumed by internal reasoning, and the response contains zero visible content. The user sees a blank "Full Answer" panel.

**Why it happens:** The current code uses `maxTokens: 300` for fast hints and `maxTokens: 2000` for full answers (background.ts lines 445-458). For standard models, 2000 tokens is generous. For reasoning models, o4-mini can consume 5000-20000+ tokens just for reasoning, leaving nothing for visible output. The `finish_reason` will be `"length"` with empty content.

**Consequences:**
- Users select o3-mini as their "fast model" (it is listed as `category: 'fast'` in `OPENAI_MODELS` at line 52) and get blank responses every time
- Users select o1 or o3 as "full model" and get blank or truncated responses
- The error is silent -- status shows "complete" but content is empty
- Users blame the extension, not the token budget

**Prevention:**
- Set minimum `max_completion_tokens` of 25,000 for reasoning models (OpenAI's own recommendation)
- Override the `maxTokens: 300` fast hint budget when the model is a reasoning model -- reasoning models should NOT be used as fast hint models at all
- Add a UI warning when a reasoning model is selected for the "fast model" slot: "Reasoning models are slow and expensive -- use GPT-4o-mini or GPT-4.1-nano for fast hints"
- Detect empty responses with `finish_reason: "length"` and show a specific error: "Response truncated -- increase token budget or use a non-reasoning model"
- Track `completion_tokens_details.reasoning_tokens` from the API response to show users how much budget reasoning consumed

**Detection:** Empty `fullAnswer` with status "complete". The `usage.completion_tokens_details.reasoning_tokens` in the API response will show tokens were consumed but `usage.completion_tokens - usage.completion_tokens_details.reasoning_tokens` is near zero.

**Codebase reference:** `src/services/llm/providers/OpenAIProvider.ts:77-79` (token limit), `entrypoints/background.ts:440-458` (maxTokens values)

**Sources:**
- [O4-mini returns empty response because reasoning token used all completion tokens (OpenAI Community)](https://community.openai.com/t/o4-mini-returns-empty-response-because-reasoning-token-used-all-the-completion-token/1359002)
- [Reasoning models (OpenAI API Guide)](https://platform.openai.com/docs/guides/reasoning)

---

### Pitfall 2: Reasoning Models Silently Reject System Messages on Older Model Versions

**What goes wrong:** The current `OpenAIProvider.streamResponse` (line 89) always sends `{ role: 'system', content: systemPrompt }`. For older reasoning model versions (o1-preview, o1-mini), system messages are NOT supported and will cause an API error. For newer versions (o1, o3, o3-mini, o4-mini), system messages are accepted but silently converted to developer messages. You must NOT send both a system message and a developer message in the same request.

**Why it happens:** OpenAI evolved reasoning model API support across versions. o1-preview and o1-mini do not support system messages at all. The newer o1 (not o1-preview) and o3/o4-mini accept system messages by treating them as developer messages. The codebase already has `isReasoningModel()` detection (line 25-31) but only uses it for `max_completion_tokens` -- it does not adjust the message format.

**Consequences:**
- API returns 400 error for o1-preview/o1-mini with system messages
- The circuit breaker trips after repeated failures, blocking ALL LLM requests
- Users who select o1-preview or o1-mini get persistent errors with no clear explanation

**Prevention:**
- For reasoning models, send `{ role: 'developer', content: systemPrompt }` instead of `{ role: 'system', content: systemPrompt }`
- For o1-preview and o1-mini specifically, omit the system/developer message entirely and prepend context to the user message
- Update `isReasoningModel()` to also detect o4-mini (`bareModel.startsWith('o4')`)
- Remove `temperature` from the request body for reasoning models (it is fixed at 1 and sending it may cause errors)
- Add `reasoning_effort` parameter support ('low', 'medium', 'high') for reasoning models

**Detection:** API returns `400 Bad Request` with error about unsupported parameters or message roles.

**Codebase reference:** `src/services/llm/providers/OpenAIProvider.ts:25-31` (`isReasoningModel`), `src/services/llm/providers/OpenAIProvider.ts:86-95` (request body construction)

**Sources:**
- [Reasoning models API guide (OpenAI)](https://platform.openai.com/docs/guides/reasoning)
- [Azure OpenAI reasoning models (Microsoft Learn)](https://learn.microsoft.com/en-us/azure/ai-foundry/openai/how-to/reasoning)

---

### Pitfall 3: Markdown Rendering in Shadow DOM Gets No Styles

**What goes wrong:** The overlay renders inside a Shadow DOM (`createShadowRootUi` in content.tsx line 329). Markdown rendering libraries like `react-markdown` produce standard HTML elements (`<h1>`, `<code>`, `<pre>`, `<blockquote>`, `<ul>`, `<li>`, etc.). These elements receive no styling because:
1. Tailwind's `@tailwindcss/typography` (`prose` class) generates styles that target the document's `<head>`, which does NOT penetrate the Shadow DOM
2. Any global CSS or imported stylesheets are injected into the main document, not the shadow root
3. The shadow boundary blocks ALL inherited styles except CSS custom properties

**Why it happens:** WXT's `createShadowRootUi` with `cssInjectionMode: 'ui'` handles injecting the extension's own CSS into the shadow root (the `app.css` import at content.tsx line 6). However, dynamically loaded plugin CSS (like highlight.js themes or typography prose styles) may not be captured by this injection mechanism. The rendered markdown HTML will appear as unstyled plain text with no visual hierarchy.

**Consequences:**
- Code blocks appear as inline text with no background, no monospace font, no syntax highlighting
- Headers, lists, blockquotes all render at the same size as body text
- The "Full Answer" panel becomes an unreadable wall of text
- Users cannot distinguish code from prose, headers from paragraphs

**Prevention:**
- Define explicit Tailwind utility classes for each markdown element type using `react-markdown`'s `components` prop -- map each HTML element to a React component with Tailwind classes applied directly:
  ```tsx
  <ReactMarkdown components={{
    h1: ({children}) => <h1 className="text-lg font-bold text-white/90 mb-2">{children}</h1>,
    code: ({children, className}) => className?.includes('language-')
      ? <pre className="bg-black/30 rounded p-2 overflow-x-auto"><code className="text-sm text-green-300">{children}</code></pre>
      : <code className="bg-white/10 rounded px-1 text-sm text-green-300">{children}</code>,
    // ... etc for all elements
  }} />
  ```
- Do NOT rely on `@tailwindcss/typography` prose classes -- they will not work inside Shadow DOM without explicit injection
- For syntax highlighting, use `react-syntax-highlighter` with inline styles (not CSS classes) since inline styles work inside Shadow DOM
- Test markdown rendering inside the Shadow DOM on the Google Meet page, not in isolation

**Detection:** Rendered markdown appears as a flat wall of unstyled text. Code blocks are indistinguishable from regular text. No visual hierarchy.

**Codebase reference:** `entrypoints/content.tsx:329` (`createShadowRootUi`), `src/overlay/ResponsePanel.tsx:83-98` (current plain text rendering that needs to become markdown)

**Sources:**
- [CSS Shadow DOM Pitfalls (PixelFreeStudio)](https://blog.pixelfreestudio.com/css-shadow-dom-pitfalls-styling-web-components-correctly/)
- [Shadow DOM style encapsulation (CSS-Tricks)](https://css-tricks.com/encapsulating-style-and-structure-with-shadow-dom/)

---

### Pitfall 4: File Upload from Content Script Cannot Use Service Worker for FormData

**What goes wrong:** To upload files to OpenAI's Files API, you need to send `multipart/form-data` with the file blob. The natural architecture would be: user picks file in overlay (content script) -> sends file to service worker -> service worker uploads to OpenAI. But transferring large file blobs (PDF resumes, 5-10MB) between content script and service worker via `chrome.runtime.sendMessage` is problematic:
1. Message passing serializes data -- large blobs become base64-encoded strings, doubling memory usage
2. Chrome's message passing has no official size limit but performance degrades sharply above 1-2MB
3. The service worker's 30-second idle timeout can kill the upload mid-transfer

**Why it happens:** Chrome extension message passing uses structured cloning, which converts `ArrayBuffer`/`Blob` to serialized data. For a 5MB PDF, this means ~6.5MB of base64 in memory on both sides, plus serialization/deserialization overhead. Combined with the service worker's ephemeral lifecycle, large file operations are unreliable.

**Consequences:**
- File uploads for large PDFs silently fail or timeout
- Memory spikes cause the Google Meet tab to lag during upload
- Service worker terminates mid-upload, losing the file data

**Prevention:**
- Upload files directly from the content script context (or popup), NOT through the service worker. The content script runs in the page context and can make `fetch` calls to `https://api.openai.com` (already allowed by CSP `connect-src` in manifest)
- Read the file with `FileReader` in the content script, create `FormData`, and `fetch` directly to OpenAI's Files API
- Store only the returned `file_id` string (not the file blob) in the Zustand store for the service worker to use in subsequent API calls
- Add `https://api.openai.com` to `connect-src` in manifest CSP if not already present (it IS present at wxt.config.ts line 36)
- Keep file size validation client-side: reject files >512MB (OpenAI's limit), warn at >20MB
- For the file picker UI: `<input type="file">` works inside Shadow DOM -- the browser's native file picker is NOT affected by Shadow DOM isolation

**Detection:** Upload appears to hang. Console shows large serialization warnings or the service worker terminates with active fetch in flight.

**Codebase reference:** `wxt.config.ts:36` (CSP connect-src already includes `https://api.openai.com`), `entrypoints/background.ts` (service worker lifecycle)

**Sources:**
- [Files API Reference (OpenAI)](https://platform.openai.com/docs/api-reference/files)
- [Extension service worker lifecycle (Chrome)](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle)

---

### Pitfall 5: Chart.js Canvas Requires unsafe-inline Style-src in CSP

**What goes wrong:** Chart.js sets `width` and `height` on the `<canvas>` element via inline `style` attributes. Chrome extensions enforce a Content Security Policy that, by default for extension pages, does not allow `style-src 'unsafe-inline'`. However, the overlay runs as a content script inside the Google Meet page, not as an extension page. Content scripts inherit the page's CSP for their DOM context. Google Meet's CSP may block inline styles too. Additionally, if running inside Shadow DOM, Chart.js may fail to detect the canvas dimensions correctly because the canvas is not in the main document flow.

**Why it happens:** Chart.js internally does `canvas.style.width = '...'` and `canvas.style.height = '...'`. If the CSP blocks this, the canvas renders at 0x0 or throws a CSP violation. Even if CSP allows it, Chart.js uses `getComputedStyle()` and `getBoundingClientRect()` on the canvas to determine responsive sizing, which may return unexpected values inside Shadow DOM.

**Consequences:**
- Charts render as invisible 0x0 canvases
- CSP violation errors flood the console
- Chart.js responsive mode breaks because it cannot read the container dimensions inside Shadow DOM

**Prevention:**
- Use a lightweight SVG-based charting library instead of Chart.js -- SVG elements are styled via attributes (not inline CSS) and work better inside Shadow DOM. Recommended: `recharts` (React-native, SVG-based, no CSP issues) or `lightweight-charts`
- If Chart.js is required, disable responsive mode (`responsive: false`) and set explicit pixel dimensions via Canvas element attributes (`width="300" height="200"`) rather than CSS
- Test chart rendering inside the Shadow DOM overlay on Google Meet, not in a standalone page
- For cost tracking charts specifically, consider a simple custom SVG bar chart -- the data is simple (model name, token count, cost) and does not need a full charting library

**Detection:** Chart area appears blank. Console shows `Refused to apply inline style because it violates the following Content Security Policy directive`.

**Sources:**
- [Chart.js CSP style-src issue (#5208)](https://github.com/chartjs/Chart.js/issues/5208)
- [Chart.js canvas style attribute CSP issue (#8108)](https://github.com/chartjs/Chart.js/issues/8108)

---

### Pitfall 6: Zustand Store Bloat From Cost History Breaks webext-zustand Sync

**What goes wrong:** Cost tracking accumulates data over time -- every LLM request adds a record with model, token counts, cost, and timestamp. If this data is stored in the Zustand store (which syncs across all contexts via webext-zustand), every cost record addition triggers a full state serialization and broadcast to ALL open Google Meet tabs. After weeks of use with hundreds/thousands of records, this sync becomes a significant performance bottleneck.

**Why it happens:** webext-zustand broadcasts the entire store state on every change. With cost history in the store, adding one record means serializing and sending potentially hundreds of KB of cost data to every tab. The current store already contains templates, settings, consent flags, and API keys. Adding unbounded cost history could push it past practical limits.

**Consequences:**
- Extension becomes sluggish after extended use
- Message passing between service worker and content scripts becomes slow
- Memory usage grows unbounded
- Eventually hits `chrome.storage.local` 10MB limit (without `unlimitedStorage` permission)

**Prevention:**
- Do NOT store cost history in the Zustand store. Store it separately in `chrome.storage.local` under its own key (e.g., `cost-tracking-history`), or better yet in IndexedDB
- Store only aggregated summary data in the Zustand store: `{ totalCost: number, sessionCost: number, requestCount: number }` -- lightweight, bounded
- The full cost history is only needed when the user opens the cost tracking UI in the popup -- load it on-demand from IndexedDB, not from the synced store
- Implement data retention: auto-delete records older than 90 days, or cap at 1000 records
- Implement Zustand persist `partialize` to explicitly exclude cost history from persistence (it already excludes functions -- extend it to exclude history arrays)

**Detection:** Extension becomes noticeably slower after weeks of use. `chrome.storage.local.getBytesInUse` returns unexpectedly large values. Store sync messages in console show large payloads.

**Codebase reference:** `src/store/index.ts:40-52` (`partialize` -- currently only persists specific fields, but any new fields added here will be synced), `src/store/index.ts:97` (`wrapStore` -- triggers full sync on every change)

**Sources:**
- [State Storage in Chrome Extensions (HackerNoon)](https://hackernoon.com/state-storage-in-chrome-extensions-options-limits-and-best-practices)
- [chrome.storage API quotas (Chrome)](https://developer.chrome.com/docs/extensions/reference/api/storage)

---

## Moderate Pitfalls

---

### Pitfall 7: Reasoning Model Streaming Sends reasoning_content Tokens That Break Existing SSE Parser

**What goes wrong:** The current SSE parser (`streamSSE.ts`) extracts content from `choice.delta.content`. Reasoning models may include a `reasoning_content` field in the delta (separate from `content`) that contains the model's chain-of-thought. If the parser ignores this field entirely, the stream appears to stall during the reasoning phase (no tokens emitted for 10-60+ seconds) before visible content starts streaming. Users will think the extension is frozen.

**Why it happens:** For standard models, tokens arrive immediately and continuously. For reasoning models, there is a long "thinking" phase where reasoning tokens are generated but may not be sent as `content` deltas (depending on the API version and settings). The existing `onToken` callback only fires for visible content. During the thinking phase, no tokens arrive, the keep-alive mechanism may not be triggered, and the service worker could terminate.

**Consequences:**
- UI shows "Streaming..." but no text appears for 10-60+ seconds
- Users cancel the request thinking it is broken
- Service worker may terminate during the long thinking phase if keep-alive is not maintained
- If reasoning_content IS sent via the delta, it gets silently dropped and users miss valuable chain-of-thought context

**Prevention:**
- Add explicit handling for the reasoning phase: detect when a reasoning model is in use and show "Thinking..." status with an elapsed time counter instead of "Streaming..."
- If the API sends `delta.reasoning_content`, optionally display it in a collapsible "Chain of Thought" section
- Ensure the keep-alive interval runs during the reasoning phase (the current 20-second interval at background.ts:64 should be sufficient, but verify the reasoning phase doesn't exceed the 30-second service worker timeout between keep-alive pings)
- Add a longer timeout for reasoning model requests (120+ seconds vs 30 seconds for standard models)
- Parse both `delta.content` and `delta.reasoning_content` in `streamSSE.ts`

**Detection:** "Streaming..." indicator stays active but no text appears in the response panel for extended periods. If keep-alive fails, the response suddenly stops and an error appears.

**Codebase reference:** `src/services/llm/providers/streamSSE.ts:119-133` (only reads `delta.content`), `entrypoints/background.ts:62-67` (keep-alive interval)

**Sources:**
- [Streaming API responses (OpenAI)](https://platform.openai.com/docs/guides/streaming-responses)
- [Reasoning model streaming events (OpenAI)](https://platform.openai.com/docs/api-reference/responses-streaming)

---

### Pitfall 8: Floating Selection Tooltip Positioned Incorrectly Inside Shadow DOM

**What goes wrong:** Implementing a text selection tooltip (for selecting text in the response panel and getting follow-up actions) requires `window.getSelection()` and `Range.getBoundingClientRect()` to position the tooltip. Inside Shadow DOM, `window.getSelection()` behaves differently across browsers. In Chromium, it returns only the selection from the DOM tree containing the selection anchor. If the selection is inside the Shadow DOM, `document.getSelection()` from the main document may return null or incomplete results.

**Why it happens:** The Selection API was designed before Shadow DOM existed. Browser implementations vary:
- Chromium: has non-standard `shadowRoot.getSelection()` but only for open shadow roots
- The overlay uses WXT's shadow root which is accessible, but the selection coordinates from `getBoundingClientRect()` are relative to the viewport, while the tooltip position needs to be relative to the overlay container (which is inside the Shadow DOM and may be dragged/resized via react-rnd)

**Consequences:**
- Tooltip appears at the wrong position (offset by the overlay's drag position)
- Tooltip appears outside the overlay, on the Google Meet page
- Selection returns null even when text is visibly selected
- On certain Chrome versions, getSelection inside Shadow DOM returns empty ranges

**Prevention:**
- Access selection via the shadow root: `shadowRoot.getSelection()` (Chromium-specific but this is a Chrome extension)
- If the selection API is not available on the shadow root, listen for `mouseup` events and compute selection from the event target within the shadow root
- Calculate tooltip position relative to the overlay container, not the viewport:
  ```typescript
  const range = shadowRoot.getSelection()?.getRangeAt(0);
  const rangeRect = range?.getBoundingClientRect();
  const overlayRect = overlayContainer.getBoundingClientRect();
  const tooltipX = rangeRect.left - overlayRect.left;
  const tooltipY = rangeRect.top - overlayRect.top;
  ```
- Use `floating-ui` (successor to Popper.js) with its `autoUpdate` for repositioning during drag/resize
- Bind the tooltip to the overlay container's coordinate space, not the document

**Detection:** Tooltip appears in the wrong location or does not appear at all. Test by selecting text in the response panel while the overlay is dragged away from its default position.

**Sources:**
- [Shadow DOM Selection API explainer (GitHub)](https://github.com/mfreed7/shadow-dom-selection)
- [Shadow selection polyfill (Google Chrome Labs)](https://github.com/GoogleChromeLabs/shadow-selection-polyfill)
- [chrome.dom API (Chrome)](https://developer.chrome.com/docs/extensions/reference/api/dom)

---

### Pitfall 9: contentEditable Transcript Editing Causes Cursor Jumping and React State Desync

**What goes wrong:** Adding inline editing to transcript entries requires making the text content editable. Using `contentEditable` with React is notoriously problematic because React's virtual DOM and the browser's contentEditable system both want to own the DOM. When React re-renders the component (e.g., a new transcript entry arrives), it overwrites the contentEditable content, causing the cursor to jump to the beginning or the user's edits to be lost.

**Why it happens:** The `TranscriptPanel` (TranscriptPanel.tsx) renders entries in a `memo`-ized list. When new entries arrive (via the `transcript-update` custom event), the parent re-renders with a new `entries` array. React reconciles the list and may re-render individual `TranscriptEntryRow` components. If the entry being edited has the same `key` but a new object reference (because the entire entries array is replaced on every event), React will re-render it and overwrite the user's in-progress edit.

**Consequences:**
- User starts editing a transcript entry, a new partial transcript arrives, and their edit is wiped
- Cursor jumps to the beginning of the text on every keystroke if state management is wrong
- Pasted text retains formatting from the clipboard (bold, font changes, etc.)
- Undo/redo (Ctrl+Z) may not work as expected

**Prevention:**
- Use `react-contenteditable` library which handles the React/contentEditable conflict with proper `shouldComponentUpdate` logic
- Better approach: use a controlled `<textarea>` or `<input>` that appears on double-click/click of the entry text, replacing the display text temporarily. This avoids contentEditable entirely
- When an entry is in "edit mode", freeze it from receiving updates from the transcript stream -- use a local state flag `isEditing` per entry
- Strip HTML on paste: listen for `onPaste` and use `event.clipboardData.getData('text/plain')` to paste only plain text
- After editing, dispatch the change back through the proper channel (custom event or message to background) so the transcript buffer is updated
- Batch incoming transcript updates while an entry is being edited -- apply them only after the user confirms the edit

**Detection:** Cursor jumps to position 0 on every keystroke. User edits disappear when new transcript entries arrive.

**Codebase reference:** `src/overlay/TranscriptPanel.tsx:60-78` (TranscriptEntryRow component), `entrypoints/content.tsx:132-136` (transcript-update replaces entire entries array)

**Sources:**
- [react-contenteditable (npm)](https://www.npmjs.com/package/react-contenteditable)
- [ContentEditable elements in React (Tania Rascia)](https://www.taniarascia.com/content-editable-elements-in-javascript-react/)

---

### Pitfall 10: Cost Tracking Token Counts Not Available in SSE Streaming Mode

**What goes wrong:** To track costs, you need `usage.prompt_tokens`, `usage.completion_tokens`, and `usage.completion_tokens_details.reasoning_tokens` from the API response. But in streaming mode (which this extension uses exclusively), the usage object is only included in the final chunk when you set `stream_options: { include_usage: true }` in the request. The current `streamSSE.ts` does not request or parse the usage object.

**Why it happens:** By default, the OpenAI streaming API does NOT include token usage in SSE chunks. You must explicitly opt in with `stream_options: { include_usage: true }`. Even then, the usage data arrives only in the last chunk (where `choices` is empty). The current parser looks for `[DONE]` and calls `completeOnce()` but does not extract usage data from the final chunk.

**Consequences:**
- Cost tracking has no data -- all cost fields show zero
- You would need to estimate token counts from text length, which is unreliable (especially for reasoning tokens, which are invisible)
- Without usage data, cost tracking is useless -- the whole feature depends on this

**Prevention:**
- Add `stream_options: { include_usage: true }` to the request body in both `OpenAIProvider.streamResponse` and `OpenRouterProvider.streamResponse`
- Modify `streamSSE.ts` to parse the usage object from the final chunk (it arrives in a chunk with `usage` field and empty `choices`):
  ```typescript
  if (chunk.usage) {
    onUsage({
      promptTokens: chunk.usage.prompt_tokens,
      completionTokens: chunk.usage.completion_tokens,
      reasoningTokens: chunk.usage.completion_tokens_details?.reasoning_tokens ?? 0,
    });
  }
  ```
- Add an `onUsage` callback to `ProviderStreamOptions` and `StreamCallbacks`
- Verify that OpenRouter also supports `stream_options` (it follows OpenAI-compatible format but may differ)

**Detection:** Cost tracking dashboard shows all zeros. No usage data appears in console logs.

**Codebase reference:** `src/services/llm/providers/streamSSE.ts:46-163` (no usage parsing), `src/services/llm/providers/OpenAIProvider.ts:81-99` (request body without stream_options)

**Sources:**
- [Chat Completions API reference (OpenAI)](https://platform.openai.com/docs/api-reference/chat)
- [Pricing documentation (OpenAI)](https://platform.openai.com/docs/pricing)

---

### Pitfall 11: Store Migration Required But No Version Strategy Exists

**What goes wrong:** v2.0 adds multiple new fields to the Zustand store: cost tracking summary, uploaded file references, reasoning model preferences, markdown rendering settings. When existing v1.1 users update to v2.0, the persisted store in `chrome.storage.local` does not have these fields. Zustand's persist middleware will merge the stored state with the initial state, but:
1. If a new field's default depends on existing state (e.g., cost tracking initialized from existing model selections), the default is wrong
2. If field types change (e.g., `models.fullModel` needs a `reasoningEffort` sub-field), the old stored value overwrites the new structure
3. The current store has NO `version` number in its persist config, making incremental migrations impossible

**Why it happens:** The current persist config (`src/store/index.ts:36-60`) does not specify a `version` or `migrate` function. Zustand's default behavior is to merge persisted state over initial state (shallow merge). This works for adding NEW fields (they get defaults) but fails for restructuring existing fields.

**Consequences:**
- Users on v1.1 upgrade and some features silently use wrong defaults
- If a field is renamed or restructured, the old value persists and the new structure is ignored
- No way to run one-time data transformations on upgrade

**Prevention:**
- Add `version: 2` and a `migrate` function to the persist config NOW, before v2.0:
  ```typescript
  persist(
    (...a) => ({ ...slices }),
    {
      name: 'ai-interview-settings',
      version: 2,
      migrate: (persisted, version) => {
        if (version < 2) {
          // Add new v2.0 fields, transform structures
          return { ...persisted, costTracking: { totalCost: 0, ... } };
        }
        return persisted;
      },
      // ... rest of config
    }
  )
  ```
- Test migration by loading a v1.1 store snapshot and verifying v2.0 fields are correctly initialized
- Add migration unit tests that verify each version transition
- Document the version history for future milestones

**Detection:** New features show unexpected default values or error when accessing undefined nested fields.

**Codebase reference:** `src/store/index.ts:29-61` (persist config without version/migrate)

**Sources:**
- [Persisting store data - Zustand](https://zustand.docs.pmnd.rs/integrations/persisting-store-data)
- [How to migrate Zustand local storage store (DEV Community)](https://dev.to/diballesteros/how-to-migrate-zustand-local-storage-store-to-a-new-version-njp)

---

### Pitfall 12: File Upload API Key Exposed in Content Script Network Requests

**What goes wrong:** If file uploads are done from the content script (as recommended in Pitfall 4 to avoid service worker blob issues), the OpenAI API key must be available in the content script context to authenticate the upload request. Network requests from the content script are visible in the Google Meet page's DevTools Network tab. Anyone inspecting network traffic on the page can see the `Authorization: Bearer sk-...` header.

**Why it happens:** Content scripts share the page's network context. Unlike the service worker (which has its own network context hidden from the page), requests from content scripts are fully visible in the page's DevTools.

**Consequences:**
- API keys visible to anyone who opens DevTools on the Google Meet page
- If the page has any XSS vulnerability, malicious scripts can intercept the API key
- This violates the extension's existing security posture (SEC-01: keys read from store only in background)

**Prevention:**
- Route file uploads through the popup or a dedicated offscreen document instead of the content script
- Best approach: use the popup page for file uploads. The popup is an extension page with its own origin, and network requests from extension pages are NOT visible in the Google Meet page's DevTools
- Alternative: create a small offscreen document specifically for file uploads. It shares the extension origin and can make authenticated requests invisibly
- After upload, send only the `file_id` back to the service worker via messaging
- NEVER send the raw API key to the content script -- the current architecture correctly keeps keys in the service worker (background.ts:399)

**Detection:** Open DevTools on the Google Meet page and check the Network tab during file upload. If the Authorization header with the API key is visible, the key is exposed.

**Codebase reference:** `entrypoints/background.ts:399` (API key read from store in service worker only), `src/services/crypto/encryptedStorage.ts` (encrypted key storage)

---

## Minor Pitfalls

---

### Pitfall 13: Markdown XSS via Untrusted LLM Output

**What goes wrong:** LLM responses are rendered as markdown, which can include HTML. If using `rehype-raw` (which allows raw HTML in markdown), the LLM could produce output containing `<script>`, `<img onerror="...">`, or other XSS vectors. Even without `rehype-raw`, markdown link syntax `[click me](javascript:alert(1))` can create XSS.

**Prevention:**
- Do NOT use `rehype-raw` -- it enables raw HTML in markdown
- Use `rehype-sanitize` to strip dangerous HTML elements and attributes
- Configure `react-markdown`'s `allowedElements` to only permit safe elements: `p`, `h1-h6`, `ul`, `ol`, `li`, `code`, `pre`, `blockquote`, `strong`, `em`, `a` (with href validation)
- Strip `javascript:` URLs from links
- The Chrome extension CSP provides a defense-in-depth layer, but do not rely on it solely

**Detection:** Code review of markdown renderer configuration. Test with deliberately malicious LLM output containing script tags.

---

### Pitfall 14: Cost Tracking Pricing Data Goes Stale

**What goes wrong:** Token pricing changes frequently. OpenAI updates prices when releasing new models or changing existing model pricing. If prices are hardcoded in the extension, costs will be wrong after a pricing change (potentially under- or over-reporting by 2-10x).

**Prevention:**
- Store pricing data as a configuration object that can be updated without a code release
- Include a `lastUpdated` timestamp and display "Prices last updated: [date]" in the cost tracking UI
- Consider fetching current prices from a simple JSON endpoint (even a GitHub raw URL) on extension startup
- At minimum, display token counts alongside estimated costs -- token counts are always accurate even when prices are stale
- Include a disclaimer: "Cost estimates are approximate and may not reflect current pricing"

**Detection:** Compare displayed costs with OpenAI's billing dashboard. Discrepancies indicate stale pricing data.

---

### Pitfall 15: Transcript Edit Conflicts With Auto-Scroll

**What goes wrong:** The `TranscriptPanel` uses `useAutoScroll` (TranscriptPanel.tsx line 86) to auto-scroll to the bottom when new entries arrive. If the user is editing a transcript entry in the middle of the list, auto-scroll will move the viewport away from their edit, making the editing experience jarring and frustrating.

**Prevention:**
- Disable auto-scroll when any entry is in edit mode
- Detect user scroll position: if the user has scrolled away from the bottom (to review/edit earlier entries), pause auto-scroll. Resume only when the user scrolls back to the bottom
- Add a "scroll to bottom" button that appears when auto-scroll is paused
- In the `useAutoScroll` hook, add a condition: `if (isEditing) return` before scrolling

**Detection:** Start editing an entry, wait for new transcript entries to arrive. If the view jumps to the bottom while editing, the pitfall is present.

**Codebase reference:** `src/overlay/hooks/useAutoScroll.ts`, `src/overlay/TranscriptPanel.tsx:86`

---

### Pitfall 16: OpenAI Files API Requires Purpose Field and Has Rate Limits

**What goes wrong:** The OpenAI Files API requires a `purpose` field (e.g., `"assistants"`, `"fine-tune"`) when uploading. If you upload with the wrong purpose, the file cannot be used with certain endpoints. Additionally, there are rate limits on file uploads (typically 100 files per organization) and files have a maximum retention period.

**Prevention:**
- Upload with `purpose: "assistants"` for files used in chat context
- Implement file management: list uploaded files, delete old files, show remaining quota
- Cache the `file_id` locally so the same file is not uploaded repeatedly
- Handle the case where a cached `file_id` is no longer valid (file was deleted or expired) -- re-upload on 404

**Detection:** API returns 400 with "invalid purpose" or 429 with rate limit exceeded.

---

### Pitfall 17: Overlay Height Insufficient for New Feature Panels

**What goes wrong:** v2.0 adds markdown rendering (taller responses), cost tracking display, file upload UI, and transcript editing controls. The current overlay has a fixed `minHeight: 200` (Overlay.tsx line 323) and a default height of 400px (transcript.ts line 78). With all new features, the usable content area becomes too cramped, especially the transcript panel at a fixed `h-28` (TranscriptPanel.tsx line 101).

**Prevention:**
- Increase `minHeight` to 300-350px to accommodate new features
- Make the transcript panel height dynamic: allow the divider between transcript and response to be draggable
- Consider a tabbed or collapsible panel design: Transcript | Response | Cost -- show one at a time with tabs
- The overlay is already resizable (react-rnd), but users may not realize they need to resize it. Default to a larger initial size for v2.0

**Detection:** UI elements overlap or are cut off at default size. Content is cramped and unreadable without manual resizing.

**Codebase reference:** `src/overlay/Overlay.tsx:322-323` (minWidth/minHeight), `src/overlay/TranscriptPanel.tsx:101` (fixed h-28)

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Severity | Mitigation |
|---|---|---|---|
| Reasoning Models | Empty responses from token budget exhaustion | CRITICAL | Minimum 25K max_completion_tokens, warn against reasoning for fast hints |
| Reasoning Models | System message rejection on o1-preview/o1-mini | CRITICAL | Use developer role, update isReasoningModel to detect all o-series |
| Reasoning Models | Reasoning phase appears frozen (no streaming tokens) | MODERATE | Show "Thinking..." with timer, extend timeouts |
| Markdown Rendering | No styles inside Shadow DOM | CRITICAL | Use component-level Tailwind classes, not prose/typography plugin |
| Markdown Rendering | XSS via LLM-generated markdown | MINOR | Use rehype-sanitize, no rehype-raw |
| File Upload | Blob transfer through service worker unreliable | CRITICAL | Upload from popup/offscreen, not via SW message passing |
| File Upload | API key exposed in content script network tab | MODERATE | Route through popup or offscreen document |
| Cost Tracking | No usage data in streaming mode | MODERATE | Add stream_options to request, parse usage from final chunk |
| Cost Tracking | Store bloat from unbounded history | CRITICAL | Store history in IndexedDB, only summary in Zustand |
| Cost Tracking | Chart.js CSP/Shadow DOM conflicts | MODERATE | Use SVG-based charting (recharts) or custom SVG |
| Cost Tracking | Stale pricing data | MINOR | Configurable prices, show last-updated date |
| Text Selection Tooltip | getSelection fails inside Shadow DOM | MODERATE | Use shadowRoot.getSelection(), position relative to overlay |
| Transcript Editing | Cursor jump and state desync with contentEditable | MODERATE | Use controlled textarea on edit click, not contentEditable |
| Transcript Editing | Auto-scroll conflicts with editing | MINOR | Disable auto-scroll during edit mode |
| Store Migration | No version strategy for persisted state | MODERATE | Add version number and migrate function now |

---

## Integration Pitfalls (Features Interacting With Each Other)

### Reasoning Models + Cost Tracking
Reasoning models generate hidden reasoning tokens that are billed but not visible in the response text. If cost tracking only counts visible tokens (`completion_tokens`), it will massively underreport costs for reasoning models. The `completion_tokens_details.reasoning_tokens` field must be parsed and included in cost calculations. A single o3 request can consume 50,000+ reasoning tokens at $10-$60/million tokens -- users MUST see this cost before it surprises them on their OpenAI bill.

### Markdown Rendering + Text Selection Tooltip
If the response is rendered as markdown with rich elements (code blocks, lists, headers), text selection behavior changes. Selecting across a code block and surrounding text produces a range that spans multiple block-level elements. The tooltip positioning must handle multi-line selections where `getBoundingClientRect()` returns a rect spanning the full width. Consider positioning the tooltip at the end of the selection (last line) rather than the center of the bounding rect.

### File Upload + Reasoning Models (Resume Personalization)
The primary use case for file upload is resume/job description personalization -- the uploaded file provides context for LLM prompts. If the user selects a reasoning model, the combined prompt (system prompt + file content + transcript + question) may be very large. Reasoning models have high context limits but also high per-token costs. A 10-page resume (5000 tokens) + full transcript (2000 tokens) + system prompt (500 tokens) = 7500 input tokens per request. With reasoning models at $15/million input tokens, that is ~$0.11 per request just for input -- before reasoning and output tokens.

### Transcript Editing + Cost Tracking
If a user edits a transcript entry and then triggers a new LLM request, the edited transcript is used as context. This is the correct behavior. But cost tracking should attribute the request to the original template/model, not create confusion about why "the same question" costs differently after an edit (because edited transcripts change the prompt token count).

### File Upload + Store Migration
Uploaded file IDs must be stored persistently so the user does not need to re-upload on every session. This means the store gains a new `uploadedFiles` field. The store migration must handle the case where this field does not exist in v1.1 persisted state. Additionally, file IDs can become invalid (OpenAI deletes files after a period) -- the migration should NOT assume stored file IDs are valid.

### All Features + Overlay Size
Every v2.0 feature adds UI elements to the overlay: markdown requires more vertical space for formatted content, cost tracking adds a summary bar or panel, file upload adds a file indicator/button, transcript editing adds edit controls, text selection adds a floating tooltip. The overlay must grow to accommodate all of these without becoming unwieldy. Consider a progressive disclosure design: core features visible by default, secondary features (cost details, file management) behind expandable sections.

---

## Sources

**Official Documentation:**
- [Reasoning models guide (OpenAI)](https://platform.openai.com/docs/guides/reasoning)
- [Chat Completions API reference (OpenAI)](https://platform.openai.com/docs/api-reference/chat)
- [Files API reference (OpenAI)](https://platform.openai.com/docs/api-reference/files)
- [Streaming API responses (OpenAI)](https://platform.openai.com/docs/guides/streaming-responses)
- [Extension service worker lifecycle (Chrome)](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle)
- [chrome.storage API (Chrome)](https://developer.chrome.com/docs/extensions/reference/api/storage)
- [Manifest CSP (Chrome)](https://developer.chrome.com/docs/extensions/reference/manifest/content-security-policy)
- [Persisting store data (Zustand)](https://zustand.docs.pmnd.rs/integrations/persisting-store-data)

**Community / Technical Reports:**
- [O4-mini empty responses (OpenAI Community)](https://community.openai.com/t/o4-mini-returns-empty-response-because-reasoning-token-used-all-the-completion-token/1359002)
- [Chart.js CSP issue #5208](https://github.com/chartjs/Chart.js/issues/5208)
- [Chart.js canvas style attribute CSP issue #8108](https://github.com/chartjs/Chart.js/issues/8108)
- [Shadow DOM Selection API explainer](https://github.com/mfreed7/shadow-dom-selection)
- [Shadow selection polyfill (Google Chrome Labs)](https://github.com/GoogleChromeLabs/shadow-selection-polyfill)
- [react-contenteditable (npm)](https://www.npmjs.com/package/react-contenteditable)
- [CSS Shadow DOM pitfalls (PixelFreeStudio)](https://blog.pixelfreestudio.com/css-shadow-dom-pitfalls-styling-web-components-correctly/)
- [Shadow DOM style encapsulation (CSS-Tricks)](https://css-tricks.com/encapsulating-style-and-structure-with-shadow-dom/)
- [Zustand store migration (DEV Community)](https://dev.to/diballesteros/how-to-migrate-zustand-local-storage-store-to-a-new-version-njp)
- [State Storage in Chrome Extensions (HackerNoon)](https://hackernoon.com/state-storage-in-chrome-extensions-options-limits-and-best-practices)
- [Reasoning models do not support temperature/top_p (OpenAI Community)](https://community.openai.com/t/why-is-the-temperature-and-top-p-of-o1-models-fixed-to-1-not-0/938922)
- [LibreChat reasoning model parameter bug (GitHub)](https://github.com/danny-avila/LibreChat/issues/10737)
