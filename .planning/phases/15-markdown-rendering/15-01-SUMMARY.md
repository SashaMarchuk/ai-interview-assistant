---
phase: 15-markdown-rendering
plan: 01
subsystem: ui
tags: [react-markdown, rehype-highlight, remark-gfm, marked, syntax-highlighting, memoization, shadow-dom]

# Dependency graph
requires:
  - phase: 04-overlay-ui
    provides: Shadow DOM overlay with app.css injection via cssInjectionMode
provides:
  - MarkdownRenderer component with Tailwind component overrides for all markdown elements
  - CodeBlock component with language label, copy-to-clipboard, syntax highlighting
  - MemoizedMarkdown component with block-level memoization for streaming
  - Highlight.js github-dark theme CSS injected into Shadow DOM via app.css
affects: [15-02-integration, response-panel, streaming]

# Tech tracking
tech-stack:
  added: [react-markdown, remark-gfm, rehype-highlight, marked, @types/marked]
  patterns: [tailwind-component-overrides, block-level-memoization, shadow-dom-css-injection]

key-files:
  created:
    - src/components/markdown/CodeBlock.tsx
    - src/components/markdown/MarkdownRenderer.tsx
    - src/components/markdown/MemoizedMarkdown.tsx
  modified:
    - package.json
    - package-lock.json
    - src/assets/app.css

key-decisions:
  - "Used Markdown as default import from react-markdown v10 (named export alias)"
  - "CodeBlock props typed with react-markdown ExtraProps for type compatibility"
  - "highlight.js CSS imported via @import in app.css (Vite resolves node_modules path)"
  - "hljs background overridden to transparent so CodeBlock bg-black/40 controls background"

patterns-established:
  - "Tailwind component overrides: every markdown element mapped to React component with explicit utility classes for Shadow DOM"
  - "Block-level memoization: marked.lexer() splits content, React.memo wraps each block with string comparator"
  - "CSS import chain: highlight.js theme added to app.css for WXT cssInjectionMode bundling"

# Metrics
duration: 5min
completed: 2026-02-09
---

# Phase 15 Plan 01: Markdown Components Summary

**react-markdown with Tailwind component overrides, CodeBlock with copy button and syntax highlighting, MemoizedMarkdown with marked.lexer() block-level memoization for streaming**

## Performance

- **Duration:** 5 min
- **Started:** 2026-02-09T08:05:18Z
- **Completed:** 2026-02-09T08:10:30Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- Installed react-markdown, remark-gfm, rehype-highlight, marked as dependencies
- Created CodeBlock component handling inline code (styled monospace) and block code (language label, copy-to-clipboard button, syntax-highlighted code area with max-height scroll)
- Created MarkdownRenderer wrapping react-markdown with 17 Tailwind component overrides for h1-h3, p, strong, em, ul, ol, li, blockquote, a, hr, table, th, td, pre, code
- Created MemoizedMarkdown splitting content via marked.lexer() and memoizing each block to prevent O(n^2) re-parsing during streaming
- Imported highlight.js github-dark theme CSS into app.css for Shadow DOM injection via WXT cssInjectionMode

## Task Commits

Each task was committed atomically:

1. **Task 1: Install dependencies and create CodeBlock component** - `714c0ce` (feat)
2. **Task 2: Create MarkdownRenderer, MemoizedMarkdown, and highlight.js theme CSS** - `4fda4c0` (feat)

## Files Created/Modified
- `src/components/markdown/CodeBlock.tsx` - Custom code block with inline/block detection, language label, copy-to-clipboard, syntax highlighting container
- `src/components/markdown/MarkdownRenderer.tsx` - react-markdown wrapper with rehype-highlight, remark-gfm, and 17 Tailwind component overrides
- `src/components/markdown/MemoizedMarkdown.tsx` - Block-level memoization wrapper using marked.lexer() for streaming performance
- `src/assets/app.css` - Added highlight.js github-dark theme CSS import and hljs background override
- `package.json` - Added react-markdown, remark-gfm, rehype-highlight, marked, @types/marked
- `package-lock.json` - Lock file updated with 103 new packages

## Decisions Made
- Used `import Markdown from 'react-markdown'` (default export) after discovering v10 exports Markdown as default, not named
- Typed CodeBlock props using `React.HTMLAttributes<HTMLElement> & ExtraProps` from react-markdown for full type compatibility with the `components` prop
- Used `@import 'highlight.js/styles/github-dark.min.css'` in app.css since Vite correctly resolves node_modules CSS paths
- Overrode `.hljs { background: transparent }` so code block background comes from CodeBlock's Tailwind bg-black/40

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed react-markdown import style**
- **Found during:** Task 2 (MarkdownRenderer creation)
- **Issue:** Plan specified `import Markdown from 'react-markdown'` but initial implementation used named import `{ Markdown }` which TypeScript rejected
- **Fix:** Changed to default import `import Markdown from 'react-markdown'` per actual v10 export structure
- **Files modified:** src/components/markdown/MarkdownRenderer.tsx
- **Verification:** `npx tsc --noEmit` passes
- **Committed in:** 4fda4c0 (Task 2 commit)

**2. [Rule 1 - Bug] Fixed CodeBlock props type incompatibility**
- **Found during:** Task 2 (TypeScript verification)
- **Issue:** Custom `CodeBlockProps` interface with required `children` was incompatible with react-markdown's `Components` type which uses `HTMLAttributes<HTMLElement> & ExtraProps`
- **Fix:** Changed CodeBlock props to use `React.ClassAttributes<HTMLElement> & React.HTMLAttributes<HTMLElement> & ExtraProps` from react-markdown
- **Files modified:** src/components/markdown/CodeBlock.tsx
- **Verification:** `npx tsc --noEmit` passes with zero errors
- **Committed in:** 4fda4c0 (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (2 bugs)
**Impact on plan:** Both fixes necessary for TypeScript compilation. No scope creep.

## Issues Encountered
None beyond the type fixes documented as deviations.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All three markdown components are ready for integration
- Plan 15-02 can now wire MemoizedMarkdown into ResponsePanel.tsx
- Highlight.js CSS is already bundled into Shadow DOM CSS output

## Self-Check: PASSED

All 5 files verified present. Both commits (714c0ce, 4fda4c0) verified in git log. TypeScript compiles cleanly. Build succeeds with hljs CSS bundled.

---
*Phase: 15-markdown-rendering*
*Completed: 2026-02-09*
