# Phase 18: Cost Dashboard - Research

**Researched:** 2026-02-09
**Domain:** IndexedDB persistence, recharts data visualization, Chrome MV3 popup UI, cost data aggregation
**Confidence:** HIGH

## Summary

Phase 18 takes the in-memory, per-session cost data captured in Phase 17 and persists it to IndexedDB for historical tracking, then visualizes it in a new "Cost" tab in the popup settings UI using recharts (SVG-based charts). The core challenge is bridging two contexts: the background service worker (which computes cost per LLM request) must write cost records to IndexedDB, while the popup (which renders charts) must read and aggregate them. Both contexts share the same IndexedDB database in Chrome MV3 extensions -- no cross-context messaging is needed for storage access.

The current `LLM_COST` message contains token counts and cost in USD but is missing the model ID and provider ID. These fields must be added to the message type (or the background must write to IndexedDB directly) so that cost records can include per-provider and per-model breakdowns as required by COST-04. The popup UI adds a fourth tab ("Cost") alongside Capture, Settings, and Templates, with recharts rendering three chart types: daily cost bar chart, model/provider breakdown pie chart, and a per-session summary list.

**Primary recommendation:** Write cost records to IndexedDB from the background service worker using a thin promise-based wrapper (native IndexedDB or `idb` at ~1KB). Add a "Cost" tab to the popup that lazy-loads recharts and reads from IndexedDB on mount. Enrich the `LLM_COST` message with `modelId` and `providerId` fields so cost records have the required per-provider breakdown.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `recharts` | ^3.7.0 | SVG-based React charts (BarChart, PieChart) | Declarative JSX API, SVG rendering (no CSP issues), most popular React chart library (4M+/week), v3 has improved state management |
| Native IndexedDB | Browser API | Persistent cost record storage | Zero dependencies, supports indexed queries, shared between popup and service worker, no size limit |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `idb` | ^8.x | Promise-based IndexedDB wrapper | Optional -- if native IndexedDB boilerplate is too verbose; ~1KB gzip, maintained by Jake Archibald |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| recharts | Chart.js (react-chartjs-2) | Canvas-based, CSP issues with inline styles, not Shadow DOM safe (not relevant for popup but principle stands) |
| recharts | Custom SVG | Zero dependency but significantly more code for axes, tooltips, legends |
| Native IndexedDB | `idb-keyval` (573 bytes) | Simple get/set only, no indexed queries -- cannot do date-range or model grouping queries |
| Native IndexedDB | `idb` (~1KB) | Slight convenience improvement, acceptable if wrapper feels too verbose |
| IndexedDB | chrome.storage.local | 10MB quota limit, no query support, would bloat webext-zustand sync |

**Installation:**
```bash
npm install recharts
# Optional: npm install idb
```

## Architecture Patterns

### Data Flow Architecture
```
Background Service Worker (onUsage callback)
    |
    v
calculateCost() → CostRecord object
    |
    v
IndexedDB.put(costRecord) ← writes directly from background SW
    |
    === (shared IndexedDB) ===
    |
    v
Popup opens → reads IndexedDB → aggregates data → renders charts
```

### Recommended Project Structure
```
src/
  services/
    costHistory/
      costDb.ts           # IndexedDB wrapper: open, put, query, clear
      types.ts             # CostRecord interface, aggregation types
  components/
    cost/
      CostDashboard.tsx    # Main dashboard component (lazy-loaded)
      DailyCostChart.tsx   # BarChart for daily costs
      ProviderBreakdown.tsx # PieChart for provider/model breakdown
      SessionCostList.tsx  # List/table of per-session costs
      DateRangeFilter.tsx  # 7d / 14d / 30d filter buttons
entrypoints/
  background.ts           # MODIFY: write CostRecord to IndexedDB after onUsage
  popup/
    App.tsx               # MODIFY: add "Cost" tab
src/types/
  messages.ts             # MODIFY: add modelId and providerId to LLM_COST
```

### Pattern 1: IndexedDB Cost Record Schema

**What:** A single object store for cost records with indexes on timestamp, provider, model, and sessionId.

**When to use:** Every time an LLM request completes with usage data.

