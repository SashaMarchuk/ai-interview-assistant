# Roadmap: AI Interview Assistant

## Milestones

- ✅ **v1.0 MVP** - Phases 1-8 (shipped 2026-02-03)
- ✅ **v1.1 Security & Reliability** - Phases 9-14 (shipped 2026-02-09)
- 🚧 **v2.0 Enhanced Experience** - Phases 15-21 (in progress)

## Phases

<details>
<summary>✅ v1.0 MVP (Phases 1-8) - SHIPPED 2026-02-03</summary>

8 phases, 30 plans, 48 requirements delivered.
See MILESTONES.md for details.

</details>

<details>
<summary>✅ v1.1 Security & Reliability (Phases 9-14) - SHIPPED 2026-02-09</summary>

6 phases, 7 plans, 7 requirements delivered.

- [x] **Phase 9: Security Foundation** - Remove API keys from messages + store race condition fix
- [x] **Phase 10: Encryption Layer** - AES-GCM encryption for API keys at rest
- [x] **Phase 11: Transcript Resilience** - Persistent transcript buffer across SW restarts
- [x] **Phase 12: Circuit Breaker** - Graceful API failure handling with auto-recovery
- [x] **Phase 13: Compliance UI** - Privacy policy, consent modals, recording warnings
- [x] **Phase 14: Linter & Prettier** - ESLint 9 + Prettier, format entire codebase

</details>

### 🚧 v2.0 Enhanced Experience (In Progress)

**Milestone Goal:** Transform from a basic transcription+LLM tool into a personalized, intelligent interview companion with rich formatting, reasoning models, cost visibility, file context, and transcript editing.

**Phase Numbering:**
- Integer phases (15-21): Planned milestone work
- Decimal phases (e.g., 16.1): Urgent insertions (marked with INSERTED)

**Parallelization Map:**
```
Phase 15 (Markdown) ──┐
                       ├── parallel ──► Phase 17 (Cost Capture)
Phase 16 (Reasoning) ──┘                      │
                                               ▼
                              ┌── Phase 18 (Cost Dashboard) ──┐
                              │                                │
                              ├── Phase 19 (File Personal.) ──├── all complete ──► Phase 21 (Text Selection)
                              │                                │
                              └── Phase 20 (Transcript Edit) ─┘
```

- [x] **Phase 15: Markdown Rendering** - Rich formatting for LLM responses inside Shadow DOM overlay
- [ ] **Phase 16: Reasoning Models** - o-series and GPT-5 model support with reasoning controls
- [ ] **Phase 17: Cost Tracking Capture** - Token usage extraction, per-request cost display, session totals
- [ ] **Phase 18: Cost Dashboard** - IndexedDB persistence and popup charts with historical usage
- [ ] **Phase 19: File Personalization** - Resume/JD upload, client-side extraction, LLM prompt injection
- [ ] **Phase 20: Transcript Editing** - Inline edit, soft delete, undo, and LLM context integration
- [ ] **Phase 21: Enhanced Text Selection** - Floating tooltip with quick prompts on transcript selection

## Phase Details

### Phase 15: Markdown Rendering
**Goal**: LLM responses display as properly formatted Markdown with code blocks, syntax highlighting, and copy-to-clipboard -- all working correctly inside the Shadow DOM overlay
**Depends on**: Nothing (first phase of v2.0, zero dependencies on other v2.0 features)
**Requirements**: MD-01, MD-02, MD-03, MD-04
**Parallel**: Can run simultaneously with Phase 16 (Reasoning Models) -- different files, no overlap
**Success Criteria** (what must be TRUE):
  1. LLM response text with headers, bold, italic, and lists renders as formatted HTML in the overlay (not raw Markdown syntax)
  2. Code blocks in LLM responses display with syntax highlighting, a language label in the corner, and a copy button that copies code to clipboard
  3. Streaming responses render incrementally as Markdown without visible flicker, reparse lag, or layout jumps
  4. All Markdown styling works correctly inside the Shadow DOM overlay on a Google Meet page (no style leakage in or out)
**Plans**: 2 plans

Plans:
- [ ] 15-01-PLAN.md — Markdown component system (MarkdownRenderer, CodeBlock, MemoizedMarkdown, highlight.js CSS)
- [ ] 15-02-PLAN.md — ResponsePanel integration and token batching for streaming performance

### Phase 16: Reasoning Models
**Goal**: Users can access o-series reasoning models and GPT-5 series with proper API parameter handling, dedicated reasoning button, and token budget management
**Depends on**: Nothing (independent from Markdown; parallel with Phase 15)
**Requirements**: RSN-01, RSN-02, RSN-03, RSN-04, RSN-05, RSN-06
**Parallel**: Can run simultaneously with Phase 15 (Markdown Rendering) -- different files, no overlap
**Success Criteria** (what must be TRUE):
  1. User can select o3-mini, o4-mini, and GPT-5 series models from the model picker in both fast and full model dropdowns
  2. Selecting a reasoning model and sending a question produces a valid response (no empty responses from insufficient token budget)
  3. User can set reasoning_effort to low, medium, or high before sending a request, and the setting affects response depth
  4. A dedicated "Reasoning" button in the overlay triggers a reasoning model request with a visible thinking/processing indicator
  5. Reasoning model requests use correct API parameters (developer role instead of system, max_completion_tokens >= 25K, reasoning_effort field)
**Plans**: 3 plans

Plans:
- [ ] 16-01-PLAN.md -- Provider & types foundation (model lists, isReasoningModel utility, request body construction, store setting)
- [ ] 16-02-PLAN.md -- Message types & background handler (single-stream reasoning mode, 25K budget, reasoningEffort passthrough)
- [ ] 16-03-PLAN.md -- Reasoning UI (reasoning button, effort selector, thinking indicator, ModelSettings grouping)

