# Research Summary: v2.0 Enhanced Experience

**Domain:** Chrome MV3 Extension -- AI Interview Assistant UX Enhancements
**Researched:** 2026-02-09
**Overall confidence:** HIGH

## Executive Summary

v2.0 transforms the AI Interview Assistant from a functional prototype into a polished, personalized interview tool. The six features -- file personalization, cost tracking, reasoning model support, markdown rendering, enhanced text selection, and transcript editing -- address the most visible user experience gaps while maintaining the extension's lightweight footprint.

The recommended stack adds only three new npm packages: `react-markdown` (~35KB gzip), `remark-gfm` (~3KB gzip), and `recharts` (~120KB gzip). All other v2.0 capabilities are implemented using browser-native APIs (Selection API, IndexedDB, FileReader) and modifications to existing codebase patterns (provider adapters, Zustand slices, custom React hooks). The total overlay bundle growth is approximately 42KB (react-markdown + custom components), while the popup grows by ~122KB (recharts for cost charts, loaded only when the user opens settings).

Critical architectural decisions: (1) File personalization uses client-side text extraction with base64 inline fallback rather than the OpenAI Files API, ensuring cross-provider compatibility and avoiding API stability concerns. (2) Cost tracking stores records in IndexedDB (not Zustand) to avoid webext-zustand sync bloat. (3) Markdown rendering uses react-markdown's custom component overrides with Tailwind classes rather than typography plugins, ensuring Shadow DOM compatibility. (4) Reasoning model support adds `reasoning_effort` control and `developer` message role, with a non-streaming fallback for o3/o4-mini models that require org verification for streaming.

The most significant risk is the OpenAI Chat Completions file input stability -- there was a September 2025 regression. The recommended mitigation is to start with text extraction (HIGH confidence) and layer base64 file inline as an enhancement. All other features use well-established patterns with official documentation.

## Key Findings

**Stack:** Only 3 new packages needed: `react-markdown@^10.1.0`, `remark-gfm@^4.0.0`, `recharts@^3.7.0`. Everything else uses native browser APIs and existing codebase patterns.

**Architecture:** Six features integrate into the existing four-context architecture (background, offscreen, popup, content script) with minimal new message types. File content and cost records go to IndexedDB (not Zustand) to avoid store sync overhead. Markdown rendering and transcript editing modify the content script overlay; cost dashboard and file upload modify the popup.

**Critical pitfall:** Reasoning models consume hidden reasoning tokens from the `max_completion_tokens` budget. With the current 2000-token limit for full answers, o3/o4-mini requests will return empty responses. Must set minimum 25,000 tokens for reasoning models and warn users against using reasoning models for fast hints.

## Implications for Roadmap

Based on research, suggested phase structure:

1. **Markdown Rendering** - Highest visual impact, zero dependencies on other features
   - Addresses: FEATURES.md #1 (table stakes)
   - Avoids: PITFALLS.md #3 (Shadow DOM styling) via custom Tailwind component overrides
   - Effort: 1-2 days

2. **Reasoning Model Support** - Completes partial work, unlocks powerful models
   - Addresses: FEATURES.md #5 (reasoning models)
   - Avoids: PITFALLS.md #1 (empty responses), #2 (system message rejection)
   - Effort: 1-1.5 days

3. **Cost Tracking (capture + storage)** - Foundation for dashboard, requires streamSSE changes
   - Addresses: FEATURES.md #3 (per-request tracking)
   - Avoids: PITFALLS.md #6 (store bloat), #10 (missing usage data)
   - Effort: 1.5-2 days

4. **File Personalization** - Defining differentiator, highest user value
   - Addresses: FEATURES.md #4 (resume/JD upload)
   - Avoids: PITFALLS.md #4 (service worker blob issues), #12 (API key exposure)
   - Effort: 2-3 days

5. **Transcript Editing** - Fixes "garbage in, garbage out" for LLM context quality
   - Addresses: FEATURES.md #7 (inline editing)
   - Avoids: PITFALLS.md #9 (contentEditable desync), #15 (auto-scroll conflict)
   - Effort: 1-1.5 days

6. **Enhanced Text Selection** - Polish feature, must follow transcript editing
   - Addresses: FEATURES.md #2 (floating tooltip)
   - Avoids: PITFALLS.md #8 (Shadow DOM positioning)
   - Effort: 1.5-2 days

