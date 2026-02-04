# Available Skills

Skills available to GSD agents during execution. Reference this file in PLAN.md `<context>` sections.

---

## browser-extension-builder

**Invoke:** `/browser-extension-builder`

**Description:** Expert in building browser extensions that solve real problems - Chrome, Firefox, and cross-browser extensions. Covers extension architecture, manifest v3, content scripts, popup UIs, monetization strategies, and Chrome Web Store publishing.

**When to use:**
- Browser extension architecture decisions
- Manifest V3 implementation
- Content script development
- Background worker patterns
- Popup interface design
- Cross-browser compatibility
- Chrome Web Store publishing

**Capabilities:**
- Extension architecture
- Manifest V3 (MV3)
- Content scripts
- Background workers
- Popup interfaces
- Extension monetization
- Chrome Web Store publishing
- Cross-browser support

**Key Patterns:**
- MV3 project structure
- Communication: Popup <-> Background <-> Content Script
- Chrome storage API (local/sync)
- Shadow DOM for CSS isolation
- Permissions best practices

**Anti-patterns to avoid:**
- Requesting all permissions upfront
- Heavy background processing (MV3 terminates idle workers)
- Fragile DOM selectors that break on updates

**Source:** `.claude/skills/browser-extension-builder/SKILL.md`

---

## frontend-design

**Invoke:** `/frontend-design`

**Description:** Create distinctive, production-grade frontend interfaces with high design quality. Generates creative, polished code and UI design that avoids generic AI aesthetics.

**When to use:**
- Building web components, pages, dashboards
- React components, HTML/CSS layouts
- Styling/beautifying any web UI
- Landing pages, applications
- When you need memorable, non-generic design

**Capabilities:**
- Production-grade functional code
- Visually striking and memorable interfaces
- Typography selection (avoiding generic fonts)
- Color & theme cohesion
- Motion & micro-interactions
- Spatial composition (asymmetry, overlap, grids)
- Backgrounds & visual details

**Key Principles:**
- Bold aesthetic direction (minimalist, maximalist, retro-futuristic, etc.)
- Intentionality over intensity
- No generic "AI slop" (Inter, Roboto, purple gradients)
- Context-specific character

**Source:** `.claude/skills/frontend-design/SKILL.md`

---

## code-review

**Invoke:** `/code-review <PR>`

**Description:** Multi-agent code review workflow with confidence-based scoring. Checks for bugs, CLAUDE.md compliance, and posts inline GitHub comments.

**When to use:**
- Reviewing pull requests
- Automated PR quality checks
- CLAUDE.md compliance verification
- Bug detection in diffs

**Agent Workflow:**
1. Pre-check (haiku) — Skip closed/draft/trivial PRs
2. Context (haiku) — Find relevant CLAUDE.md files
3. Summary (sonnet) — Summarize changes
4. Review (4 parallel) — 2x Sonnet (CLAUDE.md) + 2x Opus (bugs)
5. Validation (parallel) — High-confidence verification
6. Post — Inline comments via `gh pr comment`

**What gets flagged (HIGH SIGNAL):**
- Syntax/type errors, missing imports
- Clear logic errors
- Unambiguous CLAUDE.md violations

**What does NOT get flagged:**
- Style/quality concerns
- Subjective suggestions
- Pre-existing issues
- Linter-catchable issues

**Source:** `.claude/skills/code-review/SKILL.md`

---

*Add new skills below this line*
