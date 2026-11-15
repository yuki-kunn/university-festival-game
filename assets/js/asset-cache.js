// 画像素材のプリロード管理（Cloudflare R2版）
//
// GAS + Google Drive時代は、画像をBase64/JSON化してAPI経由で取得する
// 方式だったため、IndexedDBキャッシュや複数回のリトライ、コールドスタート
// 対策のウォームアップリクエストが必要だった。
// R2は静的ファイルを直接公開URLで配信できるため、その種の複雑さは不要になった。
// ここでの「取得」は、実体としては Image オブジェクトによるプリロードであり、
// 実際の画像データはブラウザの標準HTTPキャッシュに委ねる。
//
// 使い方（engine.js から）:
//   await AssetCache.init();                        // 何もしない（互換性のために残置）
//   await AssetCache.fetchGroup("common");           // commonグループの画像を全てプリロード
//   AssetCache.get("marico_normal");                 // 画像URL（文字列）を同期的に返す
//   AssetCache.fetchGroup("route_marico");           // ルート選択後に追加プリロード
window.AssetCache = (() => {
  "use strict";

  // 素材ID -> URL のマップ。ASSET_GROUPSに載っているIDは常にURLが引ける
  // （実ファイルの存在確認はプリロード時に行う）。
  const urlCache = {};
  Object.keys(window.ASSET_GROUPS || {}).forEach((id) => {
    urlCache[id] = window.ASSET_BASE_URL + id + ".png";
  });

  const loadedGroups = new Set();
  const inFlightFetches = new Map();

  function idsInGroup(groupName) {
    const groups = window.ASSET_GROUPS || {};
    return Object.keys(groups).filter((id) => groups[id].includes(groupName));
  }

  // 1枚の画像をプリロードする。失敗しても例外は投げず警告を出すだけにする
  // （1枚欠けても他の画像表示やゲーム進行は止めたくないため）。
  function preloadOne(id) {
    return new Promise((resolve) => {
      const url = urlCache[id];
      if (!url) { resolve(); return; }
      const img = new Image();
      img.onload = () => resolve();
      img.onerror = () => {
        console.warn("[AssetCache] failed to preload:", id, url);
        resolve();
      };
      img.src = url;
    });
  }

  function fetchGroup(groupName) {
    if (loadedGroups.has(groupName)) return Promise.resolve();

    const existing = inFlightFetches.get(groupName);
    if (existing) return existing;

    const ids = idsInGroup(groupName);
    const promise = Promise.all(ids.map(preloadOne))
      .then(() => { loadedGroups.add(groupName); })
      .finally(() => { inFlightFetches.delete(groupName); });
    inFlightFetches.set(groupName, promise);
    return promise;
  }

  function get(assetId) {
    return urlCache[assetId];
  }

  async function init() {
    // R2移行によりウォームアップやIndexedDB読み込みは不要になったが、
    // engine.js側の呼び出し互換性のため関数自体は残す。
  }

  return { init, fetchGroup, get };
})();
