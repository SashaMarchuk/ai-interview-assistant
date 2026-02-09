---
created: 2026-02-09
title: Render LLM responses as formatted Markdown
area: ui
files:
  - src/overlay/ResponsePanel.tsx
---

## Problem
LLM responses are displayed as plain text in the overlay, making them hard to read. Paragraphs, lists, code blocks, bold/italic text, and headers are not rendered - everything appears as a wall of unformatted text.

## Solution
Add Markdown rendering to the ResponsePanel component:
- Install a lightweight MD renderer (e.g., `react-markdown` or `marked`)
- Apply proper styling: headers, paragraphs with spacing, colored code blocks, bullet/numbered lists
- Ensure the rendered output is visually clean and readable inside the overlay's dark theme
- Preserve the streaming behavior (render as text arrives)
- Consider syntax highlighting for code blocks (e.g., `highlight.js` or `prism`)
