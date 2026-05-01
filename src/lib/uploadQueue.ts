// ─── Types ────────────────────────────────────────────────────────────────────

export type UploadStatus = "PENDING" | "UPLOADING" | "PAUSED" | "DONE" | "FAILED";

export interface CompletedPart {
  PartNumber: number;
  ETag: string;
}

export interface QueueItem {
  id: string;
  eventId: string;
  file: File;
  filename: string;
  size: number;
  mimeType: string;
  status: UploadStatus;
  progress: number;
  uploadedBytes: number;
  chunkSize: number;
  uploadId: string | null;       // S3 multipart upload ID — null until createMultipartUpload
  s3Key: string | null;          // final S3 object key — null until createMultipartUpload
  photoId: string | null;        // DB Photo row ID — null until createMultipartUpload
  groupId: string | null;        // PhotoGroup to assign the photo to on completion
  completedParts: CompletedPart[];
  retryCount: number;
  lastError: string | null;
  addedAt: number;
  completedAt: number | null;
}

// ─── DB config ────────────────────────────────────────────────────────────────

const DB_NAME = "photoshare-uploads";
const DB_VERSION = 1;
const STORE = "queue";

// ─── Connection cache ─────────────────────────────────────────────────────────

let db: IDBDatabase | null = null;

// ─── Internal helpers ─────────────────────────────────────────────────────────

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const database = (event.target as IDBOpenDBRequest).result;
      if (!database.objectStoreNames.contains(STORE)) {
        database.createObjectStore(STORE, { keyPath: "id" });
      }
    };

    request.onsuccess = (event) => resolve((event.target as IDBOpenDBRequest).result);
    request.onerror = (event) => reject((event.target as IDBOpenDBRequest).error);
  });
}

function tx(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest | IDBRequest[]
): Promise<void> {
  return new Promise((resolve, reject) => {
    const transaction = db!.transaction(STORE, mode);
    const store = transaction.objectStore(STORE);

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);

    const requests = fn(store);
    const list = Array.isArray(requests) ? requests : [requests];
    for (const req of list) {
      req.onerror = () => reject(req.error);
    }
  });
}

function txGet<T>(fn: (store: IDBObjectStore) => IDBRequest): Promise<T> {
  return new Promise((resolve, reject) => {
    const transaction = db!.transaction(STORE, "readonly");
    const store = transaction.objectStore(STORE);
    const request = fn(store);
    request.onsuccess = () => resolve(request.result as T);
    request.onerror = () => reject(request.error);
  });
}

// ─── Public API ───────────────────────────────────────────────────────────────

/** Opens the IndexedDB connection. Must be called before any other function. */
export async function initQueue(): Promise<void> {
  if (db) return;
  db = await openDB();
}

/** Adds a file to the queue and returns the generated item id.
 *
 * De-duplicates by filename + size: if an active item (PENDING, PAUSED, or
 * UPLOADING) already exists for this event with the same name and size, the
 * existing item's id is returned and no new row is written.  DONE and FAILED
 * items are not treated as duplicates — a DONE item means the upload succeeded
 * so there is nothing to do, while a FAILED item can be re-queued intentionally
 * by dropping the file again.
 */
export async function addToQueue(
  eventId: string,
  file: File,
  groupId: string | null = null
): Promise<string> {
  const existing = await getEventQueue(eventId);
  const active = existing.find(
    (i) =>
      i.filename === file.name &&
      i.size === file.size &&
      (i.status === "PENDING" || i.status === "UPLOADING" || i.status === "PAUSED")
  );
  if (active) return active.id;

  const item: QueueItem = {
    id: crypto.randomUUID(),
    eventId,
    file,
    filename: file.name,
    size: file.size,
    mimeType: file.type,
    status: "PENDING",
    progress: 0,
    uploadedBytes: 0,
    chunkSize: 5 * 1024 * 1024, // 5 MB
    uploadId: null,
    s3Key: null,
    photoId: null,
    groupId,
    completedParts: [],
    retryCount: 0,
    lastError: null,
    addedAt: Date.now(),
    completedAt: null,
  };

  await tx("readwrite", (store) => store.put(item));
  return item.id;
}

/** Returns a single queue item by id. Rejects if not found. */
export async function getQueueItem(id: string): Promise<QueueItem> {
  const item = await txGet<QueueItem | undefined>((store) => store.get(id));
  if (!item) throw new Error(`Queue item not found: ${id}`);
  return item;
}

/** Merges partial fields into an existing queue item. */
export async function updateQueueItem(
  id: string,
  partial: Partial<Omit<QueueItem, "id">>
): Promise<void> {
  const existing = await getQueueItem(id);
  const updated: QueueItem = { ...existing, ...partial };
  await tx("readwrite", (store) => store.put(updated));
}

/** Returns all items for a given event, ordered by addedAt ascending. */
export async function getEventQueue(eventId: string): Promise<QueueItem[]> {
  const all = await txGet<QueueItem[]>((store) => store.getAll());
  return all
    .filter((item) => item.eventId === eventId)
    .sort((a, b) => a.addedAt - b.addedAt);
}

/** Returns PENDING and PAUSED items for a given event, ordered by addedAt. */
export async function getPendingItems(eventId: string): Promise<QueueItem[]> {
  const all = await getEventQueue(eventId);
  return all.filter((item) => item.status === "PENDING" || item.status === "PAUSED");
}

/** Deletes all DONE items for a given event. */
export async function clearCompleted(eventId: string): Promise<void> {
  const completed = (await getEventQueue(eventId)).filter((item) => item.status === "DONE");
  await tx("readwrite", (store) => completed.map((item) => store.delete(item.id)));
}

/** Removes a single item from the queue regardless of status. */
export async function removeItem(id: string): Promise<void> {
  await tx("readwrite", (store) => store.delete(id));
}
