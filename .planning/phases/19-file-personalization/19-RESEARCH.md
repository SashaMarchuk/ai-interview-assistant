# Phase 19: File Personalization - Research

**Researched:** 2026-02-09
**Domain:** PDF text extraction, IndexedDB storage, LLM prompt injection, Chrome extension file handling
**Confidence:** HIGH

## Summary

Phase 19 requires building a file upload pipeline in the popup settings that lets users upload a resume (PDF/TXT) and paste or upload a job description, extracts text client-side, stores the extracted text in IndexedDB, and injects that context into LLM prompts via the existing `PromptBuilder`. The phase touches four code areas: (1) popup settings UI for file upload/paste, (2) PDF text extraction service, (3) IndexedDB storage layer, and (4) PromptBuilder modification for file context injection.

The existing codebase has a clean `PromptBuilder` that uses `$variable` substitution (via `promptSubstitution.ts`). New variables `$resume` and `$jobDescription` can be added to `PromptVariables` and injected into the system prompt rather than user prompt -- this ensures every request benefits from the user's background without modifying per-question user prompts. IndexedDB is not yet used in the codebase (Phase 17 used in-memory cost tracking; Phase 18 would establish IndexedDB patterns for cost records). For this phase, the `idb` library (Jake Archibald, ~1.19KB gzipped) provides a Promise-based wrapper around IndexedDB that eliminates callback complexity.

**Primary recommendation:** Use `pdfjs-dist` for PDF text extraction (the industry standard, maintained by Mozilla, ~2M weekly downloads), `idb` for IndexedDB operations, store extracted text in IndexedDB keyed by type ('resume' | 'jobDescription'), and inject file context into the system prompt via new `$resume` and `$jobDescription` variables in `PromptBuilder`.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| pdfjs-dist | ^5.4.x | Client-side PDF text extraction | Mozilla's PDF.js; 2M+ weekly npm downloads; industry standard for browser-side PDF processing; no server needed |
| idb | ^8.x | Promise-based IndexedDB wrapper | Jake Archibald (Chrome team); ~1.19KB gzipped; TypeScript-first; mirrors native API with promises |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| No additional libraries | - | TXT file reading uses native FileReader API | Built into all browsers |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| pdfjs-dist | unpdf | unpdf wraps pdfjs-dist with simpler API, but adds abstraction layer; pdfjs-dist is more direct, well-documented, and we only need `getDocument` + `getTextContent` |
| pdfjs-dist | pdf-parse | Node.js focused; not well-suited for browser/extension contexts |
| idb | Raw IndexedDB API | Raw API uses callbacks and IDBRequest objects; error-prone and verbose; idb's promise wrapper is tiny and prevents bugs |
| idb | Dexie.js | Dexie is more powerful (~12KB gzipped) but overkill for 2 simple key-value records |

**Installation:**
```bash
npm install pdfjs-dist idb
```

## Architecture Patterns

### Recommended File Changes
```
src/
  services/
    fileStorage/
      fileStorageDB.ts     # NEW: IndexedDB init, CRUD for resume/JD text
      pdfExtractor.ts      # NEW: PDF text extraction using pdfjs-dist
      index.ts             # NEW: Barrel export
  components/
    settings/
      FileUploadSettings.tsx  # NEW: Resume upload + JD paste/upload UI
  services/llm/
    PromptBuilder.ts       # MODIFY: Add $resume and $jobDescription variables
  utils/
    promptSubstitution.ts  # MODIFY: Add resume/jobDescription to PromptVariables interface
  types/
    messages.ts            # MODIFY (optional): Add FILE_CONTEXT message if background needs file data
entrypoints/
  popup/App.tsx            # MODIFY: Add FileUploadSettings to settings tab
  background.ts            # MODIFY: Read file context from IndexedDB before building prompts
```

### Pattern 1: IndexedDB File Storage with `idb`
**What:** A small IndexedDB database (`file-personalization`) with a single object store (`files`) for resume and job description text.
**When to use:** Every time the user uploads/updates/deletes a resume or JD.

