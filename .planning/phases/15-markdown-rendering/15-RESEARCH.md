# Phase 15: Markdown Rendering - Research

**Researched:** 2026-02-09
**Domain:** React markdown rendering inside Shadow DOM with streaming LLM responses
**Confidence:** HIGH

## Summary

Phase 15 replaces plain-text LLM response display with properly formatted Markdown rendering inside the Shadow DOM overlay. The current `ResponsePanel.tsx` renders `response.fastHint` and `response.fullAnswer` as raw text inside `<div>` elements (lines 83, 98), making every LLM response look broken since all LLMs return Markdown by default.

The implementation uses `react-markdown` v10 with Tailwind utility class overrides via the `components` prop (a prior decision locked in STATE.md). Syntax highlighting uses `rehype-highlight` (lowlight/highlight.js) with CSS classes -- the highlight.js theme CSS gets injected into Shadow DOM automatically via WXT's `cssInjectionMode: 'ui'` mechanism, which already handles `app.css` injection. Streaming performance is addressed through block-level memoization using `marked.lexer()` to split content into discrete blocks that cache once complete.

**Primary recommendation:** Use `react-markdown` + `remark-gfm` + `rehype-highlight` with explicit Tailwind class component overrides. Add highlight.js dark theme CSS to `app.css`. Memoize at the block level using `marked.lexer()` to avoid O(n^2) re-parsing during streaming. Build a custom `CodeBlock` component with language label and copy-to-clipboard button.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `react-markdown` | ^10.1.0 | Markdown-to-React renderer | 13k+ GitHub stars, native React components (no dangerouslySetInnerHTML), `components` prop for custom styling, remark/rehype plugin pipeline. ESM only, requires React 18 |
| `remark-gfm` | ^4.x | GitHub Flavored Markdown support | Adds tables, strikethrough, task lists, autolinks to react-markdown. Essential for LLM output formatting |
| `rehype-highlight` | ^7.x | Syntax highlighting for code blocks | Uses lowlight (virtual highlight.js), bundles 37 common languages, integrates natively with react-markdown's rehype pipeline, class-based styling |
| `marked` | ^15.x | Markdown tokenizer (lexer only) | Used solely for `marked.lexer()` to split markdown into blocks for streaming memoization. NOT used for rendering |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| highlight.js CSS theme | (bundled with rehype-highlight) | Syntax highlighting colors | Import a single dark theme CSS file (e.g., `github-dark` or `atom-one-dark`) into `app.css` for Shadow DOM injection |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `react-markdown` | `streamdown` (Vercel) | Streamdown is purpose-built for AI streaming with built-in incomplete-block handling, but uses Shiki for highlighting (heavy, WASM-based, ~593KB, designed for server-side). Too large for a Chrome extension. Also newer (v2.1.0, Jan 2026), less battle-tested |
| `react-markdown` | `markdown-to-jsx` | Lighter (~15KB vs ~35KB) but fewer plugins, worse streaming edge case handling, less active maintenance |
| `rehype-highlight` | `react-syntax-highlighter` (PrismLight, inline styles) | Inline styles bypass Shadow DOM CSS isolation entirely (advantage), but ~50KB+ even with tree-shaking, known Vite bundling issues (esbuild generates unnecessary files), and requires wrapping in react-markdown's `components` prop as a separate component rather than integrating via rehype pipeline |
| `rehype-highlight` | `sugar-high` | Ultra-lightweight (~1KB) but uses CSS custom properties that need injection into `:host` scope. Fewer languages supported. Not a rehype plugin -- requires custom component wrapper |
| `marked.lexer()` memoization | `streamdown` built-in memoization | Streamdown handles this automatically but brings the Shiki bundle weight problem |
| `marked.lexer()` memoization | No memoization (naive re-render) | Works for short responses (<500 tokens) but causes O(n^2) performance degradation on longer responses, stuttering during streaming |

**Installation:**
```bash
npm install react-markdown remark-gfm rehype-highlight marked
npm install -D @types/marked
```

## Architecture Patterns