### Phase 17: Cost Tracking Capture
**Goal**: Every LLM request captures token usage and calculates cost, displayed per-request in the overlay and as a running session total
**Depends on**: Phase 15 + Phase 16 (needs reasoning token awareness from Phase 16; benefits from Markdown rendering in Phase 15 for formatted cost display area)
**Requirements**: COST-01, COST-02, COST-03
**Success Criteria** (what must be TRUE):
  1. After each LLM response completes, the overlay shows the cost (e.g., "$0.003") next to that response
  2. Token counts (prompt tokens, completion tokens, reasoning tokens when applicable) are extracted from streaming response metadata
  3. A running session cost total is visible in the overlay during an active interview session
**Plans**: TBD

Plans:
- [ ] 17-01: TBD

### Phase 18: Cost Dashboard
**Goal**: Historical cost data is persisted to IndexedDB and visualized in a popup dashboard with per-provider and per-session charts
**Depends on**: Phase 17 (cost capture data must exist before dashboard can display it)
**Requirements**: COST-04, COST-05
**Parallel**: Can run simultaneously with Phase 19 (File Personalization) and Phase 20 (Transcript Editing) -- different files and UI contexts
**Success Criteria** (what must be TRUE):
  1. Cost records persist across browser restarts in IndexedDB with per-provider breakdown (OpenRouter vs OpenAI, per-model)
  2. Opening the popup settings shows a cost dashboard tab with charts showing usage over time, per-provider breakdown, and per-session costs
  3. Charts render correctly using recharts (SVG-based, no CSP issues) and load only in the popup context (not in the overlay)
**Plans**: TBD

Plans:
- [ ] 18-01: TBD
- [ ] 18-02: TBD

### Phase 19: File Personalization
**Goal**: Users can upload resume and job description files that are automatically injected into LLM prompts for personalized interview assistance
**Depends on**: Phase 17 (IndexedDB patterns established; no hard file dependency but benefits from markdown rendering for formatted file-aware responses)
**Requirements**: FILE-01, FILE-02, FILE-03, FILE-04
**Parallel**: Can run simultaneously with Phase 18 (Cost Dashboard) and Phase 20 (Transcript Editing) -- modifies popup settings and PromptBuilder, no overlap
**Success Criteria** (what must be TRUE):
  1. User can upload a PDF or TXT resume file via a file picker in popup settings, and the extracted text content is shown as a preview
  2. User can paste or upload a job description via popup settings
  3. Uploaded file content is stored in IndexedDB (not Zustand) and persists across browser restarts
  4. When resume and/or JD are uploaded, LLM responses demonstrate awareness of the user's background and the target role (file context is injected into prompts via PromptBuilder)
**Plans**: TBD

Plans:
- [ ] 19-01: TBD
- [ ] 19-02: TBD

### Phase 20: Transcript Editing
**Goal**: Users can correct transcription errors inline, hide irrelevant entries, and undo changes -- with edits flowing into subsequent LLM context
**Depends on**: Phase 17 (no hard dependency on cost capture, but sequential after cost capture to avoid TranscriptPanel conflicts; the real constraint is finishing before Phase 21)
**Requirements**: EDIT-01, EDIT-02, EDIT-03, EDIT-04
**Parallel**: Can run simultaneously with Phase 18 (Cost Dashboard) and Phase 19 (File Personalization) -- modifies TranscriptPanel only, no overlap with popup/cost/file features
**Success Criteria** (what must be TRUE):
  1. Double-clicking a transcript entry enables inline editing; pressing Enter saves the edit and Escape cancels it
  2. User can soft-delete a transcript entry (it disappears from the visible list and is excluded from LLM context)
  3. After editing a transcript entry, subsequent LLM requests use the edited text instead of the original transcription
  4. User can undo any edit or soft-delete to restore the original transcript text
**Plans**: TBD

Plans:
- [ ] 20-01: TBD

### Phase 21: Enhanced Text Selection
**Goal**: Selecting transcript text shows a floating tooltip with quick prompt actions that send selected text to the LLM
**Depends on**: Phase 20 (both modify TranscriptPanel; transcript editing must be stable before adding selection behaviors on top)
**Requirements**: SEL-01, SEL-02, SEL-03
**Success Criteria** (what must be TRUE):
  1. Selecting text in the transcript panel causes a floating tooltip to appear near the selection with action buttons
  2. Clicking a quick prompt button (e.g., "Explain", "Elaborate", "Correct") sends the selected text plus the chosen prompt to the LLM and displays the response
  3. User can customize which quick prompt actions appear in the tooltip via popup settings
**Plans**: TBD

Plans:
- [ ] 21-01: TBD
- [ ] 21-02: TBD

## Progress

**Execution Order:**
Phases 15 + 16 run in parallel. Then Phase 17 sequential. Then Phases 18 + 19 + 20 in parallel. Then Phase 21 sequential.

**Parallelization Note:** User prefers running independent phases in parallel via separate Claude terminals on separate branches. See parallelization map above for which phases can safely run simultaneously.

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 15. Markdown Rendering | v2.0 | 2/2 | ✓ Complete | 2026-02-09 |
| 16. Reasoning Models | v2.0 | 0/TBD | Not started | - |
| 17. Cost Tracking Capture | v2.0 | 0/TBD | Not started | - |
| 18. Cost Dashboard | v2.0 | 0/TBD | Not started | - |
| 19. File Personalization | v2.0 | 0/TBD | Not started | - |
| 20. Transcript Editing | v2.0 | 0/TBD | Not started | - |
| 21. Enhanced Text Selection | v2.0 | 0/TBD | Not started | - |
