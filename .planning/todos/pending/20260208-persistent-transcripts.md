---
created: 2026-02-08
title: Persistent Transcripts with IndexedDB
area: feature
priority: P2
version: v2.1
complexity: medium
estimate: 2-3 days
files:
  - src/services/storage/transcriptDB.ts
  - src/store/sessionHistoryStore.ts
  - src/components/settings/HistorySection.tsx
  - src/types/session.ts
---

## Problem

Currently, transcripts may only persist in memory or session storage, limiting:
- **Storage capacity:** chrome.storage.local has 5-10MB limits
- **Session history:** Can't review past interview sessions
- **Search capability:** No way to search through previous transcripts
- **Export/import:** Limited data portability
- **Recovery:** Lost on browser crash or extension reload

Users need persistent, searchable transcript history across sessions.

## User Requirements

- **Persistent storage:** Transcripts survive browser restarts
- **Unlimited history:** Store months of interview sessions
- **Fast access:** Quick retrieval of past sessions
- **Search functionality:** Find sessions by date, keywords, or metadata
- **Export capability:** Export individual or bulk sessions
- **Privacy:** Easy deletion of sensitive data
- **Performance:** No impact on real-time transcription

## Solution

### Storage Architecture Decision

**IndexedDB vs chrome.storage.local:**

| Feature | IndexedDB | chrome.storage.local |
|---------|-----------|---------------------|
| Capacity | ~100MB-1GB+ | 5-10MB (QUOTA_BYTES) |
| Performance | Fast, indexed queries | Slower for large data |
| Querying | Complex queries, indexes | Key-value only |
| Async API | ✓ | ✓ (both async) |
| Sync across devices | ✗ | ✓ (with chrome.storage.sync) |
| Use case | Large datasets | Small settings/config |

**Recommendation:** Use **IndexedDB** for transcripts (large data) + **chrome.storage.local** for metadata/references.

### IndexedDB Schema

```typescript
interface Session {
  id: string;                    // UUID
  startTime: number;             // Unix timestamp
  endTime?: number;              // Unix timestamp
  duration?: number;             // Seconds
  title: string;                 // Auto-generated or user-set
  metadata: SessionMetadata;
}

interface SessionMetadata {
  platform: string;              // "zoom", "meet", "teams", "other"
  participants?: string[];       // Speaker names
  tags: string[];                // User tags
  interviewType?: string;        // "technical", "behavioral", etc.
  companyName?: string;
  position?: string;
}

interface TranscriptSegment {
  id: string;
  sessionId: string;             // Foreign key to Session
  text: string;
  originalText?: string;         // If edited
  speaker: string;
  timestamp: number;             // Relative to session start
  endTimestamp?: number;
  confidence?: number;
  isEdited: boolean;
  comments?: Comment[];
}

interface LLMResponse {
  id: string;
  sessionId: string;             // Foreign key to Session
  type: 'fast' | 'full' | 'reasoning' | 'custom';
  prompt: string;
  response: string;
  model: string;
  timestamp: number;
  tokenUsage?: {
    input: number;
    output: number;
  };
  cost?: number;
}

// IndexedDB stores
const DB_NAME = 'ai-interview-assistant';
const DB_VERSION = 1;

const stores = {
  sessions: 'sessions',           // Primary session metadata
  transcripts: 'transcripts',     // All transcript segments
  responses: 'responses',         // LLM responses
  exports: 'exports'              // Export history
};
```

### Database Service