### Recommended Project Structure
```
src/
├── components/
│   └── markdown/
│       ├── MarkdownRenderer.tsx     # Main wrapper: react-markdown with plugins + components
│       ├── MemoizedMarkdown.tsx      # Block-level memoization for streaming
│       ├── CodeBlock.tsx             # Code block with syntax highlighting + copy button + language label
│       └── markdown.css              # highlight.js theme + markdown element base styles
├── overlay/
│   └── ResponsePanel.tsx            # Modified to use MarkdownRenderer instead of plain text
└── assets/
    └── app.css                      # Import markdown.css here for Shadow DOM injection
```

### Pattern 1: Tailwind Component Overrides (Shadow DOM Safe)
**What:** Map every markdown HTML element to a React component with explicit Tailwind utility classes via react-markdown's `components` prop. This bypasses the need for `@tailwindcss/typography` prose classes which do not work inside Shadow DOM.
**When to use:** Always -- this is the primary styling approach for this codebase's Shadow DOM overlay.
**Example:**
```typescript
// Source: Prior decision in STATE.md + react-markdown components prop API
// https://github.com/remarkjs/react-markdown#components

import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import { CodeBlock } from './CodeBlock';

const components = {
  h1: ({ children }: { children: React.ReactNode }) => (
    <h1 className="text-lg font-bold text-white/90 mb-2">{children}</h1>
  ),
  h2: ({ children }: { children: React.ReactNode }) => (
    <h2 className="text-base font-semibold text-white/85 mb-1.5">{children}</h2>
  ),
  h3: ({ children }: { children: React.ReactNode }) => (
    <h3 className="text-sm font-semibold text-white/80 mb-1">{children}</h3>
  ),
  p: ({ children }: { children: React.ReactNode }) => (
    <p className="text-sm text-white/85 mb-1.5 leading-relaxed">{children}</p>
  ),
  strong: ({ children }: { children: React.ReactNode }) => (
    <strong className="font-semibold text-white/95">{children}</strong>
  ),
  em: ({ children }: { children: React.ReactNode }) => (
    <em className="italic text-white/80">{children}</em>
  ),
  ul: ({ children }: { children: React.ReactNode }) => (
    <ul className="list-disc list-inside text-sm mb-1.5 space-y-0.5">{children}</ul>
  ),
  ol: ({ children }: { children: React.ReactNode }) => (
    <ol className="list-decimal list-inside text-sm mb-1.5 space-y-0.5">{children}</ol>
  ),
  li: ({ children }: { children: React.ReactNode }) => (
    <li className="text-white/85">{children}</li>
  ),
  blockquote: ({ children }: { children: React.ReactNode }) => (
    <blockquote className="border-l-2 border-white/30 pl-3 text-sm text-white/70 italic mb-1.5">{children}</blockquote>
  ),
  a: ({ href, children }: { href?: string; children: React.ReactNode }) => (
    <a href={href} target="_blank" rel="noopener noreferrer" className="text-blue-300 underline hover:text-blue-200">
      {children}
    </a>
  ),
  hr: () => <hr className="border-white/20 my-2" />,
  table: ({ children }: { children: React.ReactNode }) => (
    <div className="overflow-x-auto mb-2">
      <table className="text-xs border-collapse w-full">{children}</table>
    </div>
  ),
  th: ({ children }: { children: React.ReactNode }) => (
    <th className="border border-white/20 px-2 py-1 text-left font-medium text-white/90 bg-white/5">{children}</th>
  ),
  td: ({ children }: { children: React.ReactNode }) => (
    <td className="border border-white/20 px-2 py-1 text-white/80">{children}</td>
  ),
  // Code blocks handled by CodeBlock component (see Pattern 2)
  pre: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  code: CodeBlock,
};

export function MarkdownRenderer({ content }: { content: string }) {
  return (
    <Markdown
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[rehypeHighlight]}
      components={components}
    >
      {content}
    </Markdown>
  );
}
```

