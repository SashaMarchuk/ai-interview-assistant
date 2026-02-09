import { openDB, type IDBPDatabase } from 'idb';

export interface FileRecord {
  type: 'resume' | 'jobDescription';
  text: string;
  fileName?: string;
  updatedAt: number;
}

interface FilePersonalizationDB {
  files: {
    key: string;
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

export async function getFileContent(
  type: 'resume' | 'jobDescription',
): Promise<FileRecord | undefined> {
  const db = await getDB();
  return db.get('files', type);
}

export async function deleteFileContent(
  type: 'resume' | 'jobDescription',
): Promise<void> {
  const db = await getDB();
  await db.delete('files', type);
}
