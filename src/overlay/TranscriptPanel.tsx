import { useAutoScroll } from './hooks/useAutoScroll';
import type { TranscriptEntry } from '../types/transcript';

interface TranscriptPanelProps {
  entries: TranscriptEntry[];
}

/**
 * Returns color classes based on speaker name.
 * "You" gets blue, "Interviewer" gets purple, others get gray.
 */
function getSpeakerColor(speaker: string): string {
  switch (speaker.toLowerCase()) {
    case 'you':
    case 'me':
      return 'text-blue-600';
    case 'interviewer':
      return 'text-purple-600';
    default:
      // For speaker diarization labels like "Speaker 1", "Speaker 2"
      return 'text-gray-600';
  }
}

/**
 * Transcript panel displaying live transcript with speaker labels.
 * Auto-scrolls to bottom when new entries are added.
 */
export function TranscriptPanel({ entries }: TranscriptPanelProps) {
  // Auto-scroll when entry count changes
  const bottomRef = useAutoScroll(entries.length);

  return (
    <div className="flex-shrink-0">
      <div className="text-xs font-medium text-gray-500 mb-1 flex items-center justify-between">
        <span>Transcript</span>
        {entries.length > 0 && (
          <span className="text-gray-400">
            {entries.length} {entries.length === 1 ? 'entry' : 'entries'}
          </span>
        )}
      </div>

      <div className="bg-gray-50 rounded p-2 h-28 overflow-y-auto">
        {entries.length === 0 ? (
          <div className="h-full flex items-center justify-center">
            <span className="text-sm text-gray-400 italic">
              Waiting for audio...
            </span>
          </div>
        ) : (
          <>
            {entries.map((entry) => (
              <div
                key={entry.id}
                className={`text-sm mb-1.5 last:mb-0 ${
                  !entry.isFinal ? 'opacity-60' : ''
                }`}
              >
                <span className={`font-medium ${getSpeakerColor(entry.speaker)}`}>
                  {entry.speaker}:
                </span>{' '}
                <span className="text-gray-700">
                  {entry.text}
                  {!entry.isFinal && (
                    <span className="ml-1 text-gray-400 italic">...</span>
                  )}
                </span>
              </div>
            ))}
            {/* Scroll anchor - auto-scroll target */}
            <div ref={bottomRef} />
          </>
        )}
      </div>
    </div>
  );
}
