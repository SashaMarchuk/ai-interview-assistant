# Post-Milestone Polish Orchestrator

**Purpose:** Systematic code optimization, review, and fixes after milestone completion.

**When to use:** Run `/polish-milestone` after completing a milestone to ensure code quality.

---

## CRITICAL: Sequential Execution

**DO NOT run agents in parallel.** Each phase must complete before the next begins to avoid merge conflicts.

```
Step 1        Step 2         Step 3           Step 4        Step 5         Step 6
┌───────────┐ ┌────────────┐ ┌──────────────┐ ┌───────────┐ ┌────────────┐ ┌───────────┐
│Performance│→│Type Safety │→│Simplification│→│  Cleanup  │→│Code Review │→│   Fixes   │
└───────────┘ └────────────┘ └──────────────┘ └───────────┘ └────────────┘ └───────────┘
```

---

## Execution Steps

### Step 1: Performance Optimization

```
subagent_type: general-purpose
prompt: |
  Analyze and optimize the codebase for performance.

  Project context: Chrome MV3 extension with real-time audio processing and LLM streaming.

  Focus areas:
  - src/services/transcription/ (AudioBuffer, WebSocket handling)
  - src/services/llm/ (streaming, API calls)
  - src/overlay/ (React components, re-renders)
  - entrypoints/background.ts (message handling)

  Tasks:
  1. Identify unnecessary re-renders in React components
  2. Find unoptimized loops or data transformations
  3. Check for memory leaks (event listeners, subscriptions)
  4. Optimize async/await chains
  5. Review debounce/throttle usage

  Make targeted optimizations. DO NOT over-engineer.
  Preserve all existing functionality.

  After changes, commit with message: "perf: [description]"

  Output: List of performance improvements made.
```

**Wait for completion before proceeding.**

---

### Step 2: Type Safety

```
subagent_type: general-purpose
prompt: |
  Strengthen TypeScript type safety across the codebase.

  Focus areas:
  - src/types/ (core type definitions)
  - src/services/ (API types, responses)
  - src/store/ (state types)
  - All files with 'any' types or type assertions

  Tasks:
  1. Replace 'any' types with proper types
  2. Add missing type annotations to functions
  3. Strengthen generic types where appropriate
  4. Ensure interface consistency
  5. Add type guards where needed

  DO NOT add unnecessary complexity. Types should help, not hinder.

  After changes, commit with message: "types: [description]"

  Output: List of type improvements made.
```

**Wait for completion before proceeding.**

---

### Step 3: Code Simplification

```
subagent_type: code-simplifier
prompt: |
  Analyze and simplify the codebase for clarity, consistency, and maintainability.

  Focus areas:
  - entrypoints/ (background.ts, content.tsx, popup/, offscreen/)
  - src/services/
  - src/components/
  - src/overlay/

  Tasks:
  1. Identify overly complex functions (>30 lines)
  2. Find duplicated logic that could be consolidated
  3. Simplify nested conditionals and callbacks
  4. Improve naming clarity
  5. Consolidate similar patterns

  DO NOT break existing functionality. All changes must preserve behavior.

  After changes, commit with message: "refactor: simplify [description]"

  Output: List of files changed with brief explanation.
```

**Wait for completion before proceeding.**

---

### Step 4: Dead Code & Cleanup

```
subagent_type: general-purpose
prompt: |
  Identify and remove dead code, unused imports, and unnecessary artifacts.

  Scan all directories:
  - entrypoints/
  - src/

  Tasks:
  1. Find unused exports and functions
  2. Remove unused imports
  3. Delete commented-out code blocks
  4. Remove console.log statements (except error handling)
  5. Clean up unused variables
  6. Verify no orphaned files

  BE CAREFUL: Verify code is truly unused before removing.
  When in doubt, leave it in.

  After changes, commit with message: "chore: cleanup [description]"

  Output: List of removed items with verification notes.
```

**Wait for completion before proceeding.**

---

### Step 5: Code Review

```
subagent_type: general-purpose
prompt: |
  Perform comprehensive code review of the entire codebase.

  Review checklist:

  ## Architecture & Design
  - [ ] Separation of concerns
  - [ ] Consistent patterns across modules
  - [ ] Appropriate abstraction levels
  - [ ] No circular dependencies

  ## Code Quality
  - [ ] Clear, readable code
  - [ ] Consistent naming conventions
  - [ ] Proper error handling
  - [ ] No magic numbers/strings

  ## Chrome Extension Specific
  - [ ] Proper message passing patterns
  - [ ] Correct use of chrome.* APIs
  - [ ] Manifest permissions minimal
  - [ ] Service worker lifecycle handled

  ## React & State
  - [ ] Proper hook usage
  - [ ] No prop drilling
  - [ ] Memoization where needed
  - [ ] Clean component structure

  ## TypeScript
  - [ ] Strong typing throughout
  - [ ] No implicit any
  - [ ] Consistent interfaces

  ## Security
  - [ ] No exposed secrets
  - [ ] Input validation
  - [ ] XSS prevention

  Create .planning/POLISH-REVIEW.md using template from .planning/templates/POLISH-REVIEW-TEMPLATE.md

  Output: Summary of findings categorized by severity.
```

**Wait for completion before proceeding.**

---

### Step 6: Fix Review Issues

```
subagent_type: general-purpose
prompt: |
  Fix issues identified in .planning/POLISH-REVIEW.md

  Priority order:
  1. Critical issues (security, bugs, breaking problems)
  2. Important improvements (code quality, maintainability)
  3. Minor suggestions (only if quick wins)

  For each fix:
  1. Understand the issue fully
  2. Make minimal targeted change
  3. Verify no regression
  4. Update POLISH-REVIEW.md with resolution status

  After all fixes, commit with message: "fix: resolve review issues"

  DO NOT:
  - Make unrelated changes
  - Over-engineer solutions
  - Break existing functionality
```

---

## Output Artifacts

After completion:
1. `.planning/POLISH-REVIEW.md` - Review findings and resolution status
2. Git commits for each step (perf, types, refactor, chore, fix)

---

## GSD Integration

```
/gsd:complete-milestone → /polish-milestone → /gsd:new-milestone
```

Run after each milestone completion to maintain code quality.
