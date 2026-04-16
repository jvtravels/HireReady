/* ─── IndexedDB transcript backup for interviews ─── */

const IDB_NAME = "hirestepx";
const IDB_STORE = "drafts";

let _cachedDb: IDBDatabase | null = null;

export function openIDB(): Promise<IDBDatabase> {
  // Reuse cached connection if still open
  if (_cachedDb) {
    try {
      // Test if connection is still alive by starting a transaction
      _cachedDb.transaction(IDB_STORE, "readonly");
      return Promise.resolve(_cachedDb);
    } catch {
      _cachedDb = null; // Connection is dead, create a new one
    }
  }
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE);
      }
    };
    req.onsuccess = () => { _cachedDb = req.result; resolve(req.result); };
    req.onerror = () => reject(req.error);
  });
}

export async function saveToIDB(key: string, data: unknown): Promise<void> {
  try {
    const db = await openIDB();
    const tx = db.transaction(IDB_STORE, "readwrite");
    tx.objectStore(IDB_STORE).put(data, key);
  } catch (err) { console.warn("[IDB] saveToIDB failed:", err); }
}

export async function loadFromIDB(key: string): Promise<unknown | null> {
  try {
    const db = await openIDB();
    return new Promise((resolve) => {
      const tx = db.transaction(IDB_STORE, "readonly");
      const req = tx.objectStore(IDB_STORE).get(key);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => resolve(null);
    });
  } catch { return null; }
}

export async function deleteFromIDB(key: string): Promise<void> {
  try {
    const db = await openIDB();
    const tx = db.transaction(IDB_STORE, "readwrite");
    tx.objectStore(IDB_STORE).delete(key);
  } catch (err) { console.warn("[IDB] deleteFromIDB failed:", err); }
}

const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;
const FORTY_EIGHT_HOURS = 48 * 60 * 60 * 1000;

/** Delete stale drafts from IndexedDB. Non-critical — errors are silenced. */
export async function cleanupStaleIDB(maxAgeMs: number = SEVEN_DAYS): Promise<number> {
  try {
    const db = await openIDB();
    const now = Date.now();
    let deleted = 0;

    return new Promise<number>((resolve) => {
      const tx = db.transaction(IDB_STORE, "readwrite");
      const store = tx.objectStore(IDB_STORE);
      const cursorReq = store.openCursor();

      cursorReq.onsuccess = () => {
        const cursor = cursorReq.result;
        if (!cursor) return; // iteration complete — tx.oncomplete will resolve

        const key = cursor.key as string;
        const value = cursor.value;
        const savedAt = typeof value?.savedAt === "number" ? value.savedAt : 0;
        const age = now - savedAt;

        const isEphemeral =
          (typeof key === "string") &&
          (key.startsWith("hirestepx_eval_retry_") || key.startsWith("hirestepx_unsaved_"));

        if ((savedAt > 0 && age > maxAgeMs) || (isEphemeral && age > FORTY_EIGHT_HOURS)) {
          cursor.delete();
          deleted++;
        }

        cursor.continue();
      };

      tx.oncomplete = () => { resolve(deleted); };
      tx.onerror = () => { resolve(deleted); };
    });
  } catch {
    return 0;
  }
}
