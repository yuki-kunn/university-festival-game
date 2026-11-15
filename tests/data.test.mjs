// データ検証（ブラウザ不要）。台本・クイズ・エンディングのJSONと、エンジン(engine.js)・
// 素材設定(asset-config.js / audio-config.js)の定義が食い違っていないかを確認する。
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(new URL("..", import.meta.url).pathname);
const read = (p) => readFileSync(resolve(root, p), "utf8");
const readJson = (p) => JSON.parse(read(p));
const failures = [];
const fail = (msg) => failures.push(msg);

// ---- engine.js から定数のオブジェクトリテラルを取り出す ----
const engineText = read("assets/js/engine.js");
function extract(name) {
  const m = new RegExp(`const ${name}\\s*=\\s*`).exec(engineText);
  if (!m) throw new Error(`engine.js に ${name} が見つからない`);
  const start = engineText.indexOf("{", m.index);
  let depth = 0;
  let end = start;
  for (; end < engineText.length; end++) {
    const c = engineText[end];
    if (c === "{") depth++;
    else if (c === "}" && --depth === 0) break;
  }
  return new Function(`"use strict"; return (${engineText.slice(start, end + 1)});`)();
}
const SCRIPT_SOURCES = extract("SCRIPT_SOURCES");
const QUIZ_DATA_SOURCES = extract("QUIZ_DATA_SOURCES");
const CHAR_IMAGE_ID = extract("CHAR_IMAGE_ID");
const CHAR_TENSE_IMAGE_ID = extract("CHAR_TENSE_IMAGE_ID");
const MC_TENSE_IMAGE_ID = extract("MC_TENSE_IMAGE_ID");
const BG_IMAGE_ID = extract("BG_IMAGE_ID");
const ROUTE_ASSET_GROUP = extract("ROUTE_ASSET_GROUP");
const ENDING_BGM_KEY = extract("ENDING_BGM_KEY");
const ITEM_IMAGE_SOURCES = extract("ITEM_IMAGE_SOURCES");
const TENSE_SCENE_START_INDEX = extract("TENSE_SCENE_START_INDEX");
const ENDINGS_SRC = /const ENDINGS_SRC\s*=\s*"([^"]+)"/.exec(engineText)?.[1];

// ---- window を差し込んで設定ファイルを評価する ----
function loadWindowConfig(path) {
  const w = {};
  new Function("window", read(path))(w);
  return w;
}
const assetCfg = loadWindowConfig("assets/js/asset-config.js");
const audioCfg = loadWindowConfig("assets/js/audio-config.js");

// "放送" は無人放送の声。立ち絵なしで表示される（CHAR_IMAGE_ID にないのは意図どおり）。
const SPEAKERS = new Set([null, "放送", "主人公", ...Object.keys(CHAR_IMAGE_ID)]);
const KNOWN_PLACEHOLDERS = new Set(["〈主人公の名前〉"]);
const routeIds = Object.keys(QUIZ_DATA_SOURCES);

function checkLines(lines, label) {
  if (!Array.isArray(lines) || lines.length === 0) return fail(`${label}: lines が空`);
  lines.forEach((ln, i) => {
    const at = `${label} ${i + 1}行目`;
    // 小道具を見せる行（item + caption）は、本文(text)を持たない
    if (ln.item === undefined && (typeof ln.text !== "string" || ln.text.trim() === "")) fail(`${at}: text が空`);
    if (!SPEAKERS.has(ln.speaker ?? null)) fail(`${at}: 未知の話者 "${ln.speaker}"（立ち絵が出ない）`);
    for (const m of String(ln.text).match(/[〈＜][^〉＞]*[〉＞]/g) ?? []) {
      if (!KNOWN_PLACEHOLDERS.has(m)) fail(`${at}: 置換されない記号 ${m}（エンジンが置換するのは 〈主人公の名前〉 のみ）`);
    }
    if (ln.item !== undefined) {
      if (ln.item !== "group_photo" && !ITEM_IMAGE_SOURCES[ln.item]) fail(`${at}: 未知の小道具 "${ln.item}"`);
      if (!ln.caption) fail(`${at}: 小道具に caption がない`);
    }
  });
}

// ---- 台本 ----
const validTargets = new Set([...Object.keys(SCRIPT_SOURCES), "quiz_common"]);
for (const [id, path] of Object.entries(SCRIPT_SOURCES)) {
  if (!existsSync(resolve(root, path))) {
    fail(`${path}: ファイルがない`);
    continue;
  }
  const script = readJson(path);
  if (script.id !== id) fail(`${path}: id が "${script.id}"（エンジンの定義は "${id}"）`);
  checkLines(script.lines, path);
  const options = script.choice?.options ?? [];
  if (options.length === 0) fail(`${path}: 選択肢がない`);
  for (const opt of options) {
    if (!opt.label) fail(`${path}: 選択肢の label が空`);
    if (!validTargets.has(opt.next)) fail(`${path}: 選択肢の遷移先 "${opt.next}" が存在しない`);
  }
  if (id === "common_intro") {
    const targets = options.map((o) => o.next).sort().join(",");
    if (targets !== routeIds.slice().sort().join(",")) fail(`${path}: 共通導入の選択肢が全ルートに通じていない (${targets})`);
  } else {
    const bonds = new Set(options.map((o) => o.bond));
    if (!options.every((o) => o.next === "quiz_common")) fail(`${path}: ルートの選択肢は quiz_common へ進む必要がある`);
    if (!bonds.has("good") || !bonds.has("bad")) fail(`${path}: 選択肢に good と bad の両方の bond が必要 (${[...bonds]})`);
    const tense = TENSE_SCENE_START_INDEX[id];
    if (typeof tense === "number" && tense >= script.lines.length) fail(`${path}: 緊迫シーンの開始行(${tense})が行数(${script.lines.length})を超えている`);
  }
}

