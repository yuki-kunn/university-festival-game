// 配信に必要なファイルだけを dist/ に集める（静的サイトなのでビルド処理は無い）。
// 台本のMarkdown(scenario/)や開発ドキュメント、ロゴ案(logo_drafts)は配信しない。
import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(new URL("..", import.meta.url).pathname);
const dist = join(root, "dist");

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });

cpSync(join(root, "index.html"), join(dist, "index.html"));
cpSync(join(root, "data"), join(dist, "data"), { recursive: true });
cpSync(join(root, "assets"), join(dist, "assets"), {
  recursive: true,
  filter: (src) => !src.includes(`${join("assets", "images", "ui", "logo_drafts")}`)
});

for (const required of ["index.html", "data/script_common.json", "assets/js/engine.js", "assets/css/style.css"]) {
  if (!existsSync(join(dist, required))) {
    console.error(`dist に ${required} がありません`);
    process.exit(1);
  }
}
console.log("dist を作成しました");
