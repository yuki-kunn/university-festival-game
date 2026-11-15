// 素材の死活確認（ネットワーク）。画像・音声は Cloudflare R2 から配信しているため、
// 設定にあるIDのファイルが実際に存在するかを確認する。
// 存在しない(404等)場合は失敗。通信エラー（ネットワーク不調）は警告だけにして成功扱いにする。
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(new URL("..", import.meta.url).pathname);
function loadWindowConfig(path) {
  const w = {};
  new Function("window", readFileSync(resolve(root, path), "utf8"))(w);
  return w;
}
const asset = loadWindowConfig("assets/js/asset-config.js");
const audio = loadWindowConfig("assets/js/audio-config.js");

const targets = [
  ...Object.keys(asset.ASSET_GROUPS).map((id) => ({ name: `image:${id}`, url: `${asset.ASSET_BASE_URL}${id}.png`, type: "image/" })),
  ...Object.entries(audio.AUDIO_SOURCES.bgm).map(([k, url]) => ({ name: `bgm:${k}`, url, type: "audio/" })),
  ...Object.entries(audio.AUDIO_SOURCES.se).map(([k, url]) => ({ name: `se:${k}`, url, type: "audio/" }))
];

async function probe(t) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(t.url, { method: "HEAD", signal: AbortSignal.timeout(15000) });
      if (res.status >= 400 && res.status < 500) return { ...t, status: "missing", detail: `HTTP ${res.status}` };
      if (res.status >= 500) throw new Error(`HTTP ${res.status}`);
      const ct = res.headers.get("content-type") ?? "";
      if (!ct.startsWith(t.type)) return { ...t, status: "missing", detail: `content-type が ${ct}（${t.type}* を想定）` };
      return { ...t, status: "ok" };
    } catch (e) {
      if (attempt === 3) return { ...t, status: "error", detail: String(e.message ?? e) };
      await new Promise((r) => setTimeout(r, 1000 * attempt));
    }
  }
}

const results = await Promise.all(targets.map(probe));
const missing = results.filter((r) => r.status === "missing");
const errors = results.filter((r) => r.status === "error");
for (const r of results) console.log(`${r.status === "ok" ? "OK     " : r.status === "missing" ? "MISSING" : "ERROR  "} ${r.name}${r.detail ? `  ${r.detail}` : ""}`);
console.log(`\n${results.length} 件中: 存在 ${results.length - missing.length - errors.length} / 見つからない ${missing.length} / 通信エラー ${errors.length}`);
if (errors.length) console.warn("通信エラーがあったため、一部は確認できていません（失敗扱いにはしません）");
if (missing.length) process.exit(1);
