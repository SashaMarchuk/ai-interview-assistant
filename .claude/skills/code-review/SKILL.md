---
name: code-review
description: "Code review a pull request using multi-agent workflow with confidence-based scoring. Checks for bugs, CLAUDE.md compliance, and posts inline comments. Use when: code review, PR review, pull request review, review changes."
allowed-tools: Bash(gh issue view:*), Bash(gh search:*), Bash(gh issue list:*), Bash(gh pr comment:*), Bash(gh pr diff:*), Bash(gh pr view:*), Bash(gh pr list:*)
source: anthropics/claude-code plugins (code-review)
---

# Code Review

Provide a code review for the given pull request.

## Agent Workflow

1. **Pre-check (haiku)**: Skip if PR is closed, draft, trivial, or already reviewed
2. **Context (haiku)**: Find relevant CLAUDE.md files
3. **Summary (sonnet)**: Summarize PR changes
4. **Review (4 parallel agents)**:
   - 2x Sonnet: CLAUDE.md compliance
   - 2x Opus: Bug detection
5. **Validation (parallel)**: Verify each issue with high confidence
6. **Post comments**: Inline comments via `gh pr comment`

## What Gets Flagged (HIGH SIGNAL only)

- Syntax errors, type errors, missing imports
- Clear logic errors that will produce wrong results
- Unambiguous CLAUDE.md violations with exact rule quoted

## What Does NOT Get Flagged

- Code style or quality concerns
- Potential issues depending on specific inputs
- Subjective suggestions
- Pre-existing issues
- Pedantic nitpicks
- Issues a linter would catch

## Usage

```
/code-review <PR-number-or-url>
```

## Notes

- Uses `gh` CLI for GitHub interaction
- Posts inline comments with committable suggestions for small fixes
- For large fixes, describes the issue without suggestion block
- Links to code with full git SHA format
