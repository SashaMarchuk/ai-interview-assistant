# Claude Code Project Instructions

## Project Overview

AI Interview Assistant - Chrome MV3 extension with real-time transcription and LLM assistance.

## Critical Rules

### Rule Synchronization

**All new rules must be recorded in BOTH places:**
1. `CLAUDE.md` (this file)
2. `.planning/config.json` (GSD system)

Never add a rule to only one location.

### Git Workflow

**NEVER merge directly to main.** Always create a Pull Request.

```bash
# After completing work on a branch:
git push -u origin <branch-name>
gh pr create --title "..." --body "..."
```

User reviews and merges PRs manually.

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

### Phase Parallelization

**Prefer parallel execution** of independent phases via separate Claude Code terminals on separate branches. When phases have no shared file dependencies, run them simultaneously.

Example for v1.1: After Phase 10 (Encryption) completes, Phases 11, 12, 13 can run in parallel — each in its own terminal and branch.

**Exception:** `/polish-milestone` steps are always sequential (shared files).

### GSD Workflow Integration

```
/gsd:complete-milestone → /polish-milestone → /gsd:new-milestone
```

Run `/polish-milestone` after every milestone completion.

### GSD Todo Management

**Supporting both CLI and Web UI usage.**

#### Adding Todos (Universal Prompts)

Users can request features in **plain language** without slash commands:

```
"Хочу додати експорт історії сесій"
"Need to add Whisper STT support"
"Add dark mode toggle to settings"
"Треба виправити баг з hotkey в Firefox"
```

Claude will:
1. Detect feature/bug request in conversation
2. Call `/gsd:add-todo` automatically
3. Extract context from discussion
4. Create structured todo file in `.planning/todos/pending/`

#### Todo Structure

```markdown
---
created: 2026-02-07
title: Add session history export
area: feature|bug|refactor|docs|test
files:
  - path/to/related/file.ts
---

## Problem
[User's need or issue description]

## Solution
[Proposed approach or implementation idea]
```

#### Checking Todos

**Raw prompt:** "Покажи всі pending todos" або "What todos do we have?"

**CLI command:** `/gsd:check-todos` (if available)

Both trigger the same workflow:
- List pending todos with age and area
- Allow selection and context loading
- Route to execution or planning

#### Working on Todos

**Raw prompt:** "Почнемо працювати над [todo description]"

Claude will:
1. Find matching todo in `.planning/todos/pending/`
2. Move to `.planning/todos/done/`
3. Load full context (problem + solution + files)
4. Begin implementation

#### Areas (Categories)

- `feature` — New functionality
- `bug` — Bug fixes
- `refactor` — Code improvements
- `docs` — Documentation
- `test` — Testing
- `ui` — UI/UX changes
- `api` — API/backend work
- `config` — Configuration

#### Future-Proof Design

This workflow follows GSD's core pattern:
- **Capture ideas during work** (not lose context)
- **Store as structured markdown** (`.planning/todos/`)
- **Route to appropriate action** (plan → execute → verify)

Even if GSD updates, the principle remains:
1. Natural language request → detection
2. Structured storage → `.planning/` directory
3. State tracking → `STATE.md` updates
4. Git workflow → atomic commits

#### Examples

**Adding feature todo:**
```
User: "Хочу щоб можна було експортувати історію розмов в JSON"
Claude: Creates todo → .planning/todos/pending/20260207-export-history.md
```

**Listing todos:**
```
User: "Які у нас є pending todos?"
Claude: Lists all with areas and age → allows selection
```

**Starting work:**
```
User: "Давай зробимо експорт історії"
Claude: Finds matching todo → moves to done/ → starts implementation
```

**Filtering:**
```
User: "Покажи todos по UI"
Claude: Filters area:ui → shows relevant todos only
```

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