```typescript
class TranscriptDB {
  private db: IDBDatabase;

  async initialize(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // Sessions store
        const sessionStore = db.createObjectStore('sessions', { keyPath: 'id' });
        sessionStore.createIndex('startTime', 'startTime', { unique: false });
        sessionStore.createIndex('endTime', 'endTime', { unique: false });
        sessionStore.createIndex('tags', 'metadata.tags', { unique: false, multiEntry: true });

        // Transcripts store
        const transcriptStore = db.createObjectStore('transcripts', { keyPath: 'id' });
        transcriptStore.createIndex('sessionId', 'sessionId', { unique: false });
        transcriptStore.createIndex('timestamp', 'timestamp', { unique: false });
        transcriptStore.createIndex('speaker', 'speaker', { unique: false });

        // Responses store
        const responseStore = db.createObjectStore('responses', { keyPath: 'id' });
        responseStore.createIndex('sessionId', 'sessionId', { unique: false });
        responseStore.createIndex('type', 'type', { unique: false });
        responseStore.createIndex('timestamp', 'timestamp', { unique: false });
      };
    });
  }

  // Session CRUD
  async createSession(session: Session): Promise<void> {
    const tx = this.db.transaction('sessions', 'readwrite');
    await tx.objectStore('sessions').add(session);
  }

  async getSession(id: string): Promise<Session | undefined> {
    const tx = this.db.transaction('sessions', 'readonly');
    return tx.objectStore('sessions').get(id);
  }

  async updateSession(id: string, updates: Partial<Session>): Promise<void> {
    const tx = this.db.transaction('sessions', 'readwrite');
    const store = tx.objectStore('sessions');
    const session = await store.get(id);
    if (session) {
      await store.put({ ...session, ...updates });
    }
  }

  async deleteSession(id: string): Promise<void> {
    const tx = this.db.transaction(['sessions', 'transcripts', 'responses'], 'readwrite');

    // Delete session
    await tx.objectStore('sessions').delete(id);

    // Delete related transcripts
    const transcriptIndex = tx.objectStore('transcripts').index('sessionId');
    const transcripts = await transcriptIndex.getAll(id);
    for (const transcript of transcripts) {
      await tx.objectStore('transcripts').delete(transcript.id);
    }

    // Delete related responses
    const responseIndex = tx.objectStore('responses').index('sessionId');
    const responses = await responseIndex.getAll(id);
    for (const response of responses) {
      await tx.objectStore('responses').delete(response.id);
    }
  }

  // Search sessions
  async searchSessions(query: SessionSearchQuery): Promise<Session[]> {
    const tx = this.db.transaction('sessions', 'readonly');
    const store = tx.objectStore('sessions');

    let results: Session[];

    if (query.tags?.length) {
      // Search by tags
      const index = store.index('tags');
      const promises = query.tags.map(tag => index.getAll(tag));
      const arrays = await Promise.all(promises);
      results = arrays.flat();
    } else if (query.dateRange) {
      // Search by date range
      const index = store.index('startTime');
      const range = IDBKeyRange.bound(query.dateRange.start, query.dateRange.end);
      results = await index.getAll(range);
    } else {
      // Get all sessions
      results = await store.getAll();
    }

    // Full-text search in title/metadata (client-side filter)
    if (query.text) {
      const lowerQuery = query.text.toLowerCase();
      results = results.filter(session =>
        session.title.toLowerCase().includes(lowerQuery) ||
        session.metadata.companyName?.toLowerCase().includes(lowerQuery) ||
        session.metadata.position?.toLowerCase().includes(lowerQuery)
      );
    }

    // Sort by startTime descending (most recent first)
    results.sort((a, b) => b.startTime - a.startTime);

    return results;
  }

  // Transcript CRUD
  async addTranscriptSegment(segment: TranscriptSegment): Promise<void> {
    const tx = this.db.transaction('transcripts', 'readwrite');
    await tx.objectStore('transcripts').add(segment);
  }

  async getSessionTranscripts(sessionId: string): Promise<TranscriptSegment[]> {
    const tx = this.db.transaction('transcripts', 'readonly');
    const index = tx.objectStore('transcripts').index('sessionId');
    const segments = await index.getAll(sessionId);

    // Sort by timestamp
    return segments.sort((a, b) => a.timestamp - b.timestamp);
  }

  // LLM Response CRUD
  async addLLMResponse(response: LLMResponse): Promise<void> {
    const tx = this.db.transaction('responses', 'readwrite');
    await tx.objectStore('responses').add(response);
  }

  async getSessionResponses(sessionId: string): Promise<LLMResponse[]> {
    const tx = this.db.transaction('responses', 'readonly');
    const index = tx.objectStore('responses').index('sessionId');
    return index.getAll(sessionId);
  }

  // Storage management
  async getStorageUsage(): Promise<{ used: number; quota: number }> {
    if (navigator.storage && navigator.storage.estimate) {
      const estimate = await navigator.storage.estimate();
      return {
        used: estimate.usage || 0,
        quota: estimate.quota || 0
      };
    }
    return { used: 0, quota: 0 };
  }

  async clearOldSessions(daysToKeep: number): Promise<number> {
    const cutoffTime = Date.now() - (daysToKeep * 24 * 60 * 60 * 1000);
    const tx = this.db.transaction('sessions', 'readonly');
    const index = tx.objectStore('sessions').index('endTime');
    const range = IDBKeyRange.upperBound(cutoffTime);
    const oldSessions = await index.getAll(range);

    for (const session of oldSessions) {
      await this.deleteSession(session.id);
    }

    return oldSessions.length;
  }
}
```