### Pattern 2: Code Block with Copy Button and Language Label
**What:** Custom code block component that wraps syntax-highlighted code with a header showing language and a copy-to-clipboard button.
**When to use:** For fenced code blocks (triple backticks with language identifier).
**Example:**
```typescript
// Source: react-markdown components prop + Clipboard API
// https://amirardalan.com/blog/copy-code-to-clipboard-with-react-markdown

import { useState, useCallback } from 'react';

interface CodeBlockProps {
  children: React.ReactNode;
  className?: string;
  // react-markdown passes node info
  node?: unknown;
}

export function CodeBlock({ children, className, ...props }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  // Extract language from className (e.g., "language-javascript" -> "javascript")
  const match = className?.match(/language-(\w+)/);
  const language = match?.[1] ?? '';
  const isBlock = !!match;

  const handleCopy = useCallback(async () => {
    const code = String(children).replace(/\n$/, '');
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for environments where clipboard API fails
      console.warn('Clipboard API not available');
    }
  }, [children]);

  // Inline code (no language class)
  if (!isBlock) {
    return (
      <code className="bg-white/10 rounded px-1 py-0.5 text-xs font-mono text-green-300">
        {children}
      </code>
    );
  }

  // Fenced code block with syntax highlighting
  return (
    <div className="relative rounded bg-black/40 mb-2 group">
      {/* Header with language label and copy button */}
      <div className="flex items-center justify-between px-3 py-1 border-b border-white/10 text-xs">
        <span className="text-white/50 uppercase tracking-wider">{language}</span>
        <button
          onClick={handleCopy}
          className="text-white/40 hover:text-white/80 transition-colors"
          title={copied ? 'Copied!' : 'Copy code'}
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      {/* Code content - rehype-highlight adds hljs classes to <code> inside <pre> */}
      <pre className="overflow-x-auto p-3 text-xs leading-relaxed">
        <code className={className} {...props}>
          {children}
        </code>
      </pre>
    </div>
  );
}
```

### Pattern 3: Block-Level Memoization for Streaming Performance
**What:** Split markdown content into discrete blocks using `marked.lexer()`, memoize each block individually, and only re-render blocks that change. This prevents O(n^2) re-parsing during streaming.
**When to use:** For streaming LLM responses where tokens arrive incrementally.
**Example:**
```typescript
// Source: Vercel AI SDK memoization pattern
// https://ai-sdk.dev/cookbook/next/markdown-chatbot-with-memoization

import { memo, useMemo } from 'react';
import { marked } from 'marked';
import { MarkdownRenderer } from './MarkdownRenderer';

// Memoized individual block -- only re-renders when its content changes
const MemoizedBlock = memo(
  function MemoizedBlock({ content }: { content: string }) {
    return <MarkdownRenderer content={content} />;
  },
  (prev, next) => prev.content === next.content,
);

// Split markdown into blocks and memoize each
export function MemoizedMarkdown({ content }: { content: string }) {
  const blocks = useMemo(() => {
    const tokens = marked.lexer(content);
    return tokens.map(token => token.raw);
  }, [content]);

  return (
    <>
      {blocks.map((block, i) => (
        <MemoizedBlock key={i} content={block} />
      ))}
    </>
  );
}
```

### Pattern 4: Highlight.js Theme CSS in Shadow DOM
**What:** Import highlight.js theme CSS into `app.css` so WXT's `cssInjectionMode: 'ui'` automatically injects it into the Shadow DOM alongside Tailwind styles.
**When to use:** Required for rehype-highlight to display syntax colors.
**Example:**
```css
/* In src/assets/app.css or a separate markdown.css imported by app.css */
@import 'tailwindcss';

/* Highlight.js dark theme for code blocks in Shadow DOM */
/* Import a dark theme that matches the overlay's dark aesthetic */
@import 'highlight.js/styles/github-dark.min.css';

/* Or if @import doesn't work with the Vite bundler, inline the theme */
/* highlight.js themes are ~3KB and use .hljs-* class selectors */
```

