import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import type { Components } from 'react-markdown';
import { CodeBlock } from './CodeBlock';

/**
 * Static component overrides for react-markdown.
 * Defined outside the component to avoid recreation on every render.
 * Each markdown element is mapped to a React component with explicit
 * Tailwind utility classes for Shadow DOM compatibility.
 */
const components: Components = {
  h1: ({ children }) => (
    <h1 className="text-lg font-bold text-white/90 mb-2">{children}</h1>
  ),
  h2: ({ children }) => (
    <h2 className="text-base font-semibold text-white/85 mb-1.5">{children}</h2>
  ),
  h3: ({ children }) => (
    <h3 className="text-sm font-semibold text-white/80 mb-1">{children}</h3>
  ),
  p: ({ children }) => (
    <p className="text-sm text-white/85 mb-1.5 leading-relaxed">{children}</p>
  ),
  strong: ({ children }) => (
    <strong className="font-semibold text-white/95">{children}</strong>
  ),
  em: ({ children }) => <em className="italic text-white/80">{children}</em>,
  ul: ({ children }) => (
    <ul className="list-disc list-inside text-sm mb-1.5 space-y-0.5">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="list-decimal list-inside text-sm mb-1.5 space-y-0.5">
      {children}
    </ol>
  ),
  li: ({ children }) => <li className="text-white/85">{children}</li>,
  blockquote: ({ children }) => (
    <blockquote className="border-l-2 border-white/30 pl-3 text-sm text-white/70 italic mb-1.5">
      {children}
    </blockquote>
  ),
  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-blue-300 underline hover:text-blue-200"
    >
      {children}
    </a>
  ),
  hr: () => <hr className="border-white/20 my-2" />,
  table: ({ children }) => (
    <div className="overflow-x-auto mb-2">
      <table className="text-xs border-collapse w-full">{children}</table>
    </div>
  ),
  th: ({ children }) => (
    <th className="border border-white/20 px-2 py-1 text-left font-medium text-white/90 bg-white/5">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="border border-white/20 px-2 py-1 text-white/80">{children}</td>
  ),
  // pre passthrough -- CodeBlock handles the wrapping for block code
  pre: ({ children }) => <>{children}</>,
  // code blocks handled by CodeBlock component (inline + block)
  code: CodeBlock,
};

interface MarkdownRendererProps {
  content: string;
}

/**
 * Main markdown renderer using react-markdown with Tailwind component overrides.
 * Designed for Shadow DOM environments where @tailwindcss/typography won't work.
 * Uses rehype-highlight for syntax highlighting and remark-gfm for GitHub Flavored Markdown.
 */
export function MarkdownRenderer({ content }: MarkdownRendererProps) {
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