```typescript
// Source: idb library API (https://github.com/jakearchibald/idb)
import { openDB, type IDBPDatabase } from 'idb';

interface FileRecord {
  type: 'resume' | 'jobDescription';
  text: string;
  fileName?: string;
  updatedAt: number;
}

interface FilePersonalizationDB {
  files: {
    key: string; // 'resume' | 'jobDescription'
    value: FileRecord;
  };
}

let dbPromise: Promise<IDBPDatabase<FilePersonalizationDB>> | null = null;

function getDB(): Promise<IDBPDatabase<FilePersonalizationDB>> {
  if (!dbPromise) {
    dbPromise = openDB<FilePersonalizationDB>('file-personalization', 1, {
      upgrade(db) {
        db.createObjectStore('files', { keyPath: 'type' });
      },
    });
  }
  return dbPromise;
}

export async function saveFileContent(record: FileRecord): Promise<void> {
  const db = await getDB();
  await db.put('files', record);
}

export async function getFileContent(type: 'resume' | 'jobDescription'): Promise<FileRecord | undefined> {
  const db = await getDB();
  return db.get('files', type);
}

export async function deleteFileContent(type: 'resume' | 'jobDescription'): Promise<void> {
  const db = await getDB();
  await db.delete('files', type);
}
```

### Pattern 2: PDF Text Extraction
**What:** Client-side extraction of text from PDF files using `pdfjs-dist`.
**When to use:** When user uploads a .pdf file via the popup file picker.

```typescript
// Source: pdfjs-dist API + Vite worker config
import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.mjs?url';

// Configure worker (Vite's ?url import resolves the worker path at build time)
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

export async function extractTextFromPDF(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const typedArray = new Uint8Array(arrayBuffer);

  const pdf = await pdfjsLib.getDocument(typedArray).promise;

  const pages: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const pageText = textContent.items
      .map((item) => ('str' in item ? item.str : ''))
      .join(' ');
    pages.push(pageText);
  }

  return pages.join('\n\n');
}
```

### Pattern 3: PromptBuilder File Context Injection
**What:** Inject resume and JD text into the system prompt so every LLM request benefits from personalization.
**When to use:** Every LLM request when resume/JD data exists.

The key architectural decision is **where** to inject file context:

**Option A: System prompt injection (RECOMMENDED)**
- Append file context to the system prompt template before variable substitution
- Pro: Always present regardless of template, invisible to user template customization
- Pro: System prompt is the right semantic place for "who is the user"

**Option B: Add new $variables to user prompt templates**
- Require users to add `$resume` and `$jobDescription` to their custom templates
- Con: Breaks existing templates, burdens users

**Option C: Separate "context" message in the messages array**
- Add a third message (role: 'user' or 'system') with file context
- Con: Not all providers handle multi-system-message well

```typescript
// Recommended: Pattern A - system prompt augmentation
export function buildPrompt(
  request: DualLLMRequest,
  template: PromptTemplate,
  fileContext?: { resume?: string; jobDescription?: string },
): BuildPromptResult {
  const variables: PromptVariables = {
    highlighted: request.question,
    recent: request.recentContext,
    transcript: request.fullTranscript,
  };

  let systemPrompt = substituteVariables(template.systemPrompt, variables);

  // Append file context to system prompt if available
  if (fileContext?.resume || fileContext?.jobDescription) {
    const contextParts: string[] = [];

    if (fileContext.resume) {
      contextParts.push(`\n\n## Candidate Background\nThe candidate has the following resume/background:\n${fileContext.resume}`);
    }
    if (fileContext.jobDescription) {
      contextParts.push(`\n\n## Target Role\nThe candidate is interviewing for this position:\n${fileContext.jobDescription}`);
    }

    systemPrompt += contextParts.join('');
  }

  const baseUserPrompt = substituteVariables(template.userPromptTemplate, variables);
  const user = baseUserPrompt + FAST_HINT_INSTRUCTION;
  const userFull = baseUserPrompt + FULL_ANSWER_INSTRUCTION;

  return { system: systemPrompt, user, userFull };
}
```

### Pattern 4: Background Service Worker Reading IndexedDB
**What:** The background service worker reads file context from IndexedDB before building prompts.
**When to use:** On every `LLM_REQUEST` message handler.

```typescript
// In background.ts handleLLMRequest():
import { getFileContent } from '../src/services/fileStorage';

// Read file context from IndexedDB
const [resumeRecord, jdRecord] = await Promise.all([
  getFileContent('resume'),
  getFileContent('jobDescription'),
]);

const fileContext = {
  resume: resumeRecord?.text,
  jobDescription: jdRecord?.text,
};

