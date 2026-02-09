/**
 * Cost History IndexedDB Wrapper
 *
 * Promise-based wrapper around native IndexedDB for cost record persistence.
 * Uses lazy database opening to handle service worker lifecycle (Pitfall 1).
 * No external dependencies.
 */

import type { CostRecord } from './types';

const DB_NAME = 'ai-interview-costs';
const DB_VERSION = 1;
const STORE_NAME = 'cost-records';

/**
 * Cached database connection promise.
 * Lazy-opened on first call to avoid IndexedDB issues during SW initialization.
 */
let dbPromise: Promise<IDBDatabase> | null = null;

/**
 * Open (or return cached) IndexedDB connection.
 * Creates object store and indexes on first open (version upgrade).
 */
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
      req.onerror = () => {
        dbPromise = null; // Reset so next call retries
        reject(req.error);
      };
    });
  }
  return dbPromise;
}

/**
 * Save a cost record to IndexedDB.
 * Called from background service worker's onUsage callback.
 */
export async function saveCostRecord(record: CostRecord): Promise<void> {
  const db = await getDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Get all cost records since a given timestamp.
 * Uses the by-timestamp index with a lower bound range for efficient querying.
 */
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

/**
 * Get all cost records from the database.
 */
export async function getAllCostRecords(): Promise<CostRecord[]> {
  const db = await getDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Delete all cost records before a given timestamp.
 * Uses cursor on by-timestamp index with upper bound range.
 * Used for 90-day retention policy cleanup.
 */
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

/**
 * Clear all cost records from the database.
 * Used by "Clear History" button in dashboard.
 */
export async function clearAllRecords(): Promise<void> {
  const db = await getDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Get the total count of cost records in the database.
 * Used for dashboard stats display.
 */
export async function getRecordCount(): Promise<number> {
  const db = await getDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).count();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
