---
phase: 14-linter-prettier
plan: 01
subsystem: dx
tags: [eslint, prettier, tailwindcss, typescript-eslint, react-hooks, claude-code-hooks, formatting]

# Dependency graph
requires:
  - phase: 13-compliance-ui
    provides: all source code finalized before formatting pass
provides:
  - ESLint 9 flat config with typescript-eslint, react-hooks, WXT auto-imports, browser+webextensions globals, prettier override
  - Prettier config with Tailwind v4 class sorting via tailwindStylesheet
  - Claude Code PostToolUse hook for auto-format on Edit/Write
  - Zero-error lint + fully formatted codebase
  - npm scripts lint, lint:fix, format, format:check
affects: [all-phases, polish-milestone]

# Tech tracking
tech-stack:
  added: [eslint@9.39.2, "@eslint/js@9.39.2", typescript-eslint@8.54.0, globals@17.3.0, eslint-config-prettier@10.1.8, eslint-plugin-react-hooks@7.0.1, prettier@3.8.1, prettier-plugin-tailwindcss@0.7.2]
  patterns: [eslint-flat-config, prettier-tailwind-v4-stylesheet, claude-code-post-tool-use-hook, underscore-prefix-unused-vars]

key-files:
  created: [eslint.config.mjs, .prettierrc.json, .prettierignore, .claude/settings.json]
  modified: [package.json, wxt.config.ts, entrypoints/background.ts, entrypoints/content.tsx, src/overlay/Overlay.tsx, src/services/transcription/ElevenLabsConnection.ts, src/components/templates/TemplateEditor.tsx, src/components/settings/HotkeySettings.tsx]

key-decisions:
  - "ESLint 9 instead of ESLint 10 -- eslint-plugin-react-hooks only supports ^9, all other plugins compatible"
  - "underscore prefix pattern for intentionally unused params (argsIgnorePattern: ^_)"
  - "Overlay health issues refactored: API key issues moved from useEffect+setState to useMemo (proper derived state pattern)"
  - "Block-level eslint-disable for multi-line patterns (set-state-in-effect, exhaustive-deps) where inline disable doesn't reach"

patterns-established:
  - "Flat ESLint config: eslint.config.mjs with defineConfig from eslint/config"
  - "Prettier + Tailwind v4: tailwindStylesheet pointing to app.css for correct class sorting"
  - "Claude Code auto-format: PostToolUse hook runs prettier --write then eslint --fix on every Edit/Write"
  - "WXT auto-imports: eslintrc.enabled: 9 in wxt.config.ts generates .wxt/eslint-auto-imports.mjs"

# Metrics
duration: 9min
completed: 2026-02-09
---

# Phase 14 Plan 01: ESLint + Prettier Summary

**ESLint 9 flat config + Prettier with Tailwind v4 class sorting across 46 files, all lint errors resolved, Claude Code auto-format hook**

## Performance

- **Duration:** 9 min
- **Started:** 2026-02-09T01:51:27Z
- **Completed:** 2026-02-09T02:00:44Z
- **Tasks:** 2
- **Files modified:** 46

## Accomplishments

- ESLint 9 flat config with typescript-eslint recommended, react-hooks, browser+webextensions globals, WXT auto-imports, eslint-config-prettier override
- Prettier config with Tailwind v4 class sorting via tailwindStylesheet pointing to app.css
- All 57+ TS/TSX/CSS files formatted and lint-clean -- `npx eslint .` and `npx prettier --check` both exit 0
- Claude Code PostToolUse hook auto-runs prettier + eslint on every Edit/Write
- Refactored Overlay.tsx health state from useEffect+setState anti-pattern to proper useMemo derived state
- WXT auto-imports ESLint integration enabled (eslintrc.enabled: 9 generates .wxt/eslint-auto-imports.mjs)
- Build verified: `npx wxt build` succeeds with zero regressions

## Task Commits

Each task was committed atomically:

1. **Task 1: Install packages and create all configuration files** - `99f37d4` (chore)
2. **Task 2: Format codebase, fix all lint errors, and create Claude Code hook** - `961e732` (feat)

## Files Created/Modified

