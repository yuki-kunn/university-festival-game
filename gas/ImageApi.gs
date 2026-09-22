/**
 * 不在証明 - 画像素材配信API (Google Apps Script)
 *
 * Google Drive にアップロードした画像素材を、ゲーム（フロントエンド）から
 * fetch で取得できる形（JSON: 素材ID -> Base64 Data URI）で配信する。
 *
 * 【方式についての注意】
 * `https://drive.google.com/uc?export=view&id=...` のような直リンクURLは、
 * Google側の仕様変更により403エラーが頻発するようになり、2025年時点では
 * <img>タグでの利用に適さない。また GAS の Web アプリは ContentService で
 * テキストしか返せず、画像バイナリをそのまま image/png 等のレスポンスとして
 * 返すことができない。そのため、各画像をBase64エンコードし、JSONの中に
 * "data:image/png;base64,...." という Data URI として埋め込んで返す方式を採用する。
 *
 * 【グループ分割について】
 * 全画像を一度に返すと、画像枚数・サイズによってはレスポンスが数MB〜十数MBに
 * なり、取得に長時間かかる（体感でフリーズしたように見える）。
 * そのため、素材を用途別の「グループ」に分け、?group=xxx パラメータで
 * 必要なグループだけを取得できるようにしている。
 * フロント側は、起動時に "common"（共通導入で使う最小セット）だけを取得し、
 * プレイヤーがルートを選んだ時点でそのルート専用グループを追加取得する
 * 設計を想定している（詳細は assets/js/engine.js 参照）。
 *
 * セットアップ手順:
 * 1. https://script.google.com/ で新規プロジェクトを作成し、このファイルの内容を貼り付ける
 * 2. 下記 ROOT_FOLDER_ID に、素材が入っている親フォルダ（「画像素材」フォルダ）のIDを設定する
 * 3. 下記 ASSET_GROUPS に、素材ID（ファイル名から拡張子を除いたもの）ごとの
 *    グループ分類を設定する（新しい画像を追加した場合はここに追記する）
 * 4. 「デプロイ」→「新しいデプロイ」→種類「ウェブアプリ」を選択
 *    - 実行するユーザー: 自分
 *    - アクセスできるユーザー: 全員
 * 5. 発行された /exec で終わるURLを、ゲーム側の assets/js/asset-api-config.js に設定する
 * 6. コードやASSET_GROUPSを変更した場合は、既存のデプロイを編集して
 *    「新しいバージョン」として再デプロイしないと変更が反映されない
 *
 * 呼び出し例:
 *   GET {exec_url}                 -> 全画像（動作確認・デバッグ用。本番では非推奨）
 *   GET {exec_url}?group=common    -> commonグループの画像のみ
 *   GET {exec_url}?group=route_marico&group=route_niko -> 複数グループを一度に指定
 *
 * レスポンス形式:
 * {
 *   "ok": true,
 *   "updatedAt": "2026-09-22T03:40:00.000Z",
 *   "group": "common",
 *   "images": {
 *     "clubroom_day": "data:image/png;base64,iVBORw0KG...",
 *     ...
 *   },
 *   "errors": []
 * }
 */

// ==== 設定：ここを書き換える ====
var ROOT_FOLDER_ID = "1zpjFm-_Z9gfsGL86GBmMtsoclBYdqm9X"; // 「画像素材」フォルダのID

// 素材ID（ファイル名から拡張子を除いたもの） -> 所属グループ（複数可）
// ここに載っていない素材IDは "misc" グループとして扱われる
var ASSET_GROUPS = {
  // --- common: タイトル〜共通導入〜バディ選択までに必要な最小セット ---
  "marico_normal": ["common"],
  "niko_normal": ["common"],
  "nina_normal": ["common"],
  "mc_normal_m": ["common"],
  "mc_normal_f": ["common"],
  "clubroom_day": ["common"],
  "corridor": ["common"],
  "unknown_student": ["common"],

  // --- extras: 集合写真など、共通導入の必須表示には使わず、
  //     アイテムビューア等で個別に参照する画像（性別出し分けもここに含む） ---
  "group_photo_m": ["extras"],
  "group_photo_f": ["extras"],

  // --- route_marico: マリコルート選択後に必要 ---
  "marico_scared": ["route_marico"],
  "broadcast_room": ["route_marico"],
  "mc_serious_m": ["route_marico", "route_niko"],
  "mc_serious_f": ["route_marico", "route_niko"],

  // --- route_niko: ニコルート選択後に必要 ---
  "niko_serious": ["route_niko"],
  "library": ["route_niko"],

  // --- route_nina: ニナルート選択後に必要 ---
  "nina_fading": ["route_nina"],
  "clubroom_night": ["route_nina"],
  "mirror_closeup": ["route_nina"]
};

