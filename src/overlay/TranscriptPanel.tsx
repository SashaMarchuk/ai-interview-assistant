import { memo, useMemo, useState, useCallback, useRef, useEffect } from 'react';
import { useAutoScroll } from './hooks/useAutoScroll';
import type { TranscriptEntry as TranscriptEntryType } from '../types/transcript';

interface TranscriptPanelProps {
  entries: TranscriptEntryType[];
  editedIds?: string[];
  deletedIds?: string[];
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
 * Uses a simple FIFO cache with max 100 entries (evicts oldest inserted key when full).
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

// --- Event dispatch helpers (module-level, outside components) ---

function dispatchEditEvent(id: string, editedText: string): void {
  window.dispatchEvent(
    new CustomEvent('transcript-edit', { detail: { id, editedText } }),
  );
}

function dispatchDeleteEvent(id: string): void {
  window.dispatchEvent(
    new CustomEvent('transcript-delete', { detail: { id } }),
  );
}

function dispatchUndoEvent(id: string): void {
  window.dispatchEvent(
    new CustomEvent('transcript-undo', { detail: { id } }),
  );
}

// --- TranscriptEntryRow props ---

interface TranscriptEntryRowProps {
  entry: TranscriptEntryType;
  isEditing: boolean;
  isDeleted: boolean;
  isEdited: boolean;
  editText: string;
  onDoubleClick: () => void;
  onEditChange: (text: string) => void;
  onEditKeyDown: (e: React.KeyboardEvent) => void;
  onEditBlur: () => void;
  onDelete: () => void;
  onUndo: () => void;
}

/**
 * Memoized transcript entry component supporting three modes:
 * - Normal: text with hover controls (delete, undo if edited)
 * - Editing: inline text input on double-click
 * - Deleted: greyed-out with undo button
 */
const TranscriptEntryRow = memo(function TranscriptEntryRow({
  entry,
  isEditing,
  isDeleted,
  isEdited,
  editText,
  onDoubleClick,
  onEditChange,
  onEditKeyDown,
  onEditBlur,
  onDelete,
  onUndo,
}: TranscriptEntryRowProps) {
  const speakerColor = useMemo(() => getSpeakerColor(entry.speaker), [entry.speaker]);
  const formattedTime = useMemo(() => formatTimestamp(entry.timestamp), [entry.timestamp]);

  // Deleted mode: compact greyed-out row with undo button
  if (isDeleted) {
    return (
      <div className="mb-1 flex items-center justify-between text-sm opacity-40">
        <span className="truncate line-through">
          <span className={`font-medium ${speakerColor}`}>{entry.speaker}</span>
          <span className="ml-1">{entry.text}</span>
        </span>
        <button
          onClick={onUndo}
          className="ml-1 flex-shrink-0 text-xs text-yellow-400 hover:text-yellow-300"
          title="Undo delete"
        >
          undo
        </button>
      </div>
    );
  }

  // Editing mode: inline text input
  if (isEditing) {
    return (
      <div className="mb-1.5 text-sm">
        <span className={`font-medium ${speakerColor}`}>{entry.speaker}</span>
        <span className="ml-1 text-xs text-white/40">({formattedTime})</span>
        <input
          type="text"
          value={editText}
          onChange={(e) => onEditChange(e.target.value)}
          onKeyDown={onEditKeyDown}
          onBlur={onEditBlur}
          autoFocus
          className="mt-0.5 block w-full rounded border border-white/20 bg-white/10 px-1 py-0.5 text-sm text-white/90 outline-none focus:border-blue-400"
        />
      </div>
    );
  }

  // Normal mode: text with hover controls
  return (
    <div
      className={`group mb-1.5 text-sm last:mb-0 ${!entry.isFinal ? 'italic opacity-60' : ''}`}
      onDoubleClick={onDoubleClick}
    >
      <span className={`font-medium ${speakerColor}`}>{entry.speaker}</span>
      <span className="ml-1 text-xs text-white/40">({formattedTime})</span>
      <span className="ml-1 text-white/90">
        {entry.text}
        {!entry.isFinal && <span className="text-white/40">...</span>}
      </span>
      {isEdited && (
        <span className="ml-1 text-xs text-yellow-400/60">(edited)</span>
      )}
      {/* Hover controls: delete and undo (if edited) */}
      <span className="ml-1 hidden gap-1 group-hover:inline-flex">
        {isEdited && (
          <button
            onClick={onUndo}
            className="text-xs text-yellow-400 hover:text-yellow-300"
            title="Undo edit"
          >
            undo
          </button>
        )}
        <button
          onClick={onDelete}
          className="text-xs text-red-400 hover:text-red-300"
          title="Hide from transcript"
        >
          x
        </button>
      </span>
    </div>
  );
});

/**
 * Transcript panel displaying live transcript with speaker labels.
 * Supports inline editing (double-click), soft-delete, and undo.
 * Auto-scrolls to bottom when new entries are added (suppressed during editing).
 * Uses memoized entry components to prevent unnecessary re-renders.
 */
export const TranscriptPanel = memo(function TranscriptPanel({
  entries,
  editedIds,
  deletedIds,
}: TranscriptPanelProps) {
  // Editing state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');

  // Auto-scroll with edit-aware suppression
  const bottomRef = useAutoScroll(entries.length, editingId !== null);

  // Convert arrays to Sets for O(1) lookup
  const editedSet = useMemo(() => new Set(editedIds ?? []), [editedIds]);
  const deletedSet = useMemo(() => new Set(deletedIds ?? []), [deletedIds]);

  // Memoize the entry count display (use loop counter instead of .filter().length)
  const entryCountText = useMemo(() => {
    if (entries.length === 0) return null;
    const totalCount = entries.length;
    let deletedCount = 0;
    for (let i = 0; i < totalCount; i++) {
      if (deletedSet.has(entries[i].id)) deletedCount++;
    }
    const visibleCount = totalCount - deletedCount;
    if (visibleCount === totalCount) {
      return `${totalCount} ${totalCount === 1 ? 'entry' : 'entries'}`;
    }
    return `${visibleCount}/${totalCount} entries`;
  }, [entries, deletedSet]);

  // Use ref for editText so callbacks don't need to depend on it (avoids re-creating callbacks)
  const editTextRef = useRef(editText);
  useEffect(() => {
    editTextRef.current = editText;
  }, [editText]);

  // Double-click to start editing (use stable callback with entry parameter)
  const handleDoubleClick = useCallback(
    (entry: TranscriptEntryType) => {
      if (deletedSet.has(entry.id)) return; // Can't edit deleted entries
      setEditingId(entry.id);
      setEditText(entry.text);
    },
    [deletedSet],
  );

  // Save edit (stable: reads editText from ref)
  const handleSave = useCallback(
    (entryId: string) => {
      const text = editTextRef.current.trim();
      if (text) {
        dispatchEditEvent(entryId, text);
      }
      setEditingId(null);
    },
    [],
  );

  // Cancel edit
  const handleCancel = useCallback(() => {
    setEditingId(null);
  }, []);

  // Key handler for edit input (stable: handleSave uses ref)
  const handleEditKeyDown = useCallback(
    (e: React.KeyboardEvent, entryId: string) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleSave(entryId);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        handleCancel();
      }
    },
    [handleSave, handleCancel],
  );

  return (
    <div className="flex-shrink-0">
      <div className="mb-1 flex items-center justify-between text-xs font-medium text-white/60">
        <span>Transcript</span>
        {entryCountText && <span className="text-white/40">{entryCountText}</span>}
      </div>

      <div className="h-28 overflow-y-auto rounded p-2">
        {entries.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <span className="text-sm text-white/40 italic">Waiting for audio...</span>
          </div>
        ) : (
          <>
            {entries.map((entry) => (
              <TranscriptEntryRow
                key={entry.id}
                entry={entry}
                isEditing={editingId === entry.id}
                isDeleted={deletedSet.has(entry.id)}
                isEdited={editedSet.has(entry.id) && !deletedSet.has(entry.id)}
                editText={editingId === entry.id ? editText : ''}
                onDoubleClick={() => handleDoubleClick(entry)}
                onEditChange={setEditText}
                onEditKeyDown={(e) => handleEditKeyDown(e, entry.id)}
                onEditBlur={() => handleSave(entry.id)}
                onDelete={() => dispatchDeleteEvent(entry.id)}
                onUndo={() => dispatchUndoEvent(entry.id)}
              />
            ))}
            <div ref={bottomRef} />
          </>
        )}
      </div>
    </div>
  );
});