// ---- クイズ ----
for (const [routeId, path] of Object.entries(QUIZ_DATA_SOURCES)) {
  if (!existsSync(resolve(root, path))) {
    fail(`${path}: ファイルがない`);
    continue;
  }
  const quiz = readJson(path);
  if (quiz.id !== `quiz_${routeId.replace("route_", "")}`) fail(`${path}: id が不正 (${quiz.id})`);
  checkLines(quiz.intro?.lines, `${path} intro`);

  const q1 = quiz.quiz1_contradiction;
  const ids1 = q1.cards.map((c) => c.id);
  if (new Set(ids1).size !== ids1.length) fail(`${path}: 設問1のカードIDが重複`);
  if (q1.correctPair.length !== 2 || new Set(q1.correctPair).size !== 2 || !q1.correctPair.every((id) => ids1.includes(id))) {
    fail(`${path}: correctPair が不正 (${q1.correctPair})`);
  }
  for (const k of ["title", "prompt", "explanationCorrect", "explanationWrong"]) if (!q1[k]) fail(`${path}: 設問1の ${k} が空`);

  const q2 = quiz.quiz2_timeline;
  const ids2 = q2.cards.map((c) => c.id);
  if (new Set(ids2).size !== ids2.length) fail(`${path}: 設問2のカードIDが重複`);
  if (q2.correctOrder.length !== ids2.length || [...q2.correctOrder].sort().join() !== [...ids2].sort().join()) {
    fail(`${path}: correctOrder がカード全体の並べ替えになっていない`);
  }
  for (const k of ["title", "prompt", "explanationCorrect", "explanationWrong"]) if (!q2[k]) fail(`${path}: 設問2の ${k} が空`);
}

// ---- エンディング（クイズ結果と絆の全組み合わせで必要な3種） ----
if (!ENDINGS_SRC || !existsSync(resolve(root, ENDINGS_SRC))) {
  fail(`エンディングデータ (${ENDINGS_SRC}) がない`);
} else {
  const endings = readJson(ENDINGS_SRC);
  for (const routeId of routeIds) {
    for (const key of ["true", "merry_bad", "bad"]) {
      const e = endings[routeId]?.[key];
      if (!e) {
        fail(`${ENDINGS_SRC}: ${routeId} の ${key} エンディングがない`);
        continue;
      }
      if (!e.title) fail(`${ENDINGS_SRC}: ${routeId}.${key} の title が空`);
      checkLines(e.lines, `${ENDINGS_SRC} ${routeId}.${key}`);
      if (!ENDING_BGM_KEY[key]) fail(`engine.js: ENDING_BGM_KEY に ${key} がない`);
    }
  }
}

// ---- 画像・音声の設定とエンジンの対応 ----
const assetIds = new Set(Object.keys(assetCfg.ASSET_GROUPS));
const usedIds = [
  ...Object.values(CHAR_IMAGE_ID), ...Object.values(CHAR_TENSE_IMAGE_ID), ...Object.values(MC_TENSE_IMAGE_ID),
  ...Object.values(BG_IMAGE_ID), "mc_normal_m", "mc_normal_f", "group_photo_m", "group_photo_f"
];
for (const id of usedIds) if (!assetIds.has(id)) fail(`asset-config.js: エンジンが使う素材ID "${id}" が ASSET_GROUPS にない`);
const groups = new Set(Object.values(assetCfg.ASSET_GROUPS).flat());
for (const g of ["common", "extras", ...Object.values(ROUTE_ASSET_GROUP)]) if (!groups.has(g)) fail(`asset-config.js: グループ "${g}" に素材がない`);
if (!/^https:\/\/.+\/$/.test(assetCfg.ASSET_BASE_URL ?? "")) fail("asset-config.js: ASSET_BASE_URL が不正");

for (const key of Object.values(ENDING_BGM_KEY)) if (!audioCfg.AUDIO_SOURCES.bgm[key]) fail(`audio-config.js: BGM "${key}" がない`);
for (const m of engineText.matchAll(/playBgm\("([a-z_]+)"\)/g)) if (!audioCfg.AUDIO_SOURCES.bgm[m[1]]) fail(`engine.js: playBgm("${m[1]}") が audio-config.js にない`);
for (const m of engineText.matchAll(/playSe\("([a-z_]+)"\)/g)) if (!audioCfg.AUDIO_SOURCES.se[m[1]]) fail(`engine.js: playSe("${m[1]}") が audio-config.js にない`);

// ---- ローカルファイル ----
for (const [id, path] of Object.entries(ITEM_IMAGE_SOURCES)) {
  if (!existsSync(resolve(root, path))) fail(`小道具 ${id}: ${path} がない`);
  else if (!read(path).includes("<svg")) fail(`小道具 ${id}: ${path} がSVGでない`);
}
const html = read("index.html");
for (const m of html.matchAll(/(?:src|href)="((?:assets|data)\/[^"]+)"/g)) {
  if (!existsSync(resolve(root, m[1]))) fail(`index.html: 参照先 ${m[1]} がない`);
}

if (failures.length) {
  console.error(`\n${failures.length} 件失敗`);
  failures.forEach((f) => console.error(`  - ${f}`));
  process.exit(1);
}
console.log(`データ検証: すべて成功（台本${Object.keys(SCRIPT_SOURCES).length}本・クイズ${routeIds.length}本・エンディング${routeIds.length * 3}本）`);
