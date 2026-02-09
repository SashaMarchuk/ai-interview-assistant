import { useState, useCallback } from 'react';
import type { ExtraProps } from 'react-markdown';

type CodeBlockProps = React.ClassAttributes<HTMLElement> &
  React.HTMLAttributes<HTMLElement> &
  ExtraProps;

export function CodeBlock({ children, className, node: _node, ...props }: CodeBlockProps) {
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
      <pre className="overflow-x-auto p-3 text-xs leading-relaxed max-h-60 overflow-y-auto">
        <code className={className} {...props}>
          {children}
        </code>
      </pre>
    </div>
  );
}
