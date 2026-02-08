---
created: 2026-02-08
title: Transcript Editing - Inline Corrections & Comments
area: feature
priority: P1
version: v2.0
complexity: medium
estimate: 2 days
files:
  - src/components/overlay/TranscriptSegment.tsx
  - src/components/overlay/TranscriptEditor.tsx
  - src/store/transcriptStore.ts
  - src/types/transcript.ts
---

## Problem

STT (Speech-to-Text) is not perfect. Users need ability to correct transcription errors, add notes/comments, and refine the transcript before sending to LLM or exporting.

## User Requirements

- **Inline editing:** Click on transcript segment to edit text
- **Comments/notes:** Attach comments to specific segments
- **Delete segments:** Remove irrelevant or incorrect parts
- **Visual indicators:**
  - Edited segments (different color/icon)
  - Segments with comments (icon)
- **Persistence:** Save edits in session storage
- **Export:** Include edits in final transcript export

## Solution

### Architecture

1. **Enhanced Transcript Schema**
   ```typescript
   interface TranscriptSegment {
     id: string;
     text: string;
     originalText?: string; // if edited, keep original
     speaker: string;
     timestamp: number;
     isEdited: boolean;
     comments: Comment[];
     isDeleted: boolean; // soft delete
   }

   interface Comment {
     id: string;
     text: string;
     createdAt: number;
   }
   ```

2. **Storage Strategy**
   - Store edited transcripts in chrome.storage.local
   - Key: `transcript_edits_${sessionId}`
   - Merge with original transcript on load
   - Clean up old session edits after 30 days

3. **UI Components**
   - **Editable Segment:**
     - Click to enter edit mode (contentEditable or input)
     - Escape to cancel, Enter to save
     - Show "edited" badge when modified
   - **Comment UI:**
     - Comment icon button on each segment
     - Popover for adding/viewing comments
     - Comment counter badge
   - **Delete Action:**
     - Trash icon with confirmation
     - Soft delete (can restore via undo)

### Implementation Steps

1. Update TranscriptSegment type with editing fields
2. Create TranscriptEditor component
   - Inline edit mode
   - Save/cancel handlers
   - Visual edit indicators
3. Implement comment system
   - Comment popover component
   - Add/delete comment handlers
4. Add delete functionality
   - Soft delete flag
   - Filter deleted segments from display
   - Undo mechanism
5. Update transcriptStore
   - Track edits separately
   - Merge edits on render
   - Persist to storage
6. Export functionality
   - Include edits in export
   - Option to export original vs edited
   - Show edit history in export

### UI/UX Details

- **Edit Mode:**
  - Segment background changes (light yellow)
  - Cursor appears in text
  - Save/Cancel buttons appear
- **Edited Indicator:**
  - Small "edited" badge or pencil icon
  - Tooltip shows original text on hover
- **Comment Icon:**
  - Speech bubble icon
  - Badge shows comment count
  - Click opens comment popover
- **Deleted Segments:**
  - Fade out with strikethrough
  - "Restore" button (undo delete)
  - Permanent delete after session ends

### Integration Points

- **LLM Prompts:** Use edited transcript, not original
- **Export (future v2.0+):** Include edit metadata
- **Session history:** Associate edits with session

### Technical Notes

- **contentEditable considerations:**
  - Or use controlled input for better control
  - Handle multiline text properly
  - Preserve formatting
- **Undo/Redo (optional enhancement):**
  - Simple undo stack for recent edits
  - Ctrl+Z support
- **Conflict handling:**
  - If new STT segment arrives during edit, handle gracefully
  - Timestamp-based merge logic

### Keyboard Shortcuts

- **Enter edit mode:** Click or F2 on focused segment
- **Save edit:** Enter
- **Cancel edit:** Escape
- **Delete segment:** Delete key (with confirmation)
- **Add comment:** Ctrl+M (or click icon)

### Accessibility

- **Keyboard navigation:** Tab through segments
- **Screen reader support:** Announce edit state
- **Focus management:** Return focus after edit/delete

### Dependencies

- Existing transcriptStore
- chrome.storage.local
- UI component library (for popover/tooltip)

### Testing Checklist

- [ ] Click segment to edit
- [ ] Edit text and save
- [ ] Cancel edit restores original
- [ ] Edited badge appears
- [ ] Hover shows original text
- [ ] Add comment to segment
- [ ] View/delete comments
- [ ] Comment badge shows count
- [ ] Delete segment (soft delete)
- [ ] Restore deleted segment
- [ ] Edits persist across page reloads
- [ ] Edited transcript used in LLM prompts
- [ ] Export includes edits
- [ ] Multiple edits to same segment work
- [ ] Keyboard shortcuts work
- [ ] Accessibility features work
