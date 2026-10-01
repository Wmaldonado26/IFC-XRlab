/**
 * IFC-XRlab - High-Performance IndexedDB Fragment Cache
 * Persists parsed .frag ArrayBuffers locally in the client's browser,
 * eliminating redundant 256MB+ network transfers and re-conversions.
 */

const DB_NAME = 'ifc_xrlab_frag_cache';
const DB_VERSION = 1;
const STORE_NAME = 'fragment_buffers';

interface CachedProjectRecord {
  id: string;
  name: string;
  parts: ArrayBuffer[];
  totalBytes: number;
  timestamp: number;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveProjectFragments(
  id: string,
  name: string,
  parts: ArrayBuffer[]
): Promise<void> {
  try {
    const db = await openDB();
    const totalBytes = parts.reduce((acc, p) => acc + p.byteLength, 0);

    const record: CachedProjectRecord = {
      id,
      name,
      parts,
      totalBytes,
      timestamp: Date.now(),
    };

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.put(record);

      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('[FragCache] Failed to cache fragments in IndexedDB:', err);
  }
}

export async function getProjectFragments(
  id: string
): Promise<{ name: string; parts: ArrayBuffer[] } | null> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(id);

      req.onsuccess = () => {
        if (req.result) {
          resolve({
            name: req.result.name,
            parts: req.result.parts,
          });
        } else {
          resolve(null);
        }
      };
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('[FragCache] Error reading from IndexedDB:', err);
    return null;
  }
}

export async function listCachedProjects(): Promise<
  Array<{ id: string; name: string; totalBytes: number; timestamp: number }>
> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();

      req.onsuccess = () => {
        const records = (req.result as CachedProjectRecord[]) || [];
        resolve(
          records.map((r) => ({
            id: r.id,
            name: r.name,
            totalBytes: r.totalBytes,
            timestamp: r.timestamp,
          }))
        );
      };
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('[FragCache] Error listing cached projects:', err);
    return [];
  }
}

export async function deleteCachedProject(id: string): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.delete(id);

      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('[FragCache] Error deleting from cache:', err);
  }
}

export async function clearAllCachedProjects(): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.clear();

      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('[FragCache] Error clearing cache:', err);
  }
}