### Integration with Current System

**During active session:**
```typescript
// Start new session
const session = await transcriptDB.createSession({
  id: generateUUID(),
  startTime: Date.now(),
  title: 'Interview Session',
  metadata: {
    platform: 'zoom',
    tags: [],
    interviewType: 'technical'
  }
});

// Save transcript segments in real-time
transcriptionService.on('segment', async (segment) => {
  await transcriptDB.addTranscriptSegment({
    ...segment,
    sessionId: session.id
  });

  // Also keep in memory for active session
  sessionStore.addSegment(segment);
});

// Save LLM responses
llmService.on('response', async (response) => {
  await transcriptDB.addLLMResponse({
    ...response,
    sessionId: session.id
  });
});

// End session
await transcriptDB.updateSession(session.id, {
  endTime: Date.now(),
  duration: (Date.now() - session.startTime) / 1000
});
```

### UI Components

**Settings → History:**
```tsx
function HistorySection() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [storageUsage, setStorageUsage] = useState({ used: 0, quota: 0 });

  return (
    <div>
      <h2>Session History</h2>

      {/* Storage usage */}
      <StorageUsageBar
        used={storageUsage.used}
        quota={storageUsage.quota}
      />

      {/* Search */}
      <SearchBar
        value={searchQuery}
        onChange={setSearchQuery}
        placeholder="Search sessions..."
      />

      {/* Filters */}
      <FilterBar>
        <DateRangePicker />
        <TagFilter />
        <TypeFilter />
      </FilterBar>

      {/* Session list */}
      <SessionList sessions={sessions}>
        {sessions.map(session => (
          <SessionCard
            key={session.id}
            session={session}
            onView={() => viewSession(session.id)}
            onExport={() => exportSession(session.id)}
            onDelete={() => deleteSession(session.id)}
          />
        ))}
      </SessionList>

      {/* Bulk actions */}
      <BulkActions>
        <Button onClick={exportAllSessions}>Export All</Button>
        <Button onClick={clearOldSessions}>Clear Old Sessions</Button>
        <Button onClick={clearAllData} variant="destructive">
          Clear All Data
        </Button>
      </BulkActions>
    </div>
  );
}
```

**Session Viewer:**
```tsx
function SessionViewer({ sessionId }: { sessionId: string }) {
  const [session, setSession] = useState<Session>();
  const [transcripts, setTranscripts] = useState<TranscriptSegment[]>([]);
  const [responses, setResponses] = useState<LLMResponse[]>([]);

  return (
    <div>
      <SessionHeader session={session} />

      <Tabs>
        <Tab label="Transcript">
          <TranscriptView segments={transcripts} />
        </Tab>

        <Tab label="AI Responses">
          <ResponsesView responses={responses} />
        </Tab>

        <Tab label="Metadata">
          <MetadataEditor session={session} />
        </Tab>
      </Tabs>

      <SessionActions>
        <Button onClick={exportSession}>Export</Button>
        <Button onClick={shareSession}>Share</Button>
        <Button onClick={deleteSession} variant="destructive">
          Delete
        </Button>
      </SessionActions>
    </div>
  );
}
```

