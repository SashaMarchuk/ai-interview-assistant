import { memo, useMemo } from 'react';
import { marked } from 'marked';
import { MarkdownRenderer } from './MarkdownRenderer';

/**
 * Memoized individual markdown block.
 * Only re-renders when its content string changes.
 * Once a block is complete (followed by another block during streaming),
 * it never re-renders again.
 */
const MemoizedBlock = memo(
  function MemoizedBlock({ content }: { content: string }) {
    return <MarkdownRenderer content={content} />;
  },
  (prev, next) => prev.content === next.content,
);

interface MemoizedMarkdownProps {
  content: string;
}

/**
 * Block-level memoization wrapper for streaming markdown.
 *
 * Uses marked.lexer() to split markdown content into discrete blocks
 * (paragraphs, code fences, lists, headings, etc.) and renders each
 * block with a memoized component. During streaming, only the last
 * (incomplete) block re-renders as new tokens arrive -- all preceding
 * complete blocks are cached.
 *
 * This prevents O(n^2) re-parsing performance degradation that occurs
 * when react-markdown re-parses the entire accumulated string on every
 * token update.
 */
export function MemoizedMarkdown({ content }: MemoizedMarkdownProps) {
  const blocks = useMemo(() => {
    const tokens = marked.lexer(content);
    return tokens.map((token) => token.raw);
  }, [content]);

  return (
    <>
      {blocks.map((block, i) => (
        <MemoizedBlock key={i} content={block} />
      ))}
    </>
  );
}