**Example:**
```typescript
interface CostRecord {
  id: string;                    // crypto.randomUUID()
  timestamp: number;             // Date.now()
  sessionId: string;             // Tab-level session identifier
  provider: 'openai' | 'openrouter';
  modelId: string;               // e.g., 'gpt-4o', 'anthropic/claude-3-haiku'
  modelSlot: 'fast' | 'full';    // Which model slot was used
  promptTokens: number;
  completionTokens: number;
  reasoningTokens: number;
  totalTokens: number;
  costUSD: number;
}
```

**IndexedDB Schema:**
```typescript
const DB_NAME = 'ai-interview-costs';
const DB_VERSION = 1;
const STORE_NAME = 'cost-records';

function openCostDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      store.createIndex('by-timestamp', 'timestamp');
      store.createIndex('by-provider', 'provider');
      store.createIndex('by-model', 'modelId');
      store.createIndex('by-session', 'sessionId');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
```

### Pattern 2: Background Service Worker Writes to IndexedDB

**What:** The background service worker writes a CostRecord to IndexedDB immediately after calculating cost in the `onUsage` callback.

**When to use:** Every time a model stream completes with usage data.

**Why here (not content script):** The background has the model ID and provider ID in scope (from the `fireModelRequest` function). The content script only receives the `LLM_COST` message which currently lacks these fields. Writing from the background avoids needing to enrich the message or duplicate data.

**Example:**
```typescript
// In background.ts, inside fireModelRequest's onUsage callback:
onUsage: (usage: TokenUsage) => {
  const costUSD = calculateCost(modelId, usage.promptTokens, usage.completionTokens, usage.providerCost);

  // 1. Send existing LLM_COST message to content script (for real-time UI)
  sendLLMMessageToMeet({ type: 'LLM_COST', responseId, model: modelType, ... });

  // 2. Persist to IndexedDB for historical dashboard
  saveCostRecord({
    id: crypto.randomUUID(),
    timestamp: Date.now(),
    sessionId: `tab-${meetTabId}`,  // or use responseId prefix
    provider: resolution.provider.id,
    modelId: resolution.model,
    modelSlot: modelType,
    promptTokens: usage.promptTokens,
    completionTokens: usage.completionTokens,
    reasoningTokens: usage.reasoningTokens,
    totalTokens: usage.totalTokens,
    costUSD,
  });
};
```

### Pattern 3: Recharts in Popup (Lazy Loading)

**What:** Charts render only in the popup context. The recharts bundle (~120KB gzip) should only load when the "Cost" tab is active.

**When to use:** User opens popup and clicks "Cost" tab.

**Example:**
```typescript
// In popup App.tsx -- lazy load the cost dashboard
import { lazy, Suspense } from 'react';

const CostDashboard = lazy(() => import('../../src/components/cost/CostDashboard'));

// In tab content:
{activeTab === 'cost' && (
  <Suspense fallback={<div className="p-4 text-sm text-gray-500">Loading cost data...</div>}>
    <CostDashboard />
  </Suspense>
)}
```

### Pattern 4: Recharts BarChart for Daily Costs

**What:** A bar chart showing daily total cost for the selected date range.

**Example:**
```typescript
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

interface DailyData {
  date: string;  // "Feb 3"
  cost: number;
}

function DailyCostChart({ data }: { data: DailyData[] }) {
  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="date" tick={{ fontSize: 11 }} />
        <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${v.toFixed(2)}`} />
        <Tooltip formatter={(value: number) => [`$${value.toFixed(4)}`, 'Cost']} />
        <Bar dataKey="cost" fill="#3B82F6" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
```

### Pattern 5: Recharts PieChart for Provider Breakdown

**What:** A pie chart showing cost distribution by provider or model.

**Example:**
```typescript
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts';

const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6'];

interface BreakdownData {
  name: string;
  value: number;
}

function ProviderBreakdown({ data }: { data: BreakdownData[] }) {
  return (
    <ResponsiveContainer width="100%" height={200}>
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} label>
          {data.map((_, i) => (
            <Cell key={i} fill={COLORS[i % COLORS.length]} />
          ))}
        </Pie>
        <Tooltip formatter={(value: number) => `$${value.toFixed(4)}`} />
        <Legend />
      </PieChart>
    </ResponsiveContainer>
  );
}
```

### Pattern 6: Session ID Generation

**What:** A session identifier that groups cost records by interview session.

**When to use:** When writing cost records from the background service worker.

**Strategy:** Use the Meet tab ID + a timestamp-based session start. When capture starts (`START_CAPTURE`), generate a session ID and store it in module-level state. All subsequent LLM requests for that tab use the same session ID until capture stops.

**Example:**
```typescript
// In background.ts:
let currentSessionId: string | null = null;

