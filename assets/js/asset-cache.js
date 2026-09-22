// 画像素材のIndexedDBキャッシュ + GAS APIからの段階的取得
//
// localStorageは5〜10MB程度の容量制限があり、画像（将来的には音声も）を
// 保存するには不十分なため、IndexedDBを使用する。
//
// 使い方（engine.js から）:
//   await AssetCache.init();                        // 起動時に1回。IndexedDBの内容をメモリへ読み込む
//   await AssetCache.fetchGroup("common");           // commonグループを取得（キャッシュ済みならAPIを呼ばない）
//   AssetCache.get("marico_normal");                 // メモリ上のキャッシュから同期的に取得（Data URI文字列 or undefined）
//   AssetCache.fetchGroup("route_marico");           // ルート選択後に追加取得
window.AssetCache = (() => {
  "use strict";

  const DB_NAME = "alibi_asset_cache";
  const DB_VERSION = 1;
  const IMAGE_STORE = "images";
  const GROUP_STORE = "groups"; // 取得済みグループの記録（{ name, fetchedAt }）

  // 展示中に素材を差し替えた場合に古いキャッシュを使い続けないよう、
  // 一定時間が経過したグループは「未取得」扱いに戻し、再取得させる
  const GROUP_CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6時間

  // 素材ID -> Data URI のメモリキャッシュ（同期アクセス用）
  const memoryCache = {};
  // 取得済み（または取得中）のグループ名の記録。IndexedDBにキャッシュがあれば
  // init() の時点でここに反映されるため、ページを再読み込みしても
  // 有効期限内なら無駄なfetchGroupを呼ばずに済む
  const loadedGroups = new Set();

  let dbPromise = null;

  function openDb() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve) => {
      if (!window.indexedDB) {
        resolve(null); // IndexedDB非対応環境ではキャッシュなしで動作
        return;
      }
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(IMAGE_STORE)) {
          db.createObjectStore(IMAGE_STORE, { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains(GROUP_STORE)) {
          db.createObjectStore(GROUP_STORE, { keyPath: "name" });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null); // 失敗してもゲーム進行は止めない
    });
    return dbPromise;
  }

  async function loadAllFromIndexedDb() {
    const db = await openDb();
    if (!db) return;

    await new Promise((resolve) => {
      try {
        const tx = db.transaction(IMAGE_STORE, "readonly");
        const req = tx.objectStore(IMAGE_STORE).getAll();
        req.onsuccess = () => {
          (req.result || []).forEach((entry) => {
            memoryCache[entry.id] = entry.dataUri;
          });
          resolve();
        };
        req.onerror = () => resolve();
      } catch (err) {
        resolve();
      }
    });

    await new Promise((resolve) => {
      try {
        const tx = db.transaction(GROUP_STORE, "readonly");
        const req = tx.objectStore(GROUP_STORE).getAll();
        req.onsuccess = () => {
          const now = Date.now();
          (req.result || []).forEach((entry) => {
            if (now - entry.fetchedAt < GROUP_CACHE_TTL_MS) {
              loadedGroups.add(entry.name); // 有効期限内のみ「取得済み」として扱う
            }
          });
          resolve();
        };
        req.onerror = () => resolve();
      } catch (err) {
        resolve();
      }
    });
  }

  async function saveManyToIndexedDb(images) {
    const db = await openDb();
    if (!db) return;
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(IMAGE_STORE, "readwrite");
        const store = tx.objectStore(IMAGE_STORE);
        Object.keys(images).forEach((id) => {
          store.put({ id, dataUri: images[id] });
        });
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve(); // 保存失敗してもメモリキャッシュはあるので致命的ではない
      } catch (err) {
        resolve();
      }
    });
  }

  async function markGroupFetchedInIndexedDb(groupName) {
    const db = await openDb();
    if (!db) return;
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(GROUP_STORE, "readwrite");
        tx.objectStore(GROUP_STORE).put({ name: groupName, fetchedAt: Date.now() });
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      } catch (err) {
        resolve();
      }
    });
  }

  async function clearGroupFromIndexedDb(groupName) {
    const db = await openDb();
    if (!db) return;
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(GROUP_STORE, "readwrite");
        tx.objectStore(GROUP_STORE).delete(groupName);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      } catch (err) {
        resolve();
      }
    });
  }

  // GAS Web Appは、再デプロイ直後の反映待ちや実行環境のコールドスタートにより
  // 断続的に404（HTMLのエラーページ）を返すことがある。1回だけ間隔を置いて
  // 自動リトライすることで、こうした一時的な失敗をユーザーに見せないようにする。
  const FETCH_RETRY_COUNT = 1;
  const FETCH_RETRY_DELAY_MS = 1200;

  function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function fetchGroupOnce(groupName) {
    const apiUrl = window.ASSET_API_URL;
    const url = apiUrl + (apiUrl.includes("?") ? "&" : "?") + "group=" + encodeURIComponent(groupName);
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error("HTTP " + res.status);
    }
    return res.json();
  }

  async function fetchGroup(groupName) {
    if (loadedGroups.has(groupName)) return; // 二重取得防止（IndexedDB由来の記録も含む）
    loadedGroups.add(groupName);

    const apiUrl = window.ASSET_API_URL;
    if (!apiUrl) return; // 未設定ならプレースホルダー運用のまま

    let lastErr = null;
    for (let attempt = 0; attempt <= FETCH_RETRY_COUNT; attempt++) {
      if (attempt > 0) {
        console.warn("[AssetCache] group=" + groupName + " retrying (" + attempt + "/" + FETCH_RETRY_COUNT + ")...");
        await delay(FETCH_RETRY_DELAY_MS);
      }
      try {
        const data = await fetchGroupOnce(groupName);
        if (data && data.images) {
          Object.assign(memoryCache, data.images);
          saveManyToIndexedDb(data.images); // 完了を待たずゲームは先に進めてよい
        }
        if (data && data.errors && data.errors.length) {
          console.warn("[AssetCache] group=" + groupName + " errors:", data.errors);
        }
        markGroupFetchedInIndexedDb(groupName); // 次回起動時に再取得しないよう記録
        return; // 成功
      } catch (err) {
        lastErr = err;
      }
    }

    // リトライしても失敗した場合：プレースホルダー運用にフォールバックする
    console.warn("[AssetCache] group=" + groupName + " fetch failed after retry:", lastErr);
    loadedGroups.delete(groupName); // 次にfetchGroupが呼ばれた際に再試行できるようにしておく
    clearGroupFromIndexedDb(groupName);
  }

  function get(assetId) {
    return memoryCache[assetId];
  }

  async function init() {
    await loadAllFromIndexedDb();
  }

  return { init, fetchGroup, get };
})();
