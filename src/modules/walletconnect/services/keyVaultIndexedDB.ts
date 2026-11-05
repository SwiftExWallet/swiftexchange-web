const DB_NAME = '_sx_v4_kv_28f3';
const STORE_NAME = '_0xe9a1b';
const KEY_ID = '_k0';
const DB_VERSION = 1;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function generateAndStoreAESKey(keyId: string = KEY_ID): Promise<CryptoKey> {
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, [
    'encrypt',
    'decrypt',
  ]);

  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const put = store.put(key, keyId);
    put.onsuccess = () => {
      db.close();
      resolve(key);
    };
    put.onerror = () => {
      db.close();
      reject(put.error);
    };
  });
}

export async function retrieveAESKey(keyId: string = KEY_ID): Promise<CryptoKey | null> {
  try {
    const db = await openDB();
    const key = await new Promise<CryptoKey | null>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const get = store.get(keyId);
      get.onsuccess = () => resolve(get.result || null);
      get.onerror = () => reject(get.error);
    });

    if (key) {
      db.close();
      return key;
    }

    // Fallback to legacy default key if namespaced key is not yet present
    if (keyId !== KEY_ID) {
      const fallbackKey = await new Promise<CryptoKey | null>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const get = store.get(KEY_ID);
        get.onsuccess = () => resolve(get.result || null);
        get.onerror = () => reject(get.error);
      });
      db.close();
      return fallbackKey;
    }

    db.close();
    return null;
  } catch {
    return null;
  }
}

export async function destroyAESKey(keyId: string = KEY_ID): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const del = store.delete(keyId);
      del.onsuccess = () => {
        db.close();
        resolve();
      };
      del.onerror = () => {
        db.close();
        reject(del.error);
      };
    });
  } catch {
    return;
  }
}
