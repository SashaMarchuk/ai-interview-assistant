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
1. Performance → 2. Type Safety → 3. Simplification → 4. Cleanup → 5. Code Review → 6. Fixes → 7. Milestone PR
```

**Why:** Parallel execution causes merge conflicts between agents modifying the same files.

Each step must:
1. Complete fully
2. Commit changes
3. Only then proceed to next step

**Step 7 - Milestone PR:** After all polish steps complete, create a single consolidated PR to `main` that includes ALL phase changes + polish commits. The PR title should follow: `feat: Milestone vX.Y - [Milestone Name]`. The PR body must list all phases, key features, and a summary of the polish pass.


### Phase Branching & Parallelization

**Prefer parallel execution** of independent phases via separate Claude Code terminals on separate branches. When phases have no shared file dependencies, run them simultaneously.

**Exception:** `/polish-milestone` steps are always sequential (shared files).

#### Branch Naming Conventions

| Type | Pattern | Example |
|------|---------|---------|
| Feature branch | `feature/phase-N-short-name` | `feature/phase-17-cost-capture` |
| Integration branch | `milestone/vX.Y-phase-A-B-C` | `milestone/v2.0-phase-18-19-20` |

#### Determining the Base Branch (Universal Rule)

**Before starting ANY phase**, Claude MUST determine the correct base branch:

1. Read `STATE.md` to understand current project position
2. Run `git branch --sort=-committerdate` to see available branches
3. Find the **latest milestone/integration branch** — this is always the base
4. If no milestone branch exists, the base is `main`

**The base branch is NEVER `main` mid-milestone.** It is always the latest `milestone/*` branch that contains all previously completed and integrated phases.

```bash
# Algorithm (pseudocode):
base = find latest milestone/* branch for current milestone version
if not found:
    base = main
git checkout -b feature/phase-N-short-name $base
```

#### Sequential Phase Flow

When a phase must run alone (no parallelization):

```bash
# 1. Branch from latest milestone/integration branch
git checkout milestone/vX.Y-phase-A-B
git checkout -b feature/phase-N-name

# 2. Do work, commit

# 3. After completion, create new integration branch or merge into existing
git checkout milestone/vX.Y-phase-A-B
git checkout -b milestone/vX.Y-phase-A-B-N   # or reuse existing milestone branch
git merge --no-ff feature/phase-N-name

# 4. Verify
npx tsc --noEmit && npx eslint .
```

**Shortcut:** For a single sequential phase, Claude may merge directly into the existing milestone branch instead of creating a new one, if that branch is the current working integration branch.

#### Parallel Phase Flow

When multiple phases can run simultaneously:

**Step 1 — Fork from same base (each terminal):**
```bash
# Terminal 1:
git checkout -b feature/phase-A-name  milestone/vX.Y-latest

# Terminal 2:
git checkout -b feature/phase-B-name  milestone/vX.Y-latest

# Terminal 3:
git checkout -b feature/phase-C-name  milestone/vX.Y-latest
```

**Step 2 — File ownership.** Each parallel phase should own distinct files. Before starting, verify no two phases will modify the same source files. Shared files (like `background.ts`, `store/index.ts`) must be assigned to ONE phase only — others must wait or coordinate.

**Step 3 — Integration (after ALL parallel phases complete):**

This is a separate step — either run by the user or by a dedicated Claude terminal.

```bash
# Create integration branch from the base all parallel branches forked from
git checkout -b milestone/vX.Y-phase-A-B-C  milestone/vX.Y-latest

# Merge each parallel branch one by one
git merge --no-ff feature/phase-A-name
npx tsc --noEmit && npx eslint .          # verify after each merge

git merge --no-ff feature/phase-B-name    # resolve conflicts if any
npx tsc --noEmit && npx eslint .

git merge --no-ff feature/phase-C-name    # resolve conflicts if any
npx tsc --noEmit && npx eslint .
```

**Step 4 — Continue.** The new `milestone/vX.Y-phase-A-B-C` branch becomes the base for subsequent phases.

#### Conflict Resolution

- The phase that **owns** the file takes priority
- For truly shared files, manually merge keeping both changes
- Always run `npx tsc --noEmit && npx eslint .` after each merge

#### Full Milestone Lifecycle Example

```
main
 └── milestone/vX.Y-phase-A-B          ← after sequential phases A, B
      ├── feature/phase-C  ─┐
      ├── feature/phase-D  ─┤           ← parallel terminals
      └── feature/phase-E  ─┘
           └── milestone/vX.Y-phase-C-D-E   ← integration step
                └── feature/phase-F          ← next sequential phase
                     └── milestone/vX.Y-final
                          └── /polish-milestone → PR to main
```

#### Claude's Pre-Phase Checklist

Every Claude terminal MUST do this before starting a phase:

1. `git branch --sort=-committerdate` — find latest milestone branch
2. `cat .planning/STATE.md` — confirm current project position
3. Verify the base branch contains all prerequisite phases
4. Create feature branch from the correct base
5. If parallel phases are done but not integrated — **integrate first, then start new phase**

### Branch Management

**NEVER delete branches.** All feature and milestone branches must be preserved for history.

- Individual phase branches stay as-is after PR creation
- Use **squash merge** when merging PRs to main (keeps main history clean)
- Branch names are permanent references to the work done in each phase

```bash
# PR merge strategy (user does this in GitHub UI):
# Settings → "Squash and merge" as default merge method
# This keeps individual branch history intact while main stays clean
```

### Manual Testing Instructions

**After every phase completion and after polishing**, Claude MUST send the user a "How to Test" message with:

1. **Build command** (`npm run dev` or `npm run build` + load instructions)
2. **Phase-specific test steps** — concrete actions the user can take in the browser to verify the feature works
3. **What to look for** — expected UI changes, console output, or behavior

This is mandatory. Never skip it. The user should always know how to verify what was just built.


### GSD Workflow Integration

```
/gsd:complete-milestone → /polish-milestone (includes Milestone PR) → /gsd:new-milestone
```

Run `/polish-milestone` after every milestone completion. The polish workflow ends by creating a consolidated PR to main.

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
