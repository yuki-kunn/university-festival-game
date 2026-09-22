/**
 * 不在証明 - 画像素材配信API (Google Apps Script)
 *
 * Google Drive にアップロードした画像素材を、ゲーム（フロントエンド）から
 * fetch で取得できる形（JSON: 素材ID -> Base64 Data URI）で配信する。
 *
 * 【方式についての注意】
 * `https://drive.google.com/uc?export=view&id=...` のような直リンクURLは、
 * Google側の仕様変更により403エラーが頻発するようになり、2025年時点では
 * <img>タグでの利用に適さない（ブラウザ・タイミングによって表示できたり
 * できなかったりする）。
 * また GAS の Web アプリは ContentService でテキストしか返せず、画像バイナリを
 * そのまま image/png 等のレスポンスとして返すことができない。
 * そのため、このAPIは各画像を Base64 エンコードし、JSON の中に
 * "data:image/png;base64,...." という Data URI として埋め込んで返す方式を採用する。
 * ファイル自体を「リンクを知っている全員が閲覧可」に共有する必要もなく、
 * CORSや403の問題が構造的に起こらない。
 *
 * セットアップ手順:
 * 1. https://script.google.com/ で新規プロジェクトを作成し、このファイルの内容を貼り付ける
 * 2. 下記 ROOT_FOLDER_ID に、素材が入っている親フォルダ（「画像素材」フォルダ）のIDを設定する
 *    フォルダURL https://drive.google.com/drive/folders/XXXXXXXX の XXXXXXXX の部分
 * 3. 「デプロイ」→「新しいデプロイ」→種類「ウェブアプリ」を選択
 *    - 実行するユーザー: 自分
 *    - アクセスできるユーザー: 全員
 * 4. 発行された /exec で終わるURLを、ゲーム側の assets/js/asset-api-config.js に設定する
 * 5. Drive内の画像を追加・変更した場合、URLに ?refresh=1 を付けてアクセスすると
 *    キャッシュを無視して最新の状態を取得できる（普段は CACHE_TTL_SECONDS 秒間キャッシュされる）
 *
 * レスポンス形式:
 * {
 *   "ok": true,
 *   "updatedAt": "2026-09-22T03:40:00.000Z",
 *   "images": {
 *     "clubroom_day": "data:image/png;base64,iVBORw0KG...",
 *     "mc_normal_m": "data:image/png;base64,iVBORw0KG...",
 *     ...
 *   },
 *   "errors": []
 * }
 */

// ==== 設定：ここを書き換える ====
var ROOT_FOLDER_ID = "1zpjFm-_Z9gfsGL86GBmMtsoclBYdqm9X"; // 「画像素材」フォルダのID

// キャッシュ有効時間（秒）。CacheServiceの上限は21600秒(6時間)。
// 展示中に画像を差し替えた際は ?refresh=1 を付けてアクセスすれば即座に反映される。
var CACHE_TTL_SECONDS = 1800;

// 1枚あたりの元ファイルサイズ上限（バイト）。これを超える画像はAPIレスポンスに含めない
// （Base64化するとサイズが約1.37倍になり、CacheServiceの1エントリ100KB制限や
//  レスポンス全体の肥大化を招くため。上限を超える場合はDrive側で画像を圧縮すること）
var MAX_FILE_SIZE_BYTES = 1.5 * 1024 * 1024; // 1.5MB

function doGet(e) {
  var forceRefresh = e && e.parameter && e.parameter.refresh === "1";
  var payload = forceRefresh ? buildImageMap() : getCachedImageMap();
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

function getCachedImageMap() {
  var cache = CacheService.getScriptCache();
  var cached = cache.get("image_map_v1");
  if (cached) {
    try {
      return JSON.parse(cached);
    } catch (err) {
      // キャッシュ破損時は再構築にフォールバック
    }
  }
  var payload = buildImageMap();
  try {
    // CacheServiceの1キー上限は100KBのため、chunk分割して保存する
    putLargeCache(cache, "image_map_v1", JSON.stringify(payload), CACHE_TTL_SECONDS);
  } catch (err) {
    // キャッシュ保存に失敗しても致命的ではないため無視
  }
  return payload;
}

// CacheServiceは1エントリ最大100KBのため、大きなJSONは分割して保存・結合する
function putLargeCache(cache, key, value, ttl) {
  var CHUNK_SIZE = 90000;
  var chunks = [];
  for (var i = 0; i < value.length; i += CHUNK_SIZE) {
    chunks.push(value.substring(i, i + CHUNK_SIZE));
  }
  var meta = {};
  meta[key + "__count"] = String(chunks.length);
  cache.putAll(meta, ttl);
  var chunkMap = {};
  chunks.forEach(function (chunk, idx) {
    chunkMap[key + "__" + idx] = chunk;
  });
  cache.putAll(chunkMap, ttl);
}

function buildImageMap() {
  var images = {};
  var errors = [];

  try {
    var root = DriveApp.getFolderById(ROOT_FOLDER_ID);
    var subFolders = root.getFolders();
    while (subFolders.hasNext()) {
      scanFolderInto(subFolders.next(), images, errors);
    }
    // ルート直下に直接置かれたファイルにも対応
    scanFolderInto(root, images, errors);
  } catch (err) {
    errors.push(String(err));
  }

  return {
    ok: errors.length === 0,
    updatedAt: new Date().toISOString(),
    images: images,
    errors: errors
  };
}

function scanFolderInto(folder, images, errors) {
  var files = folder.getFiles();
  while (files.hasNext()) {
    var file = files.next();
    var mime = file.getMimeType();
    if (mime.indexOf("image/") !== 0) continue;

    var name = file.getName();
    var id = stripExtension(name);
    if (images[id]) continue; // 重複IDは先勝ち

    if (file.getSize() > MAX_FILE_SIZE_BYTES) {
      errors.push(name + " はサイズ上限(" + MAX_FILE_SIZE_BYTES + "bytes)を超えているためスキップしました（" + file.getSize() + "bytes）");
      continue;
    }

    try {
      images[id] = buildDataUri(file, mime);
    } catch (err) {
      errors.push(name + " の読み込みに失敗: " + String(err));
    }
  }
}

function stripExtension(filename) {
  var idx = filename.lastIndexOf(".");
  return idx === -1 ? filename : filename.substring(0, idx);
}

function buildDataUri(file, mime) {
  var blob = file.getBlob();
  var base64 = Utilities.base64Encode(blob.getBytes());
  return "data:" + mime + ";base64," + base64;
}

/**
 * 手動実行用：スクリプトエディタから実行して、正しくフォルダを読めているか
 * 実行ログ（表示 > ログ）で確認するための関数。
 * Base64本体は長すぎるため、ログにはIDと先頭50文字のみ出力する。
 */
function debugListImages() {
  var payload = buildImageMap();
  var summary = { ok: payload.ok, updatedAt: payload.updatedAt, errors: payload.errors, images: {} };
  for (var key in payload.images) {
    summary.images[key] = payload.images[key].substring(0, 50) + "... (" + payload.images[key].length + " chars)";
  }
  Logger.log(JSON.stringify(summary, null, 2));
}