// Pass to buildPrompt
const prompts = buildPrompt(
  { question, recentContext, fullTranscript, templateId },
  template,
  fileContext,
);
```

### Pattern 5: File Upload UI Component
**What:** A settings section in the popup with file picker for resume and textarea for JD.
**When to use:** In popup settings tab.

Key UI elements:
- File input accepting `.pdf,.txt` for resume
- Textarea for job description (paste) with optional file upload
- Preview/status showing extracted text length and file name
- Delete button to remove uploaded content
- Loading state during PDF extraction

### Anti-Patterns to Avoid

- **Storing file content in Zustand:** Per roadmap decision, file content goes to IndexedDB. Zustand syncs across contexts via webext-zustand, and large text blobs would bloat sync payloads.
- **Storing the raw File/Blob:** Store extracted text only, not binary data. Text is what gets injected into prompts.
- **Using `unsafe-eval` for PDF.js worker:** The extension CSP already includes `'wasm-unsafe-eval'` which is sufficient. PDF.js workers don't need `unsafe-eval`.
- **Injecting file context into user prompt template:** System prompt is the correct place for persistent user context. User prompts should remain question-specific.
- **Reading IndexedDB in content script:** Content scripts run in the web page origin, not the extension origin. IndexedDB must be read from background or popup context (extension pages share the same origin).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| PDF text extraction | Custom PDF parser | pdfjs-dist | PDF is a complex format with fonts, encodings, compression; pdfjs-dist handles all edge cases |
| IndexedDB promises | Manual IDBRequest wrapping | idb library | Raw IndexedDB is callback-based and error-prone; idb is 1.19KB and battle-tested |
| File type detection | Extension parsing / magic bytes | Accept attribute on input + file.name check | HTML5 file input `accept` attribute handles filtering; file.name check for validation |

**Key insight:** PDF extraction is deceptively complex. Even "simple" PDFs have multi-byte encodings, embedded fonts, and variable text ordering. Never attempt manual PDF binary parsing.

## Common Pitfalls

### Pitfall 1: pdfjs-dist Worker Configuration with Vite
**What goes wrong:** PDF.js requires a web worker for processing. Vite's module system doesn't automatically resolve the worker path from node_modules.
**Why it happens:** pdfjs-dist's worker is a separate file that needs to be loaded at runtime, but Vite doesn't bundle workers from node_modules by default.
**How to avoid:** Use Vite's `?url` import suffix: `import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.mjs?url'`. This tells Vite to emit the file and return its URL. Then set `pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker`.
**Warning signs:** Console error "No GlobalWorkerOptions.workerSrc specified" or "Setting up fake worker" (works but is slow).

### Pitfall 2: IndexedDB Not Accessible from Content Scripts
**What goes wrong:** If you try to read file context from IndexedDB in the content script, you get the wrong database (web page origin, not extension origin).
**Why it happens:** Content scripts share the DOM origin of the web page (meet.google.com), not the extension origin.
**How to avoid:** Read IndexedDB only from background service worker or popup. The background already reads store state for API keys; add IndexedDB read for file context in the same `handleLLMRequest` function.
**Warning signs:** `getFileContent()` returns `undefined` in content script even after uploading files in popup.

### Pitfall 3: Token Budget Overflow with Large Resume + JD
**What goes wrong:** A typical resume is ~1,600 tokens. A detailed JD adds ~800 tokens. Combined with transcript context (~2,000 tokens), the system prompt can grow beyond the model's effective context window.
**Why it happens:** File context is appended to system prompt, which already contains template instructions.
**How to avoid:** Truncate resume text to a reasonable limit (e.g., 8,000 characters / ~2,000 tokens) and JD text to 4,000 characters (~1,000 tokens). Show character count in the UI preview. Modern models (GPT-4o, GPT-5) have 128K+ context windows, so this is primarily a cost concern, not a capability concern.
**Warning signs:** Unusually high token costs for simple questions.

