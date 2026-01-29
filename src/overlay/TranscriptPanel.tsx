import { useAutoScroll } from './hooks/useAutoScroll';
import type { TranscriptEntry } from '../types/transcript';

interface TranscriptPanelProps {
  entries: TranscriptEntry[];
}

/**
 * Returns color classes based on speaker name.
 * Uses light colors for transparent dark background.
 */
function getSpeakerColor(speaker: string): string {
  switch (speaker.toLowerCase()) {
    case 'you':
    case 'me':
      return 'text-blue-300';
    case 'interviewer':
      return 'text-purple-300';
    default:
      return 'text-gray-300';
  }
}

/**
 * Format timestamp to HH:MM format.
 */
function formatTimestamp(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Transcript panel displaying live transcript with speaker labels.
 * Auto-scrolls to bottom when new entries are added.
 */
export function TranscriptPanel({ entries }: TranscriptPanelProps) {
  const bottomRef = useAutoScroll(entries.length);

  return (
    <div className="flex-shrink-0">
      <div className="text-xs font-medium text-white/60 mb-1 flex items-center justify-between">
        <span>Transcript</span>
        {entries.length > 0 && (
          <span className="text-white/40">
            {entries.length} {entries.length === 1 ? 'entry' : 'entries'}
          </span>
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
              <div
                key={entry.id}
                className={`text-sm mb-1.5 last:mb-0 ${
                  !entry.isFinal ? 'opacity-60 italic' : ''
                }`}
              >
                <span className={`font-medium ${getSpeakerColor(entry.speaker)}`}>
                  {entry.speaker}
                </span>
                <span className="text-white/40 ml-1 text-xs">
                  ({formatTimestamp(entry.timestamp)})
                </span>
                <span className="text-white/90 ml-1">
                  {entry.text}
                  {!entry.isFinal && (
                    <span className="text-white/40">...</span>
                  )}
                </span>
              </div>
            ))}
            <div ref={bottomRef} />
          </>
        )}
      </div>
    </div>
  );
}