**Created:**
- `eslint.config.mjs` - ESLint 9 flat config with typescript-eslint, react-hooks, globals, WXT auto-imports, prettier override
- `.prettierrc.json` - Prettier config with Tailwind v4 class sorting via tailwindStylesheet
- `.prettierignore` - Ignore list for generated/vendor files (node_modules, .output, .wxt, .planning)
- `.claude/settings.json` - PostToolUse hook for auto-format on Edit/Write

**Modified:**
- `package.json` - Added 8 devDependencies + 4 npm scripts (lint, lint:fix, format, format:check)
- `wxt.config.ts` - Added imports.eslintrc.enabled: 9, eslint-disable for Tailwind plugin type cast
- `entrypoints/background.ts` - Removed 3 unused imports, prefixed unused params, fixed catch block
- `entrypoints/content.tsx` - Prefixed unused param, block eslint-disable for selective deps
- `src/overlay/Overlay.tsx` - Refactored health issues to useMemo, removed dead `filtered` variable
- `src/services/transcription/ElevenLabsConnection.ts` - Added braces to case blocks with lexical declarations
- `src/components/templates/TemplateEditor.tsx` - Block eslint-disable for form sync pattern
- `src/components/settings/HotkeySettings.tsx` - Removed unused CaptureMode import
- 34 additional files reformatted by Prettier (whitespace/formatting only)

## Decisions Made

1. **ESLint 9 instead of ESLint 10** - eslint-plugin-react-hooks@7.0.1 peer-requires eslint ^9, and ESLint 10 is brand new. ESLint 9 supports flat config identically. All features from plan achieved.
2. **Underscore prefix for unused params** - Configured `@typescript-eslint/no-unused-vars` with `argsIgnorePattern: "^_"` instead of removing params that may be needed for type signatures.
3. **useMemo for API key health issues** - The plan's useEffect+setState pattern for derived state triggered react-hooks/set-state-in-effect. Refactored to useMemo which is the correct React pattern for derived state.
4. **Block eslint-disable for multi-line patterns** - `eslint-disable-next-line` only covers the next line; for rules that report on inner lines (set-state-in-effect, exhaustive-deps), block `/* eslint-disable */.../* eslint-enable */` is required.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] ESLint 9 instead of ESLint 10**
- **Found during:** Task 1 (package installation)
- **Issue:** eslint-plugin-react-hooks@7.0.1 has peerDependency eslint "^3 || ^4 || ^5 || ^6 || ^7 || ^8 || ^9" -- does not include ^10. npm ERESOLVE conflict.
- **Fix:** Pinned eslint@^9.39.0 and @eslint/js@^9.39.0. All flat config features identical.
- **Files modified:** package.json, package-lock.json
- **Verification:** All packages install cleanly, ESLint config loads, lint passes
- **Committed in:** 99f37d4 (Task 1 commit)

**2. [Rule 1 - Bug] Removed dead `filtered` variable in Overlay.tsx**
- **Found during:** Task 2 (ESLint error: no-unused-vars on `filtered`)
- **Issue:** `filtered` variable computed but never used in connection state handler; `apiKeyIssues` was used instead
- **Fix:** Removed dead variable. Logic already correct without it.
- **Files modified:** src/overlay/Overlay.tsx
- **Committed in:** 961e732 (Task 2 commit)

**3. [Rule 1 - Bug] Refactored health issues from useEffect+setState to useMemo**
- **Found during:** Task 2 (ESLint error: react-hooks/set-state-in-effect)
- **Issue:** API key health issues were computed in useEffect and set via setState -- an anti-pattern for derived state
- **Fix:** Converted to useMemo for API key issues, kept setState only for event-driven connection issues, merged at render time
- **Files modified:** src/overlay/Overlay.tsx
- **Committed in:** 961e732 (Task 2 commit)

---

**Total deviations:** 3 auto-fixed (1 blocking, 2 bugs)
**Impact on plan:** All auto-fixes necessary for correctness. ESLint 9 vs 10 is a version pin with no feature difference. Health state refactor is a genuine improvement. No scope creep.

## Issues Encountered

- eslint-disable-next-line placement did not work for react-hooks/set-state-in-effect and exhaustive-deps rules because these report on inner lines of the effect, not the useEffect call itself. Resolved by using block-level eslint-disable/enable comments.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Codebase is fully lint-clean and formatted
- Claude Code auto-format hook will maintain formatting during future sessions
- Ready for /polish-milestone and /gsd:complete-milestone

---
*Phase: 14-linter-prettier*
*Completed: 2026-02-09*