### Anti-Patterns to Avoid
- **Using `@tailwindcss/typography` (`prose` class):** Does NOT work inside Shadow DOM. The prose styles target the document `<head>`, which does not penetrate Shadow DOM boundaries. This was the prior decision: "Tailwind class overrides (not typography plugin)".
- **Using `rem` units in markdown styles:** The Shadow DOM's font-size base is the host page's root element, not the extension's. All size values must use `px` (following the established pattern in `app.css` lines 14-43).
- **Using `dangerouslySetInnerHTML` for markdown:** XSS risk, breaks React reconciliation, loses component-level control. react-markdown avoids this by design.
- **Re-parsing entire markdown on every token:** O(n^2) performance degradation. Use block-level memoization.
- **Using Shiki for syntax highlighting:** Shiki uses WASM (~593KB), designed for server-side rendering. Too heavy for a Chrome extension client-side overlay.
- **Using `react-syntax-highlighter`:** While inline styles bypass Shadow DOM CSS isolation, the library has known Vite tree-shaking issues (esbuild generates unnecessary files, ~300KB gzipped penalty). Since WXT's `cssInjectionMode: 'ui'` already handles CSS injection into Shadow DOM, the class-based approach of rehype-highlight works fine and integrates more cleanly into react-markdown's rehype pipeline.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Markdown parsing | Custom regex-based parser | `react-markdown` | Markdown spec is complex (nested blocks, escaping, edge cases). Custom parsers always miss edge cases |
| Syntax highlighting | Custom token coloring | `rehype-highlight` (lowlight/highlight.js) | Language grammars are thousands of lines of regex; highlight.js has 190 languages battle-tested |
| Streaming markdown memoization | Custom block detection | `marked.lexer()` for tokenization | `marked` has a mature lexer that correctly identifies block boundaries (paragraphs, code fences, lists, etc.) |
| Copy to clipboard | Custom clipboard logic | `navigator.clipboard.writeText()` | Browser Clipboard API is standardized, works on HTTPS pages (Google Meet is HTTPS) |
| GFM tables/strikethrough | Custom regex | `remark-gfm` | GitHub Flavored Markdown has subtle rules (pipe alignment, cell spanning, task list checkbox syntax) that are easy to get wrong |

**Key insight:** The markdown ecosystem (remark/rehype/unified) has solved all the hard problems. Each library does one thing well and composes via plugins. Fighting this ecosystem with custom solutions guarantees bugs.

## Common Pitfalls

### Pitfall 1: Shadow DOM Swallows All Markdown Styles
**What goes wrong:** Markdown elements (`<h1>`, `<pre>`, `<code>`, `<ul>`, `<blockquote>`) render as unstyled text because Tailwind's preflight CSS (which strips browser defaults) runs, but no replacement styles are applied. The result is a flat wall of same-sized text with no visual hierarchy.
**Why it happens:** Tailwind v4's preflight resets all element styles to a flat baseline. In the main document, you'd use `@tailwindcss/typography` to restore them. Inside Shadow DOM, the typography plugin's styles don't penetrate. Combined with the fact that react-markdown produces standard HTML elements (not pre-styled components), everything renders as plain unstyled text.
**How to avoid:** Define explicit component overrides in the `components` prop of react-markdown. Every markdown element type must map to a React component with Tailwind utility classes applied directly. This is the locked prior decision.
**Warning signs:** Rendered markdown appears as monochrome, same-size text with no indentation, no code block backgrounds, no list bullets.

### Pitfall 2: Highlight.js Theme CSS Not Injected into Shadow DOM
**What goes wrong:** Code blocks render with correct `<span class="hljs-keyword">` etc. markup but no colors because the highlight.js theme CSS is loaded into the main document's `<head>`, not into the Shadow DOM.
**Why it happens:** A standard `import 'highlight.js/styles/github-dark.css'` in a non-content-script file loads CSS into the document head. The Shadow DOM boundary blocks this CSS from reaching the code elements.
**How to avoid:** Import the highlight.js theme CSS in the same file chain as `app.css` (which is imported in `content.tsx` line 6). WXT's `cssInjectionMode: 'ui'` bundles ALL CSS imports from the content script entry point into the Shadow DOM. The theme CSS MUST be reachable from the `content.tsx` import chain. Options: (a) `@import` in `app.css`, (b) import in a `markdown.css` that `app.css` imports, (c) import directly in `content.tsx`.
**Warning signs:** Code blocks have correct structure (`<pre><code><span>`) but all text is the same color (no syntax highlighting colors visible).

