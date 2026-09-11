const DB_NAME = "stickywall";
const DB_VERSION = 1;
const STORE = "scraps";

type ScrapBase = { id: string; createdAt: number };

export type Scrap =
  | (ScrapBase & { kind: "text"; text: string })
  | (ScrapBase & {
      kind: "image";
      name: string;
      type: string;
      blob: Blob;
      width: number;
      height: number;
    });

export const MAX_IMAGE_BYTES = 25 * 1024 * 1024;

let connection: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  connection ??= new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("This browser has no local storage for scraps."));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" }).createIndex("createdAt", "createdAt");
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not open the scrap store."));
    request.onblocked = () => reject(new Error("Another tab is upgrading the scrap store."));
  }).catch((error) => {
    connection = null;
    throw error;
  });
  return connection;
}

async function run<T>(mode: IDBTransactionMode, body: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise<T>((resolve, reject) => {
    const transaction = db.transaction(STORE, mode);
    const request = body(transaction.objectStore(STORE));
    request.onsuccess = () => resolve(request.result);
    transaction.onabort = transaction.onerror = () =>
      reject(transaction.error ?? new Error("The scrap store rejected the write."));
  });
}

/** Newest first. */
export async function listScraps(): Promise<Scrap[]> {
  const all = await run<Scrap[]>("readonly", (store) => store.getAll());
  return all.sort((a, b) => b.createdAt - a.createdAt);
}

export const putScrap = (scrap: Scrap) => run("readwrite", (store) => store.put(scrap));

export const deleteScrap = (id: string) => run("readwrite", (store) => store.delete(id));

export const clearScraps = () => run("readwrite", (store) => store.clear());

export const newId = () =>
  typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

export const textScrap = (text: string): Scrap => ({
  id: newId(),
  kind: "text",
  text,
  createdAt: Date.now(),
});

async function measure(blob: Blob): Promise<{ width: number; height: number }> {
  try {
    const bitmap = await createImageBitmap(blob);
    const size = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return size;
  } catch {
    return { width: 0, height: 0 };
  }
}

export async function imageScrap(file: File | Blob): Promise<Scrap> {
  if (file.size > MAX_IMAGE_BYTES) throw new Error("That image is larger than 25 MB.");
  const { width, height } = await measure(file);
  const name = file instanceof File && file.name ? file.name : "Pasted image";
  return {
    id: newId(),
    kind: "image",
    name,
    type: file.type || "image/png",
    blob: file,
    width,
    height,
    createdAt: Date.now(),
  };
}
