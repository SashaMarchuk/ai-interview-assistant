---
created: 2026-02-08
title: File Personalization - Upload & Context Injection
area: feature
priority: P0
version: v2.0
complexity: medium
estimate: 2-3 days
files:
  - src/services/llm/openai.ts
  - src/components/settings/FilesSection.tsx
  - src/types/files.ts
  - src/store/filesStore.ts
---

## Problem

Users need to personalize AI responses by uploading contextual files (resume, job descriptions, project docs). Currently, there's no way to provide persistent context to the LLM beyond the immediate conversation.

## User Requirements

- **Supported formats:** TXT, MD, DOCX, PDF (anything OpenAI Files API can parse)
- **Multiple files:** Upload several files at once
- **Persistent storage:** Files uploaded to OpenAI Files API (one-time upload, reuse file_id)
- **Global toggle:** Checkbox in Settings: "Include uploaded files in prompts"
- **Validation:** Block upload if no OpenAI API key configured
- **Per-file metadata:**
  - Description (what this file contains)
  - Prompt instruction (what to tell LLM when file is active)

## Solution

### Architecture

1. **OpenAI Files API Integration**
   - Upload endpoint: `POST /v1/files`
   - Store file_id + metadata in chrome.storage.local
   - Automatic file_id injection to LLM requests when checkbox enabled

2. **Storage Schema**
   ```typescript
   interface UploadedFile {
     id: string;
     fileId: string; // OpenAI file_id
     name: string;
     description: string;
     promptInstruction: string;
     uploadedAt: number;
     size: number;
     mimeType: string;
   }
   ```

3. **UI Components**
   - Settings → Files section
   - Upload button (multi-file support)
   - File list with:
     - Name, size, upload date
     - Description editor
     - Prompt instruction editor
     - Delete button (removes from OpenAI + local storage)
   - Global checkbox: "Include files in all prompts"

4. **LLM Integration**
   - Modify prompt construction to inject file context
   - Add file_id to OpenAI API requests when checkbox active
   - Fallback: if file deleted from OpenAI but still in local storage, show warning

### Implementation Steps

1. Create filesStore (Zustand + webext-zustand)
2. Implement OpenAI Files API client methods
3. Build FilesSection UI component
4. Integrate file context injection into LLM service
5. Add validation and error handling
6. Update Settings page routing

### Use Cases

- **Resume context:** Upload resume → AI mentions relevant experience
- **Job description:** Upload JD → tailored interview responses
- **Project docs:** Upload architecture docs → context-aware technical answers

### Technical Notes

- OpenAI Files API has file size limits (check current limits)
- Consider rate limiting for uploads
- Handle file deletion from OpenAI gracefully (404 errors)
- Store metadata for analytics (cost tracking integration)

### Dependencies

- Existing OpenAI API integration
- chrome.storage.local for file metadata
- File upload UI components (drag-drop optional)

### Testing Checklist

- [ ] Upload single file
- [ ] Upload multiple files
- [ ] Edit description/prompt
- [ ] Delete file (both local + OpenAI)
- [ ] Toggle global checkbox
- [ ] Verify file context in LLM prompts
- [ ] Handle missing API key
- [ ] Handle OpenAI API errors
- [ ] Verify file persistence across sessions