### Pitfall 3: O(n^2) Streaming Performance Degradation
**What goes wrong:** During streaming, each new token triggers a React state update, which causes react-markdown to re-parse the ENTIRE accumulated markdown string. For a 2000-token response: total work = 1 + 2 + ... + 2000 = ~2M parse operations. The overlay stutters, Google Meet video/audio jitters, and the CPU spikes.
**Why it happens:** react-markdown has no incremental parsing -- it always parses the full input string. Combined with token-by-token state updates (every ~50ms during fast streaming), the parse work grows quadratically.
**How to avoid:** Two complementary strategies:
1. **Block-level memoization:** Use `marked.lexer()` to split content into blocks. Wrap each block in `React.memo()`. Once a block is complete (followed by another block), it never re-parses. Only the "tail" block (still growing) gets re-parsed.
2. **Batch token updates:** Accumulate tokens for 50-100ms before triggering a state update using `requestAnimationFrame`:
```typescript
let pendingTokens = '';
let rafPending = false;
function handleToken(token: string) {
  pendingTokens += token;
  if (!rafPending) {
    rafPending = true;
    requestAnimationFrame(() => {
      setContent(prev => prev + pendingTokens);
      pendingTokens = '';
      rafPending = false;
    });
  }
}
```
**Warning signs:** Open Chrome DevTools Performance tab during streaming. Red frames and >16ms "Script" tasks during token processing indicate jank.

### Pitfall 4: Incomplete Markdown Syntax During Streaming Causes Visual Glitches
**What goes wrong:** While streaming, the LLM sends partial markdown tokens. For example, `**bol` arrives before `d**`, or a code fence opens with ` ``` ` but the closing fence hasn't arrived yet. This causes:
- Brief flashes of raw asterisks before bold rendering
- Code content expanding outside any code block until the closing fence arrives
- Lists reformatting as content grows
**Why it happens:** react-markdown parsers always parse complete markdown. Incomplete syntax is interpreted literally (as text) until the closing delimiter arrives, then suddenly reformats.
**How to avoid:**
- The block-level memoization (Pitfall 3 solution) naturally handles this: incomplete blocks at the tail re-render as new tokens arrive, and the visual change is limited to the last block only.
- For bold/italic flicker specifically: the ~50-100ms batch window means most delimiter pairs arrive in the same batch.
- For code fences: react-markdown renders unclosed code fences as inline code temporarily, then reformats when the fence closes. This is acceptable behavior -- the content is readable throughout.
- Do NOT try to "detect and close" incomplete syntax -- this creates more visual artifacts than it solves.
**Warning signs:** Bold/italic text briefly flashing as raw `**text**` syntax before rendering formatted.

### Pitfall 5: Copy Button Doesn't Work in Shadow DOM
**What goes wrong:** The copy-to-clipboard button in code blocks doesn't copy text because `navigator.clipboard.writeText()` requires a secure context and user activation.
**Why it happens:** The content script runs on `https://meet.google.com/*` (secure context), so `navigator.clipboard` is available. However, if the Shadow DOM's click event doesn't propagate correctly, the browser may not recognize it as user activation.
**How to avoid:** The copy button is a regular React `<button>` with an `onClick` handler inside the Shadow DOM. Click events from Shadow DOM elements DO count as user activation in Chrome. Ensure the manifest does NOT require `clipboardWrite` permission (not needed for `navigator.clipboard.writeText()` on HTTPS pages). Test by clicking the copy button and verifying clipboard content.
**Warning signs:** Clicking copy button produces console error about clipboard API permissions or insecure context.