7. **Cost Tracking Dashboard** - Display layer for data captured in Phase 3
   - Addresses: FEATURES.md #6 (charts, historical view)
   - Avoids: PITFALLS.md #5 (Chart.js CSP issues) via SVG-based recharts
   - Effort: 1.5-2 days

**Phase ordering rationale:**
- Markdown rendering first because every subsequent feature produces richer LLM responses that benefit from proper formatting
- Reasoning models early because they affect cost tracking (reasoning tokens) and benefit from markdown rendering
- Cost tracking capture before dashboard because data collection must precede visualization
- File personalization in the middle because it modifies PromptBuilder (affects all subsequent LLM interactions)
- Transcript editing before text selection because both modify TranscriptPanel and must coordinate click/select behaviors
- Cost dashboard last because it is pure display on data already being captured

**Parallelization opportunities:**
- Phases 1 (Markdown) and 2 (Reasoning) are independent and can run in parallel
- Phases 5 (Transcript Editing) and 7 (Cost Dashboard) are independent and can run in parallel
- Phase 3 (Cost Capture) can start as soon as Phase 2 completes (needs reasoning token awareness)

**Research flags for phases:**
- Phase 4 (File Personalization): Likely needs deeper research on OpenAI Chat Completions file input current status. The September 2025 regression may have been resolved or may persist. Test base64 inline early.
- Phase 6 (Text Selection): Needs runtime validation of `window.getSelection()` behavior inside WXT's Shadow DOM on Google Meet pages specifically.
- All other phases: Standard patterns, unlikely to need additional research.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Only 3 new packages, all verified via npm with current versions and active maintenance. react-markdown v10.1.0 confirmed, recharts v3.7.0 confirmed (published 18 days ago). |
| Features | HIGH | Features extracted from milestone context. Complexity estimates validated against actual codebase structure. All features have precedent in Chrome extension ecosystem. |
| Architecture | HIGH | Based on detailed codebase analysis of all 4 execution contexts. Integration points identified in actual source files. Data flow paths verified against existing message system. |
| Pitfalls | HIGH | Critical pitfalls sourced from official OpenAI docs, community reports with actual error reproduction, and codebase-specific analysis (line-level references). |

## Gaps to Address

- **OpenAI Chat Completions file input current status**: The September 2025 regression report needs verification. Test base64 file inline with a current OpenAI API key before committing to that approach. Fallback (text extraction) is HIGH confidence.
- **o3/o4-mini streaming access tiers**: Streaming for these models requires org verification. The extension should handle both streaming and non-streaming modes gracefully. Actual tier requirements may change as models mature.
- **Recharts actual bundle size with Vite tree-shaking**: Sources cite 120-200KB gzip, but Vite's tree-shaking may reduce this significantly if only BarChart, LineChart, and PieChart are imported. Measure actual bundle size after integration.
- **Reasoning token visibility in streaming**: The `delta.reasoning_content` field availability varies by model version and API endpoint (Chat Completions vs Responses API). Test with actual reasoning model requests.

## Sources

### Primary (HIGH confidence)
- [OpenAI Chat Completions API Reference](https://platform.openai.com/docs/api-reference/chat)
- [OpenAI Reasoning Models Guide](https://platform.openai.com/docs/guides/reasoning)
- [OpenAI Models Reference](https://platform.openai.com/docs/models)
- [OpenAI File Inputs Guide](https://platform.openai.com/docs/guides/pdf-files)
- [react-markdown GitHub](https://github.com/remarkjs/react-markdown)
- [recharts GitHub](https://github.com/recharts/recharts)
- [MDN Selection API](https://developer.mozilla.org/en-US/docs/Web/API/Window/getSelection)
- [idb-keyval GitHub](https://github.com/jakearchibald/idb-keyval)
- [Chrome Storage API](https://developer.chrome.com/docs/extensions/reference/api/storage)

### Secondary (MEDIUM confidence)
- [OpenAI o3/o4-mini Announcement](https://openai.com/index/introducing-o3-and-o4-mini/)
- [Chat Completions file regression thread](https://community.openai.com/t/regression-support-for-file-uploads-in-chat-completions/1357818)
- [o3 streaming verification thread](https://community.openai.com/t/need-verification-for-o3-streaming-despite-being-tier-5/1230334)
- [Recharts Bundlephobia](https://bundlephobia.com/package/recharts)
- [react-markdown Bundlephobia](https://bundlephobia.com/package/react-markdown)

---
*Research completed: 2026-02-09*
*Ready for roadmap: yes*
*Synthesized from: STACK.md, FEATURES.md, ARCHITECTURE.md, PITFALLS.md*