// キャッシュ有効時間（秒）。CacheServiceの上限は21600秒(6時間)。
// 展示中に画像を差し替えた際は ?refresh=1 を付けてアクセスすれば即座に反映される。
var CACHE_TTL_SECONDS = 1800;

// 1枚あたりの元ファイルサイズ上限（バイト）。これを超える画像はAPIレスポンスに含めない
var MAX_FILE_SIZE_BYTES = 1.5 * 1024 * 1024; // 1.5MB

function doGet(e) {
  var forceRefresh = e && e.parameter && e.parameter.refresh === "1";
  var groups = extractGroupParam(e);

  var fullPayload = forceRefresh ? buildImageMap() : getCachedImageMap();
  var payload = filterPayloadByGroups(fullPayload, groups);

  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

// e.parameter.group は複数指定時 "route_marico,route_niko" のようなカンマ区切り、
// または e.parameters.group が配列（?group=a&group=b形式）で渡ってくる場合の両対応
function extractGroupParam(e) {
  if (!e || !e.parameter) return null;
  if (e.parameters && e.parameters.group && e.parameters.group.length) {
    var groups = [];
    e.parameters.group.forEach(function (g) {
      groups = groups.concat(g.split(","));
    });
    return groups;
  }
  if (e.parameter.group) {
    return e.parameter.group.split(",");
  }
  return null;
}

function filterPayloadByGroups(payload, groups) {
  if (!groups || groups.length === 0) {
    // グループ指定なし：全件返す（デバッグ用途。本番のフロントは必ずgroupを指定する）
    return payload;
  }
  var groupSet = {};
  groups.forEach(function (g) { groupSet[g.trim()] = true; });

  var filteredImages = {};
  for (var id in payload.images) {
    var idGroups = ASSET_GROUPS[id] || ["misc"];
    var matched = idGroups.some(function (g) { return groupSet[g]; });
    if (matched) {
      filteredImages[id] = payload.images[id];
    }
  }

  return {
    ok: payload.ok,
    updatedAt: payload.updatedAt,
    group: groups.join(","),
    images: filteredImages,
    errors: payload.errors
  };
}

function getCachedImageMap() {
  var cache = CacheService.getScriptCache();
  var cached = getLargeCache(cache, "image_map_v2");
  if (cached) {
    try {
      return JSON.parse(cached);
    } catch (err) {
      // キャッシュ破損時は再構築にフォールバック
    }
  }
  var payload = buildImageMap();
  try {
    putLargeCache(cache, "image_map_v2", JSON.stringify(payload), CACHE_TTL_SECONDS);
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

function getLargeCache(cache, key) {
  var countStr = cache.get(key + "__count");
  if (!countStr) return null;
  var count = parseInt(countStr, 10);
  var keys = [];
  for (var i = 0; i < count; i++) keys.push(key + "__" + i);
  var chunkMap = cache.getAll(keys);
  var result = "";
  for (var j = 0; j < count; j++) {
    var chunk = chunkMap[key + "__" + j];
    if (chunk === undefined) return null; // 一部欠落していたら無効なキャッシュとして扱う
    result += chunk;
  }
  return result;
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
    var groups = ASSET_GROUPS[key] || ["misc"];
    summary.images[key] = "[" + groups.join(",") + "] " + payload.images[key].substring(0, 30) + "... (" + payload.images[key].length + " chars)";
  }
  Logger.log(JSON.stringify(summary, null, 2));
}

/**
 * 手動実行用：グループごとのおおよそのレスポンスサイズを確認するための関数。
 * 展示前に、commonグループが十分軽量か確認するために使う。
 */
function debugGroupSizes() {
  var payload = buildImageMap();
  var groupSizes = {};
  for (var key in payload.images) {
    var groups = ASSET_GROUPS[key] || ["misc"];
    var size = payload.images[key].length;
    groups.forEach(function (g) {
      groupSizes[g] = (groupSizes[g] || 0) + size;
    });
  }
  var summary = {};
  for (var g in groupSizes) {
    summary[g] = Math.round(groupSizes[g] / 1024) + " KB (Base64文字数ベース)";
  }
  Logger.log(JSON.stringify(summary, null, 2));
}