// On START_CAPTURE:
currentSessionId = `session-${Date.now()}-${tabId}`;

// On STOP_CAPTURE:
currentSessionId = null;

// In onUsage callback:
sessionId: currentSessionId ?? `adhoc-${Date.now()}`,
```

### Anti-Patterns to Avoid

- **Storing cost history in Zustand store:** webext-zustand syncs entire state to all contexts on every change. Unbounded cost history would cause serialization bloat and slow performance. Use IndexedDB directly.
- **Loading recharts in content script:** Charts are only needed in the popup. Never import recharts in overlay or content script code -- it adds 120KB+ to the content bundle.
- **Querying IndexedDB on every render:** Cache query results in React state. Re-query only when the date filter changes or when the popup mounts.
- **Using chrome.storage.local for cost records:** 10MB quota limit, no query/index support, would be included in webext-zustand sync if not carefully excluded.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| SVG charts with axes/tooltips/legends | Custom SVG rendering with manual axis calculations | recharts | Axes, tooltips, responsive sizing, legends are deceptively complex; recharts handles all edge cases |
| IndexedDB promise wrapper | Full-featured ORM/query builder | Native IndexedDB (or `idb` at ~1KB) | Cost records have simple structure; only need put/getAll/cursor queries |
| Date formatting for chart labels | Complex date library | `Intl.DateTimeFormat` | Built-in browser API, lightweight, locale-aware |
| Data aggregation (sum by day/provider) | Server-side analytics | In-memory reduce/groupBy after IndexedDB read | Data volume is small (hundreds to low thousands of records); client-side aggregation is instant |

**Key insight:** The data model is simple (flat records with timestamps). The charting is the complex part -- that is why recharts exists. The storage is straightforward -- IndexedDB native API with 3-4 helper functions is sufficient.

## Common Pitfalls

### Pitfall 1: IndexedDB Not Available During Service Worker Initialization
**What goes wrong:** IndexedDB operations are async. If the service worker receives an LLM_COST-triggering event during the first event loop (before IndexedDB is opened), the write will fail.
**Why it happens:** Chrome MV3 service workers must register all event listeners synchronously in the first event loop. IndexedDB.open() is async.
**How to avoid:** Open the IndexedDB database lazily on first write (not at module load time). Cache the open database connection for subsequent writes. Use a promise chain so writes queue behind the initial open.
**Warning signs:** Cost records missing from IndexedDB for the first request after service worker restart.

### Pitfall 2: LLM_COST Message Missing Model ID and Provider
**What goes wrong:** The current `LLMCostMessage` interface has `model: LLMModelType` ('fast' | 'full') but NOT the actual model identifier (e.g., 'gpt-4o') or provider ID ('openai' | 'openrouter'). Without these, IndexedDB records cannot have per-provider or per-model breakdown.
**Why it happens:** Phase 17 designed the message for real-time overlay display (which only needs fast/full slot). Phase 18 needs richer data for historical analysis.
**How to avoid:** Either (a) add `modelId: string` and `providerId: ProviderId` to `LLMCostMessage`, or (b) write to IndexedDB directly from background.ts where `modelId` and `resolution.provider.id` are already in scope. Option (b) is cleaner -- the background has all data needed without message changes.
**Warning signs:** All records in IndexedDB show the same generic provider/model.

### Pitfall 3: Recharts ResponsiveContainer Needs a Parent with Explicit Dimensions
**What goes wrong:** `ResponsiveContainer` renders at 0x0 if its parent container has no explicit width/height or uses flexbox without constraints.
**Why it happens:** `ResponsiveContainer` uses ResizeObserver to detect parent dimensions. If the parent collapses to zero (e.g., in a flex container with `min-h-0`), the chart is invisible.
**How to avoid:** Ensure the chart container has an explicit height (e.g., `h-[200px]` or `style={{ height: 200 }}`). In the popup's scrollable area, set a fixed height on each chart wrapper.
**Warning signs:** Charts render blank or at 0x0 size. Check DevTools for the ResponsiveContainer's computed dimensions.

### Pitfall 4: Popup Closes and Loses React State
**What goes wrong:** When the user closes and reopens the popup, all React state is lost. If cost data was fetched from IndexedDB and aggregated in React state, it must be re-fetched on every popup open.
**Why it happens:** Chrome extension popups are ephemeral -- they mount/unmount on open/close.
**How to avoid:** Fetch from IndexedDB in a `useEffect` on mount. Show a loading state while fetching. Keep the fetch fast by limiting records (e.g., last 30 days). Cache aggregated results in chrome.storage.session for faster reopens (optional optimization).
**Warning signs:** Data flickers or shows loading state every time popup opens.

### Pitfall 5: Popup Max Height Overflow with Charts
**What goes wrong:** The popup has `max-h-[600px]` and `w-96` (384px). With three charts (200px each) plus header/tabs/filter, the content exceeds 600px and becomes scrollable, which is expected. But if charts try to be responsive to container width, they may render poorly at 384px.
**Why it happens:** Chrome extension popups have fixed dimensions. Recharts at narrow widths can have overlapping axis labels.
**How to avoid:** Design charts for 384px width from the start. Use abbreviated axis labels. Test at exact popup dimensions. Set `ResponsiveContainer` with `width="100%"` and explicit `height={180}` or `height={200}`.
**Warning signs:** Axis labels overlap, chart appears cramped, horizontal scrollbar appears.

### Pitfall 6: Data Retention / Storage Growth
**What goes wrong:** Without cleanup, IndexedDB accumulates records indefinitely. After months of heavy use, querying and aggregating thousands of records becomes slow.
**Why it happens:** No automatic data retention policy.
**How to avoid:** Implement a retention policy: auto-delete records older than 90 days. Run cleanup on popup open or on a periodic schedule. Show record count and storage usage in the dashboard UI. Add a "Clear History" button.
**Warning signs:** Dashboard load time increases noticeably over weeks of use.

## Code Examples

### Example 1: Complete IndexedDB Wrapper Module

```typescript
// src/services/costHistory/costDb.ts