### Export Functionality

**Export formats:**
- JSON (full data)
- Markdown (readable)
- TXT (plain text transcript)
- CSV (for analysis)

```typescript
async function exportSession(sessionId: string, format: ExportFormat): Promise<Blob> {
  const session = await transcriptDB.getSession(sessionId);
  const transcripts = await transcriptDB.getSessionTranscripts(sessionId);
  const responses = await transcriptDB.getSessionResponses(sessionId);

  switch (format) {
    case 'json':
      return new Blob([JSON.stringify({ session, transcripts, responses }, null, 2)], {
        type: 'application/json'
      });

    case 'markdown':
      return generateMarkdownExport(session, transcripts, responses);

    case 'txt':
      return generateTextExport(transcripts);

    case 'csv':
      return generateCSVExport(transcripts);
  }
}
```

### Auto-cleanup Strategy

**Settings → History → Auto-cleanup:**
```
┌─────────────────────────────────────┐
│ Auto-cleanup Settings               │
├─────────────────────────────────────┤
│ ☑ Enable auto-cleanup               │
│                                     │
│ Keep sessions for: [90 days ▼]      │
│                                     │
│ Storage usage: 45 MB / 100 MB       │
│ [█████████░░░░░░░░░] 45%            │
│                                     │
│ Cleanup actions:                    │
│ • Delete sessions older than 90 days│
│ • Compress old transcripts          │
│ • Archive to cloud (optional)       │
│                                     │
│ [Run Cleanup Now]                   │
└─────────────────────────────────────┘
```

### Privacy & Security

**Data deletion:**
- Immediate deletion from IndexedDB
- No cloud backup by default
- Optional: Encrypted export for archival
- Clear all data option in Settings

**User control:**
- Disable history tracking
- Auto-delete after each session
- Selective deletion by date/tags
- Export before delete

### Implementation Steps

1. **Create IndexedDB service**
   - Database schema and initialization
   - CRUD operations for sessions/transcripts/responses
   - Search and filtering

2. **Integrate with existing stores**
   - Hook into transcription service
   - Hook into LLM service
   - Session lifecycle management

3. **Build History UI**
   - Session list view
   - Session detail viewer
   - Search and filters
   - Storage usage display

4. **Implement export functionality**
   - Multiple format support
   - Bulk export
   - Download handling

5. **Add auto-cleanup**
   - Background job for old sessions
   - Storage quota management
   - User configuration

6. **Testing**
   - Large dataset performance
   - Search accuracy
   - Export correctness
   - Cleanup effectiveness

### Performance Considerations

- **Batch writes:** Buffer transcript segments and write in batches
- **Lazy loading:** Don't load all sessions at once, paginate
- **Indexing:** Proper indexes for common queries
- **Memory management:** Clear old session data from memory after save
- **Background sync:** Don't block UI during writes

### Dependencies

- Existing transcription service
- Existing LLM service
- Session management
- Storage utilities

### Testing Checklist

- [ ] IndexedDB initialized correctly
- [ ] Create session works
- [ ] Save transcript segments
- [ ] Save LLM responses
- [ ] Search by date range
- [ ] Search by tags
- [ ] Search by text query
- [ ] View session details
- [ ] Export to JSON
- [ ] Export to Markdown
- [ ] Export to TXT
- [ ] Export to CSV
- [ ] Delete session (cascading)
- [ ] Bulk delete
- [ ] Auto-cleanup runs
- [ ] Storage usage accurate
- [ ] Performance with 100+ sessions
- [ ] Performance with 1000+ transcript segments
- [ ] Memory usage reasonable
- [ ] No impact on real-time transcription

### Future Enhancements

- Cloud sync (optional)
- Encryption at rest
- Full-text search (more advanced)
- Session analytics (speaking time, word count, etc.)
- Session replay with timeline
- Compare sessions (diff view)