### Pitfall 6: Large Code Blocks Overflow the Small Overlay
**What goes wrong:** LLM responses contain long code blocks (20+ lines, or lines wider than the overlay). Without proper containment, code blocks expand beyond the overlay boundaries or push other content off-screen.
**Why it happens:** The overlay is typically 340px wide and 400px tall. A single code block with 50-character lines and 30 lines exceeds this entirely.
**How to avoid:**
- Code blocks MUST have `overflow-x: auto` for horizontal scrolling
- The response panel already has `overflow-y-auto` (ResponsePanel.tsx line 63) which handles vertical overflow
- Set `max-height` on code blocks (e.g., `max-h-60` = 240px) with vertical scroll for very long code
- Use `text-xs` (12px) font for code to maximize content density in the small overlay
**Warning signs:** Code blocks push the overlay's content area to show scrollbar or text overflows outside the rounded border.

## Code Examples

Verified patterns from official sources:

### react-markdown v10 Basic Usage
```typescript
// Source: https://github.com/remarkjs/react-markdown
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';

function MyComponent({ text }: { text: string }) {
  return (
    <Markdown
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[rehypeHighlight]}
      components={{
        // Custom components here
      }}
    >
      {text}
    </Markdown>
  );
}
```

### react-markdown Custom Code Component with rehype-highlight
```typescript
// Source: https://github.com/remarkjs/react-markdown#components
// When rehype-highlight is active, code blocks inside <pre> receive className="language-xxx hljs"
// and children are <span> elements with hljs-* classes

// The components prop receives the processed code element.
// For block code: <pre> wraps <code className="language-xxx hljs">
// For inline code: <code> with no language class

// Detect block vs inline by checking if parent is <pre> or if className has language-*
function CodeBlock({ children, className, node, ...props }: CodeBlockProps) {
  const isBlock = /language-/.test(className || '');
  if (!isBlock) {
    return <code className="bg-white/10 rounded px-1 text-xs">{children}</code>;
  }
  // Block code with copy button
  return (
    <div className="relative rounded bg-black/40 mb-2">
      <pre className="overflow-x-auto p-3 text-xs">
        <code className={className} {...props}>{children}</code>
      </pre>
    </div>
  );
}
```

### Clipboard API in Content Script
```typescript
// Source: https://developer.mozilla.org/en-US/docs/Web/API/Clipboard/writeText
// Works on HTTPS pages (Google Meet) without additional permissions

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fallback: create a temporary textarea
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
    return true;
  }
}
```

### marked.lexer() for Block Splitting
```typescript
// Source: https://marked.js.org/using_pro
import { marked } from 'marked';

const markdown = `# Heading

Some paragraph text.

\`\`\`javascript
const x = 1;
\`\`\`

- Item 1
- Item 2
`;

const tokens = marked.lexer(markdown);
const blocks = tokens.map(token => token.raw);
// blocks = ["# Heading\n\n", "Some paragraph text.\n\n", "```javascript\nconst x = 1;\n```\n\n", "- Item 1\n- Item 2\n"]
// Each block can be independently rendered and memoized
```

### Highlight.js Theme Import for Shadow DOM
```css
/* Source: highlight.js theme documentation
   https://highlightjs.readthedocs.io/en/latest/theme-guide.html

   Import in app.css so WXT bundles it into Shadow DOM via cssInjectionMode: 'ui' */

/* Option A: @import (preferred if Vite resolves node_modules CSS) */
@import 'highlight.js/styles/github-dark.min.css';

