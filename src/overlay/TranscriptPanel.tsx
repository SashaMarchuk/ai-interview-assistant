import { memo, useMemo } from 'react';
import { useAutoScroll } from './hooks/useAutoScroll';
import type { TranscriptEntry as TranscriptEntryType } from '../types/transcript';

interface TranscriptPanelProps {
  entries: TranscriptEntryType[];
}

/**
 * Speaker color map - using object lookup is faster than switch for hot paths
 */
const SPEAKER_COLORS: Record<string, string> = {
  you: 'text-blue-300',
  me: 'text-blue-300',
  interviewer: 'text-purple-300',
};
const DEFAULT_SPEAKER_COLOR = 'text-gray-300';

/**
 * Returns color classes based on speaker name.
 * Uses light colors for transparent dark background.
 */
function getSpeakerColor(speaker: string): string {
  return SPEAKER_COLORS[speaker.toLowerCase()] || DEFAULT_SPEAKER_COLOR;
}

/**
 * Cache for formatted timestamps to avoid creating Date objects repeatedly.
 * Uses a simple LRU-style cache with max 100 entries.
 */
const timestampCache = new Map<number, string>();
const MAX_CACHE_SIZE = 100;

/**
 * Format timestamp to HH:MM format with caching.
 */
function formatTimestamp(timestamp: number): string {
  const cached = timestampCache.get(timestamp);
  if (cached) return cached;

  const formatted = new Date(timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

  // Simple cache eviction when full
  if (timestampCache.size >= MAX_CACHE_SIZE) {
    const firstKey = timestampCache.keys().next().value;
    if (firstKey !== undefined) {
      timestampCache.delete(firstKey);
    }
  }
  timestampCache.set(timestamp, formatted);
  return formatted;
}

/**
 * Memoized transcript entry component to prevent re-renders of unchanged entries.
 */
const TranscriptEntryRow = memo(function TranscriptEntryRow({
  entry,
}: {
  entry: TranscriptEntryType;
}) {
  const speakerColor = useMemo(() => getSpeakerColor(entry.speaker), [entry.speaker]);
  const formattedTime = useMemo(() => formatTimestamp(entry.timestamp), [entry.timestamp]);

  return (
    <div
      className={`text-sm mb-1.5 last:mb-0 ${
        !entry.isFinal ? 'opacity-60 italic' : ''
      }`}
    >
      <span className={`font-medium ${speakerColor}`}>
        {entry.speaker}
      </span>
      <span className="text-white/40 ml-1 text-xs">
        ({formattedTime})
      </span>
      <span className="text-white/90 ml-1">
        {entry.text}
        {!entry.isFinal && (
          <span className="text-white/40">...</span>
        )}
      </span>
    </div>
  );
});

/**
 * Transcript panel displaying live transcript with speaker labels.
 * Auto-scrolls to bottom when new entries are added.
 * Uses memoized entry components to prevent unnecessary re-renders.
 */
export const TranscriptPanel = memo(function TranscriptPanel({ entries }: TranscriptPanelProps) {
  const bottomRef = useAutoScroll(entries.length);

  // Memoize the entry count display
  const entryCountText = useMemo(() => {
    if (entries.length === 0) return null;
    return `${entries.length} ${entries.length === 1 ? 'entry' : 'entries'}`;
  }, [entries.length]);

  return (
    <div className="flex-shrink-0">
      <div className="text-xs font-medium text-white/60 mb-1 flex items-center justify-between">
        <span>Transcript</span>
        {entryCountText && (
          <span className="text-white/40">{entryCountText}</span>
        )}
      </div>

      <div className="rounded p-2 h-28 overflow-y-auto">
        {entries.length === 0 ? (
          <div className="h-full flex items-center justify-center">
            <span className="text-sm text-white/40 italic">
              Waiting for audio...
            </span>
          </div>
        ) : (
          <>
            {entries.map((entry) => (
              <TranscriptEntryRow key={entry.id} entry={entry} />
            ))}
            <div ref={bottomRef} />
          </>
        )}
      </div>
    </div>
  );
});