### Pitfall 4: PDF.js Worker CSP Violation in Extension
**What goes wrong:** PDF.js worker fails to initialize due to Content Security Policy restrictions.
**Why it happens:** Some PDF.js worker configurations require dynamic code execution.
**How to avoid:** The extension already has `'wasm-unsafe-eval'` in its CSP (wxt.config.ts). For `worker-src`, Chrome MV3 falls back to `script-src` which allows `'self'`. Since the worker file is bundled with the extension (via Vite's `?url` import), it loads from the extension origin and passes CSP.
**Warning signs:** Console error about CSP violation in worker context.

### Pitfall 5: Popup Closes During PDF Processing
**What goes wrong:** User selects a large PDF, but closes the popup before extraction completes. The extracted text is never saved.
**Why it happens:** Chrome extension popups are destroyed when closed. Any in-progress async operation is cancelled.
**How to avoid:** Show a loading indicator during extraction. For very large PDFs, consider extracting and saving immediately after reading each page (progressive save), though for typical resumes (1-5 pages) this is unlikely to be an issue.
**Warning signs:** User reports that uploaded resume "disappears" after closing and reopening popup.

### Pitfall 6: PDF with No Extractable Text (Scanned Images)
**What goes wrong:** PDF.js extracts zero text from a scanned/image-based PDF. User sees empty preview.
**Why it happens:** PDF.js extracts embedded text content, not OCR from images. Scanned PDFs contain images, not text objects.
**How to avoid:** After extraction, check if text length is very short (< 50 chars for a multi-page PDF). Show a warning: "This PDF appears to be scanned/image-based. Please use a text-based PDF or paste your resume text directly."
**Warning signs:** Empty or near-empty text preview after uploading a PDF.

## Code Examples

### Example 1: File Upload Settings Component
```typescript
// FileUploadSettings.tsx
function FileUploadSettings() {
  const [resumeStatus, setResumeStatus] = useState<string>('');
  const [jdText, setJdText] = useState<string>('');
  const [isExtracting, setIsExtracting] = useState(false);

  // Load existing data from IndexedDB on mount
  useEffect(() => {
    getFileContent('resume').then((record) => {
      if (record) setResumeStatus(`${record.fileName} (${record.text.length} chars)`);
    });
    getFileContent('jobDescription').then((record) => {
      if (record) setJdText(record.text);
    });
  }, []);

  async function handleResumeUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsExtracting(true);
    try {
      let text: string;
      if (file.name.endsWith('.pdf')) {
        text = await extractTextFromPDF(file);
      } else {
        text = await file.text();
      }

      // Warn if extraction yielded very little text
      if (text.trim().length < 50) {
        setResumeStatus('Warning: Very little text extracted. Is this a scanned PDF?');
        return;
      }

      await saveFileContent({
        type: 'resume',
        text: text.slice(0, 8000), // Truncate to ~2K tokens
        fileName: file.name,
        updatedAt: Date.now(),
      });
      setResumeStatus(`${file.name} (${Math.min(text.length, 8000)} chars)`);
    } catch (error) {
      setResumeStatus('Error extracting text from file');
      console.error('Resume extraction error:', error);
    } finally {
      setIsExtracting(false);
    }
  }

  async function handleJdSave() {
    if (!jdText.trim()) {
      await deleteFileContent('jobDescription');
      return;
    }
    await saveFileContent({
      type: 'jobDescription',
      text: jdText.slice(0, 4000),
      updatedAt: Date.now(),
    });
  }

  // ... render UI
}
```

### Example 2: TXT File Reading (No Library Needed)
```typescript
// Built-in File API -- no library needed
async function extractTextFromTXT(file: File): Promise<string> {
  return file.text(); // Returns a Promise<string> natively
}
```

### Example 3: Vite Worker Import for pdfjs-dist
```typescript
// This specific import syntax tells Vite to:
// 1. Copy the worker file to the build output
// 2. Return the resolved URL as a string
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.mjs?url';

// Then configure PDF.js to use it
import * as pdfjsLib from 'pdfjs-dist';
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Server-side PDF processing | Client-side pdfjs-dist | Always available | No backend needed; works in extension context |
| Storing files in chrome.storage | IndexedDB for large content | Chrome MV3 best practice | chrome.storage has 5MB quota; IndexedDB has no practical limit |
| OpenAI Files API for file context | Client-side extraction + prompt injection | Cross-provider requirement | Works with any LLM provider (OpenAI, OpenRouter, etc.) |
| Raw IndexedDB API | idb library (Promise wrapper) | idb v7+ | Eliminates callback hell; TypeScript generics for type safety |

**Deprecated/outdated:**
- OpenAI Files API: Had a September 2025 regression for Chat Completions. Client-side extraction is more reliable and cross-provider compatible.
- pdf-parse npm package: Node.js focused, uses fs module, not suitable for browser/extension contexts.

## Key Architectural Decisions for Planner

### 1. Where to store file content
- **IndexedDB** (per roadmap decision). NOT Zustand/chrome.storage.
- Popup writes to IndexedDB when user uploads/pastes.
- Background reads from IndexedDB when processing LLM requests.
- Both share the same extension origin -- same database.

### 2. Where to inject file context in prompts
- **System prompt augmentation** (append to system prompt after template substitution).
- Not new $variables in user templates (would break existing custom templates).
- Not a separate message in the chat array (provider compatibility concerns).

### 3. Where to run PDF extraction
- **Popup context** (popup.html / extension page). Has full DOM access, File API, web worker support.
- NOT background service worker (no DOM, complex worker-in-worker issues).
- NOT content script (runs in web page origin, PDF.js worker CSP may conflict).

### 4. File size / token limits
- Resume: Truncate to 8,000 characters (~2,000 tokens). Typical resumes are 1,200-2,000 words.
- Job Description: Truncate to 4,000 characters (~1,000 tokens). Typical JDs are 500-1,000 words.
- Combined overhead per request: ~3,000 tokens. Acceptable for models with 128K+ context windows.

### 5. UI placement
- New **"Personalization"** section in popup settings tab (between existing sections).
- Resume: File input (`.pdf, .txt`) + preview text snippet + delete button.
- Job Description: Textarea (paste) + optional file upload + save button + delete button.

## Open Questions

1. **pdfjs-dist Worker Path with WXT/Vite Build**
   - What we know: Vite's `?url` import works for standard Vite projects. WXT uses Vite internally.
   - What's unclear: Whether WXT's build pipeline (which processes entrypoints separately) handles the `?url` worker import correctly for popup entrypoint.
   - Recommendation: Test during implementation. Fallback: copy worker file to `public/` directory and reference it with a static path. Second fallback: use `pdfjsLib.GlobalWorkerOptions.workerPort` with inline worker.

2. **IndexedDB Initialization Race with Background Service Worker**
   - What we know: Background service worker reads IndexedDB for file context. It already has an init chain (encryption -> circuit breaker -> store).
   - What's unclear: Whether adding IndexedDB read to `handleLLMRequest` adds noticeable latency.
   - Recommendation: Read lazily (on first LLM request), cache in module-level variable, invalidate cache via a lightweight signal from popup when files change. Alternatively, just read on every request -- IndexedDB reads of 2 small records are fast (~1ms).

3. **Parallel Phase Conflict with Phase 18 (Cost Dashboard)**
   - What we know: Phase 18 also uses IndexedDB (for cost records). Phase 19 uses a separate database name.
   - What's unclear: Whether both phases modify `background.ts` in conflicting ways.
   - Recommendation: Phase 19's `background.ts` changes are limited to `handleLLMRequest` (adding 2 lines to read file context). Phase 18's changes are to the cost message handler (different function). No conflict expected if different database names are used.

## Sources

### Primary (HIGH confidence)
- pdfjs-dist npm: https://www.npmjs.com/package/pdfjs-dist -- v5.4.624, 2M+ weekly downloads
- idb GitHub: https://github.com/jakearchibald/idb -- Promise-based IndexedDB wrapper, TypeScript-first
- MDN IndexedDB: https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API/Using_IndexedDB -- API reference
- Existing codebase: `PromptBuilder.ts`, `promptSubstitution.ts`, `background.ts`, `popup/App.tsx`, `store/types.ts`
- Chrome MV3 CSP docs: https://developer.chrome.com/docs/extensions/reference/manifest/content-security-policy

### Secondary (MEDIUM confidence)
- pdfjs-dist Vite worker config: https://github.com/mozilla/pdf.js/discussions/19520 -- `?url` import workaround
- pdfjs-dist text extraction example: https://iamvkr.in/posts/extract-text-from-pdf-react/ -- React FileReader pattern
- Chrome extensions IndexedDB sharing: https://groups.google.com/a/chromium.org/g/chromium-extensions/c/wdiKamQkapY -- popup/background share extension origin
- Token estimation for resumes: https://www.resumly.ai/blog/why-llm-context-windows-matter-for-resume-analysis -- ~1,600 tokens for typical resume

### Tertiary (LOW confidence)
- unpdf alternative: https://github.com/unjs/unpdf -- Simpler API wrapper over pdfjs-dist, but adds abstraction; not recommended over direct pdfjs-dist usage for this use case.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- pdfjs-dist is the undisputed standard for browser PDF processing; idb is the standard IndexedDB wrapper
- Architecture: HIGH -- file storage + prompt injection is a well-understood pattern; extension origin sharing verified
- Pitfalls: HIGH -- worker configuration and IndexedDB origin issues are well-documented in community reports
- Token budgets: MEDIUM -- resume/JD token estimates are approximate; real-world variation exists

**Research date:** 2026-02-09
**Valid until:** 2026-03-09 (30 days; stable domain, libraries are mature)
