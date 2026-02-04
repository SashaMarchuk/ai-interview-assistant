# Claude Code Project Instructions

## Project Overview

AI Interview Assistant - Chrome MV3 extension with real-time transcription and LLM assistance.

## Critical Rules

### Polish Milestone Workflow

**ALWAYS SEQUENTIAL, NEVER PARALLEL**

The `/polish-milestone` command must execute steps one-by-one:

```
1. Performance → 2. Type Safety → 3. Simplification → 4. Cleanup → 5. Code Review → 6. Fixes
```

**Why:** Parallel execution causes merge conflicts between agents modifying the same files.

Each step must:
1. Complete fully
2. Commit changes
3. Only then proceed to next step

### GSD Workflow Integration

```
/gsd:complete-milestone → /polish-milestone → /gsd:new-milestone
```

Run `/polish-milestone` after every milestone completion.

## Custom Commands

| Command | Purpose |
|---------|---------|
| `/polish-milestone` | Full sequential optimization + review + fixes |

## Tech Stack

- WXT 0.19.x (Chrome MV3 framework)
- React 18
- Tailwind v4
- Zustand + webext-zustand
- TypeScript strict mode

## Key Directories

```
entrypoints/     # Extension entry points (background, content, popup, offscreen)
src/services/    # Core services (LLM, transcription)
src/components/  # React components
src/overlay/     # Floating overlay UI
src/store/       # Zustand state management
src/types/       # TypeScript definitions
```
