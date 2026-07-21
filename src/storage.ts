import { emptyData, type AppData } from "./domain";
const DB = "cushion";
const STORE = "state";
const KEY = "app";
export interface Storage {
  load(): Promise<AppData>;
  save(data: AppData): Promise<void>;
}
const open = () =>
  new Promise<IDBDatabase>((resolve, reject) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
export class IndexedDbStorage implements Storage {
  async load() {
    const db = await open();
    return new Promise<AppData>((resolve, reject) => {
      const r = db.transaction(STORE).objectStore(STORE).get(KEY);
      r.onsuccess = () => resolve(r.result ?? emptyData());
      r.onerror = () => reject(r.error);
    });
  }
  async save(data: AppData) {
    const db = await open();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(data, KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }
}