const DB_NAME = 'ai-interview-costs';
const DB_VERSION = 1;
const STORE_NAME = 'cost-records';

export interface CostRecord {
  id: string;
  timestamp: number;
  sessionId: string;
  provider: 'openai' | 'openrouter';
  modelId: string;
  modelSlot: 'fast' | 'full';
  promptTokens: number;
  completionTokens: number;
  reasoningTokens: number;
  totalTokens: number;
  costUSD: number;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function getDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
          store.createIndex('by-timestamp', 'timestamp');
          store.createIndex('by-provider', 'provider');
          store.createIndex('by-model', 'modelId');
          store.createIndex('by-session', 'sessionId');
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

export async function saveCostRecord(record: CostRecord): Promise<void> {
  const db = await getDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getCostRecordsSince(sinceTimestamp: number): Promise<CostRecord[]> {
  const db = await getDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const index = tx.objectStore(STORE_NAME).index('by-timestamp');
    const range = IDBKeyRange.lowerBound(sinceTimestamp);
    const req = index.getAll(range);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function getAllCostRecords(): Promise<CostRecord[]> {
  const db = await getDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function deleteRecordsBefore(beforeTimestamp: number): Promise<void> {
  const db = await getDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const index = tx.objectStore(STORE_NAME).index('by-timestamp');
    const range = IDBKeyRange.upperBound(beforeTimestamp);
    const req = index.openCursor(range);
    req.onsuccess = () => {
      const cursor = req.result;
      if (cursor) {
        cursor.delete();
        cursor.continue();
      }
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function clearAllRecords(): Promise<void> {
  const db = await getDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
```

### Example 2: Data Aggregation Helpers

```typescript
// src/services/costHistory/aggregation.ts

import type { CostRecord } from './costDb';

export interface DailyCost {
  date: string;     // "Feb 3"
  dateKey: string;   // "2026-02-03"
  cost: number;
  tokens: number;
}

export interface ProviderCost {
  name: string;   // "OpenAI" or "OpenRouter"
  value: number;  // total cost USD
}

export interface ModelCost {
  name: string;   // model ID
  value: number;
}

export interface SessionSummary {
  sessionId: string;
  startTime: number;
  requestCount: number;
  totalCost: number;
  totalTokens: number;
}

export function aggregateByDay(records: CostRecord[]): DailyCost[] {
  const byDay = new Map<string, { cost: number; tokens: number }>();
  for (const r of records) {
    const d = new Date(r.timestamp);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const existing = byDay.get(key) ?? { cost: 0, tokens: 0 };
    existing.cost += r.costUSD;
    existing.tokens += r.totalTokens;
    byDay.set(key, existing);
  }
  return Array.from(byDay.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([dateKey, data]) => {
      const [, m, d] = dateKey.split('-');
      const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      return {
        date: `${monthNames[parseInt(m) - 1]} ${parseInt(d)}`,
        dateKey,
        cost: data.cost,
        tokens: data.tokens,
      };
    });
}

export function aggregateByProvider(records: CostRecord[]): ProviderCost[] {
  const byProvider = new Map<string, number>();
  for (const r of records) {
    const key = r.provider === 'openai' ? 'OpenAI' : 'OpenRouter';
    byProvider.set(key, (byProvider.get(key) ?? 0) + r.costUSD);
  }
  return Array.from(byProvider.entries()).map(([name, value]) => ({ name, value }));
}

export function aggregateByModel(records: CostRecord[]): ModelCost[] {
  const byModel = new Map<string, number>();
  for (const r of records) {
    byModel.set(r.modelId, (byModel.get(r.modelId) ?? 0) + r.costUSD);
  }
  return Array.from(byModel.entries())
    .sort(([, a], [, b]) => b - a)
    .map(([name, value]) => ({ name, value }));
}

export function aggregateBySessions(records: CostRecord[]): SessionSummary[] {
  const bySession = new Map<string, SessionSummary>();
  for (const r of records) {
    const existing = bySession.get(r.sessionId) ?? {
      sessionId: r.sessionId,
      startTime: r.timestamp,
      requestCount: 0,
      totalCost: 0,
      totalTokens: 0,
    };
    existing.requestCount += 1;
    existing.totalCost += r.costUSD;
    existing.totalTokens += r.totalTokens;
    if (r.timestamp < existing.startTime) existing.startTime = r.timestamp;
    bySession.set(r.sessionId, existing);
  }
  return Array.from(bySession.values()).sort((a, b) => b.startTime - a.startTime);
}
```

### Example 3: Popup Tab Extension

```typescript
// In popup/App.tsx -- adding the Cost tab

type Tab = 'capture' | 'settings' | 'templates' | 'cost';

// In tab navigation:
{(['capture', 'settings', 'templates', 'cost'] as const).map((tab) => (
  <button key={tab} onClick={() => setActiveTab(tab)} ...>
    {tab === 'cost' ? 'Cost' : tab}
  </button>
))}

// In tab content:
{activeTab === 'cost' && (
  <Suspense fallback={<div className="p-4 text-sm text-gray-500">Loading...</div>}>
    <CostDashboard />
  </Suspense>
)}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Chart.js (canvas-based) | recharts (SVG-based) | 2024+ trend | No CSP issues, works in any DOM context |
| chrome.storage.local for all data | IndexedDB for large/queryable data | Chrome MV3 best practice | Avoids 10MB quota, supports indexes |
| Full IndexedDB ORM libraries (Dexie, etc.) | Native IndexedDB or `idb` wrapper | Lightweight trend | ~1KB vs 30-100KB for Dexie |

**Deprecated/outdated:**
- Chart.js in extension contexts: Canvas inline styles cause CSP violations. SVG-based charts (recharts) are the standard for Chrome extensions.
- Storing unbounded data in Zustand with webext-zustand: Causes serialization bloat. Separate storage (IndexedDB) for large datasets.

## Key Architectural Decisions for Planner

### 1. Where to write cost records
**Decision:** Background service worker writes to IndexedDB directly in the `onUsage` callback. This is the only context where `modelId`, `providerId`, and `sessionId` are all in scope. No need to enrich `LLM_COST` message or write from content script.

### 2. How popup reads data
**Decision:** Popup reads from IndexedDB on mount (in `useEffect`). Data is aggregated in-memory using simple reduce/groupBy functions. No server, no synced store, no middleware.

### 3. Session ID strategy
**Decision:** Generate a session ID in `background.ts` when `START_CAPTURE` is received. Store as module-level variable. All cost records for that capture session use the same ID. Resets on `STOP_CAPTURE`.

### 4. Data retention
**Decision:** Auto-delete records older than 90 days. Run cleanup on popup open. Provide "Clear History" button in dashboard UI.

### 5. Recharts lazy loading
**Decision:** The CostDashboard component is lazy-loaded via `React.lazy()` and only imports recharts. This ensures the ~120KB recharts bundle never loads unless the user clicks the "Cost" tab.

### 6. Tab addition vs. sub-tab
**Decision:** Add a top-level "Cost" tab to the popup (alongside Capture, Settings, Templates) rather than nesting under Settings. Cost tracking is a distinct feature area with its own navigation needs.

## Open Questions

1. **Session ID edge case: service worker termination**
   - What we know: The session ID is stored as a module-level variable in the background service worker. If the SW terminates and restarts mid-capture, the session ID is lost.
   - What's unclear: How to persist the session ID across SW restarts without adding to Zustand.
   - Recommendation: Store the session ID in `chrome.storage.session` (session-scoped, survives SW restarts but clears on browser close). Read it back on SW restart. LOW priority edge case -- most interview sessions are short enough that SW doesn't terminate.

2. **LLM_COST message enrichment vs. background-only write**
   - What we know: Writing from background is cleaner (all data in scope). But enriching LLM_COST with modelId/providerId would also allow the content script to display richer cost info.
   - What's unclear: Whether the overlay will ever need to show model-specific cost breakdown (currently shows only total per-request cost).
   - Recommendation: Do both -- enrich LLM_COST message AND write from background. The message enrichment is 2 extra fields and future-proofs the overlay. The background write handles persistence.

3. **Recharts tree-shaking effectiveness with Vite**
   - What we know: Recharts v3 is modular. Importing only `BarChart`, `PieChart`, and their sub-components should allow tree-shaking.
   - What's unclear: Exact bundle size after tree-shaking with Vite. Sources cite 120-200KB range.
   - Recommendation: Build and measure after implementation. If bundle is too large, consider custom SVG for the simpler charts (pie can be a simple SVG circle).

## Sources

### Primary (HIGH confidence)
- [recharts npm package](https://www.npmjs.com/package/recharts) -- v3.7.0, latest version confirmed
- [recharts API docs](https://recharts.github.io/en-US/api/ResponsiveContainer/) -- ResponsiveContainer, BarChart, PieChart API
- [IndexedDB API (MDN)](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API) -- native API reference
- [idb npm package](https://www.npmjs.com/package/idb) -- Jake Archibald's promise wrapper, ~1KB
- [Chrome extension service worker lifecycle](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle) -- IndexedDB access from SW
- Existing codebase: `background.ts` (onUsage callback), `content.tsx` (handleLLMCost), `popup/App.tsx` (tab structure)

### Secondary (MEDIUM confidence)
- [Chromium extensions discussion](https://groups.google.com/a/chromium.org/g/chromium-extensions/c/wdiKamQkapY) -- IndexedDB shared between popup and service worker confirmed
- [DEV Community IndexedDB extension tutorial](https://dev.to/anobjectisa/local-database-and-chrome-extensions-indexeddb-36n) -- patterns for extension IndexedDB usage
- [recharts 3.0 migration guide](https://github.com/recharts/recharts/wiki/3.0-migration-guide) -- v3 state management improvements

### Tertiary (LOW confidence)
- None. All findings verified with official sources or npm registry.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- recharts v3.7.0 confirmed on npm, IndexedDB is a stable browser API
- Architecture: HIGH -- data flow follows existing codebase patterns (background writes, popup reads)
- Pitfalls: HIGH -- IndexedDB in MV3 is well-documented, recharts popup rendering is straightforward
- Code examples: HIGH -- based on existing codebase patterns and official recharts/IndexedDB APIs

**Research date:** 2026-02-09
**Valid until:** 2026-03-09 (30 days; stable domain, recharts and IndexedDB are mature)
