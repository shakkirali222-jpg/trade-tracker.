'use strict';
// Small IndexedDB wrapper. Everything is stored on the device.
// Stores: parties (suppliers + buyers), orders, files (weight slip photos, voice notes).
const DB = (() => {
  const NAME = 'log-broker';
  const VERSION = 1;
  let dbPromise = null;

  function open() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(NAME, VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('parties')) {
          db.createObjectStore('parties', { keyPath: 'id' }).createIndex('type', 'type');
        }
        if (!db.objectStoreNames.contains('orders')) {
          db.createObjectStore('orders', { keyPath: 'id' }).createIndex('date', 'date');
        }
        if (!db.objectStoreNames.contains('files')) {
          db.createObjectStore('files', { keyPath: 'id' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return dbPromise;
  }

  async function run(store, mode, fn) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, mode);
      const s = tx.objectStore(store);
      let result;
      const req = fn(s);
      if (req) req.onsuccess = () => { result = req.result; };
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  }

  return {
    all: (store) => run(store, 'readonly', (s) => s.getAll()),
    get: (store, id) => run(store, 'readonly', (s) => s.get(id)),
    put: (store, obj) => run(store, 'readwrite', (s) => s.put(obj)),
    del: (store, id) => run(store, 'readwrite', (s) => s.delete(id)),
    clear: (store) => run(store, 'readwrite', (s) => s.clear()),
    putMany: (store, list) => run(store, 'readwrite', (s) => { list.forEach((o) => s.put(o)); }),
  };
})();

function uid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}