/* Option B: Inline key classes if @import fails (~30 lines) */
.hljs { color: #c9d1d9; background: transparent; }
.hljs-keyword { color: #ff7b72; }
.hljs-string { color: #a5d6ff; }
.hljs-comment { color: #8b949e; font-style: italic; }
.hljs-number { color: #79c0ff; }
.hljs-title { color: #d2a8ff; }
.hljs-built_in { color: #ffa657; }
/* ... etc */
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `dangerouslySetInnerHTML` with `marked` | `react-markdown` with React components | 2020+ | Safe by default, efficient streaming via React reconciliation |
| Full re-parse on every token | Block-level memoization (Vercel AI SDK pattern) | 2025 | 2-10x faster streaming rendering |
| `@tailwindcss/typography` (prose) | Custom `components` prop overrides | N/A (Shadow DOM specific) | Only approach that works inside Shadow DOM |
| `react-syntax-highlighter` (inline styles) | `rehype-highlight` (CSS classes) | Contextual | rehype-highlight integrates cleaner with react-markdown pipeline; CSS injection via WXT handles Shadow DOM |
| Separate streaming library (Streamdown) | `react-markdown` + memoization | 2025-2026 | Streamdown is promising but Shiki dependency is too heavy for Chrome extensions |

**Deprecated/outdated:**
- `react-markdown` v8 `className` prop: Removed in v10. Use wrapper div or `components` prop instead.
- `ReactMarkdown` named export: v10 uses `Markdown` as the default export (`import Markdown from 'react-markdown'`).
- `useInlineStyles` in react-syntax-highlighter: Still works but the library has tree-shaking issues with Vite/esbuild that make it less ideal than rehype-highlight.

## Implementation Notes

### Files to Modify
1. **`src/overlay/ResponsePanel.tsx`** -- Replace plain text `{response.fastHint}` and `{response.fullAnswer}` with `<MemoizedMarkdown content={...} />`
2. **`src/assets/app.css`** -- Add highlight.js theme CSS import and markdown-specific base styles (code block background, font-family for code)
3. **`entrypoints/content.tsx`** -- May need to adjust token batching in `handleLLMStream()` to accumulate tokens with `requestAnimationFrame` instead of updating state on every single token

### Files to Create
1. **`src/components/markdown/MarkdownRenderer.tsx`** -- Core component with react-markdown, plugins, and component overrides
2. **`src/components/markdown/MemoizedMarkdown.tsx`** -- Block-level memoization wrapper using marked.lexer()
3. **`src/components/markdown/CodeBlock.tsx`** -- Code block with language label, copy button, syntax highlighting

### Key Design Decisions
1. **rehype-highlight over react-syntax-highlighter:** The CSS injection via `cssInjectionMode: 'ui'` already works for the entire `app.css`. Adding highlight.js theme CSS to this chain is simpler than managing inline styles. rehype-highlight also integrates natively into react-markdown's plugin pipeline (no custom component wrapper needed for the highlighting itself, only for the UI chrome around code blocks).
2. **marked.lexer() for memoization, NOT for rendering:** `marked` is used solely as a tokenizer to identify block boundaries. All rendering is done by `react-markdown`. This avoids maintaining two markdown parsers.
3. **px units throughout:** Following the established `app.css` pattern, all markdown styles use `px` values, not `rem`. This prevents font-size inheritance issues from the host page's root element.
4. **Memoization is essential:** The existing `handleLLMStream` in content.tsx updates state on every single token. Without memoization, react-markdown would re-parse everything on each update. The block-level approach ensures only the last (incomplete) block re-parses.
5. **Copy-to-clipboard on HTTPS:** Google Meet runs on HTTPS, so `navigator.clipboard.writeText()` is available without the `clipboardWrite` permission in the manifest.

## Open Questions

1. **Vite `@import` resolution for highlight.js CSS:**
   - What we know: Vite resolves `@import` from `node_modules` in CSS files. The `@tailwindcss/vite` plugin is already configured.
   - What's unclear: Whether `@import 'highlight.js/styles/github-dark.min.css'` inside `app.css` resolves correctly through the WXT + Vite + Tailwind pipeline, or if it needs a different import path.
   - Recommendation: Try `@import` first. If it fails, inline the theme CSS directly in `app.css` (the theme files are ~3KB, manageable inline). Alternatively, create a separate `markdown.css` and import it in `content.tsx`.

2. **react-markdown v10 `pre` and `code` component interaction with rehype-highlight:**
   - What we know: rehype-highlight processes `<code>` elements inside `<pre>` elements, adding `hljs-*` classes to `<span>` children. The `components.code` override receives the processed children.
   - What's unclear: The exact prop types and structure passed to the `pre` and `code` components in react-markdown v10 when rehype-highlight is active. The `node` prop structure may differ from v8/v9.
   - Recommendation: Start with the pattern shown in the code examples. Test with a simple markdown string containing a fenced code block. Inspect the rendered DOM to verify `hljs-*` classes are present.

3. **Token batching location:**
   - What we know: Currently, `handleLLMStream` in `content.tsx` line 94 updates module-level state on every token and dispatches a custom event. The overlay receives this event and updates React state.
   - What's unclear: Whether token batching should happen in `content.tsx` (before dispatching events) or in the React component (debouncing state updates). Content-level batching reduces event dispatch frequency; component-level batching is more self-contained.
   - Recommendation: Implement batching in `content.tsx` at the `handleLLMStream` level using `requestAnimationFrame`. This reduces both event dispatch frequency AND React state updates, giving the best performance improvement.

## Sources

### Primary (HIGH confidence)
- [react-markdown GitHub](https://github.com/remarkjs/react-markdown) -- v10 API, components prop, plugin system, React 18 requirement
- [rehype-highlight GitHub](https://github.com/rehypejs/rehype-highlight) -- API, configuration, 37 default languages, lowlight integration
- [highlight.js Theme Guide](https://highlightjs.readthedocs.io/en/latest/theme-guide.html) -- CSS class structure, theme files
- [Vercel AI SDK Markdown Memoization](https://ai-sdk.dev/cookbook/next/markdown-chatbot-with-memoization) -- Block-level memoization pattern with marked.lexer()
- [WXT Content Script UI](https://wxt.dev/guide/key-concepts/content-script-ui.html) -- createShadowRootUi, cssInjectionMode: 'ui'
- [Clipboard API MDN](https://developer.mozilla.org/en-US/docs/Web/API/Clipboard/writeText) -- writeText on secure contexts
- Codebase files: `src/overlay/ResponsePanel.tsx`, `entrypoints/content.tsx`, `src/assets/app.css`, `src/types/transcript.ts`

### Secondary (MEDIUM confidence)
- [Tailwind CSS v4 Breaks Markdown Formatting (GitHub Discussion #17645)](https://github.com/tailwindlabs/tailwindcss/discussions/17645) -- Preflight reset conflicts with react-markdown, typography plugin as workaround
- [react-markdown Copy Code Button (DEV)](https://dev.to/designly/react-markdown-how-to-create-a-copy-code-button-26cm) -- Implementation pattern for copy button
- [From O(n^2) to O(n): Streaming Markdown Renderer (DEV)](https://dev.to/kingshuaishuai/from-on2-to-on-building-a-streaming-markdown-renderer-for-the-ai-era-3k0f) -- Performance analysis and solutions
- [Streamdown GitHub (Vercel)](https://github.com/vercel/streamdown) -- v2.1.0, streaming-first design, Shiki dependency
- Prior research: `.planning/research/FEATURES.md`, `.planning/research/ARCHITECTURE.md`, `.planning/research/STACK.md`, `.planning/research/PITFALLS.md`

### Tertiary (LOW confidence)
- react-markdown exact bundle size (~35KB gzipped) -- varies by version and tree-shaking; npm reports may differ from actual bundled size
- `@import` CSS resolution path through WXT + Vite + Tailwind pipeline -- logical but needs empirical testing

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- react-markdown, remark-gfm, rehype-highlight are the dominant ecosystem choice with massive adoption. Prior codebase research (FEATURES.md, STACK.md, ARCHITECTURE.md) confirms this direction.
- Architecture: HIGH -- Component override pattern is well-documented, block-level memoization is the Vercel-recommended approach, Shadow DOM CSS injection is proven with existing `app.css` approach.
- Pitfalls: HIGH -- Shadow DOM styling, streaming performance, and CSS injection pitfalls are thoroughly documented in the codebase's own PITFALLS.md with verified sources and prevention strategies.

**Research date:** 2026-02-09
**Valid until:** 2026-03-09 (stable domain -- react-markdown and rehype-highlight are mature libraries with infrequent breaking changes)
