// スモークテスト: dist を静的サーバーで配信し、ヘッドレス Chromium で全ルートを通しプレイする。
// 画像・音声(R2)・Webフォントへの通信はスタブにして、外部ネットワークに依存しない。
// 台本の途中の選択、2つのクイズ（正解/不正解）、3種類のエンディングまでを確認する。
// 使い方: npm run build && npm test
import { chromium } from "playwright";
import { createServer } from "node:http";
import { existsSync, readFileSync, statSync } from "node:fs";
import { extname, join, resolve } from "node:path";

const root = resolve(new URL("..", import.meta.url).pathname);
const dist = join(root, "dist");
if (!existsSync(join(dist, "index.html"))) {
  console.error("dist がありません。先に npm run build を実行してください");
  process.exit(1);
}
const readJson = (p) => JSON.parse(readFileSync(join(root, p), "utf8"));
const endings = readJson("data/endings.json");
const silence = readFileSync(join(root, "tests/fixtures/silence.mp3"));
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGD4DwABBAEAHzWKQgAAAABJRU5ErkJggg==", "base64");

// ---- 静的サーバー ----
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png" };
const server = createServer((req, res) => {
  const path = decodeURIComponent((req.url ?? "/").split("?")[0]);
  const file = join(dist, path === "/" ? "index.html" : path);
  if (!file.startsWith(dist) || !existsSync(file) || !statSync(file).isFile()) {
    res.writeHead(404).end();
    return;
  }
  res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" }).end(readFileSync(file));
});
await new Promise((r) => server.listen(4175, r));
const base = "http://localhost:4175/";

const browser = await chromium.launch();
const failures = [];
const assert = (cond, msg) => {
  if (!cond) throw new Error(msg);
};

async function newPage(errors) {
  const page = await browser.newPage({ viewport: { width: 1100, height: 700 } });
  page.on("pageerror", (e) => errors.push(`pageerror: ${e}`));
  page.on("console", (m) => m.type() === "error" && errors.push(`console: ${m.text()}`));
  await page.route("**/*", (route) => {
    const url = route.request().url();
    if (url.startsWith(base)) return route.continue();
    if (url.includes("r2.dev")) {
      return url.endsWith(".mp3")
        ? route.fulfill({ status: 200, contentType: "audio/mpeg", body: silence })
        : route.fulfill({ status: 200, contentType: "image/png", body: png });
    }
    if (url.includes("fonts.googleapis.com")) return route.fulfill({ status: 200, contentType: "text/css", body: "" });
    return route.fulfill({ status: 204, body: "" });
  });
  await page.goto(base);
  await page.waitForSelector("#screen-title.active");
  return page;
}

const isVisible = (page, sel) => page.evaluate((s) => { const e = document.querySelector(s); return !!e && !e.hidden && getComputedStyle(e).display !== "none"; }, sel);

// 台本を最後（選択肢）まで進める。小道具ビューアが開いたら閉じる。
async function advanceToChoice(page, label) {
  for (let i = 0; i < 600; i++) {
    if (await isVisible(page, "#choice-layer")) return;
    if (await isVisible(page, "#item-viewer")) {
      await page.click("#btn-item-close");
      continue;
    }
    const text = await page.textContent("#line-text");
    assert(!text.includes("〈主人公の名前〉"), `${label}: 名前の置換が行われていない: ${text.slice(0, 30)}`);
    await page.mouse.click(550, 300);
    await page.waitForTimeout(15);
  }
  throw new Error(`${label}: 選択肢が現れない`);
}

async function chooseOption(page, index) {
  await page.waitForSelector("#choice-list button");
  await page.locator("#choice-list button").nth(index).click();
  // 選択肢の枠が閉じるのを待つ（閉じる前に次の待機が終わって、古い選択肢を押してしまわないように）
  await page.waitForSelector("#choice-layer", { state: "hidden" });
}

// ルートを1本、通しでプレイする。bond: "good"|"bad"、q1/q2: 正解を選ぶか。
async function playRoute({ routeId, optionIndex, gender, bond, q1Correct, q2Correct, name }) {
  const label = routeId;
  const errors = [];
  const page = await newPage(errors);
  try {
    await page.click("#btn-start");
    await page.waitForSelector("#screen-name-input.active");
    await page.fill("#input-player-name", name);
    if (gender === "f") await page.click("#btn-gender-f");
    await page.click("#btn-name-confirm");
    await page.waitForSelector("#screen-novel.active", { timeout: 15000 });

    await advanceToChoice(page, `${label} 共通導入`);
    await chooseOption(page, optionIndex);

    await advanceToChoice(page, `${label} ルート`);
    const script = readJson(`data/script_${routeId.replace("route_", "")}.json`);
    await chooseOption(page, script.choice.options.findIndex((o) => o.bond === bond));

    // ---- 推理パート ----
    await page.waitForSelector("#screen-quiz.active");
    const quiz = readJson(`data/quiz_${routeId.replace("route_", "")}.json`);
    await page.click("#btn-quiz-submit"); // 手がかりを整理する
    const q1 = quiz.quiz1_contradiction;
    const pair = q1Correct ? q1.correctPair : q1.cards.map((c) => c.id).filter((id) => !q1.correctPair.includes(id)).slice(0, 2);
    for (const id of pair) await page.click(`#quiz-cards-contradiction .quiz-card[data-id="${id}"]`);
    await page.click("#btn-quiz-submit");
    await page.waitForSelector("#quiz-result:not([hidden])");
    const v1 = await page.textContent("#quiz-result-verdict");
    assert(q1Correct ? v1.includes("成立") && !v1.includes("不成立") : v1.includes("不成立"), `${label}: 設問1の判定が想定と違う: ${v1}`);
    await page.click("#btn-quiz-next");

    const q2 = quiz.quiz2_timeline;
    const order = q2Correct ? q2.correctOrder : [...q2.correctOrder].reverse();
    await page.waitForSelector("#quiz-timeline:not([hidden])");
    for (const id of order) await page.click(`#quiz-cards-timeline .quiz-card[data-id="${id}"]`);
    await page.click("#btn-quiz-submit");
    await page.waitForSelector("#quiz-result:not([hidden])");
    const v2 = await page.textContent("#quiz-result-verdict");
    assert(q2Correct ? v2.includes("成立") && !v2.includes("不成立") : v2.includes("不成立"), `${label}: 設問2の判定が想定と違う: ${v2}`);
    await page.click("#btn-quiz-next");

    // ---- エンディング ----
    const correct = (q1Correct ? 1 : 0) + (q2Correct ? 1 : 0);
    const key = correct === 2 ? (bond === "good" ? "true" : "merry_bad") : correct === 1 ? (bond === "good" ? "merry_bad" : "bad") : "bad";
    for (let i = 0; i < 600 && !(await page.evaluate(() => document.getElementById("screen-end").classList.contains("active"))); i++) {
      if (await isVisible(page, "#item-viewer")) await page.click("#btn-item-close");
      await page.mouse.click(550, 300);
      await page.waitForTimeout(15);
    }
    const endText = await page.textContent("#end-message");
    assert(endText.includes(endings[routeId][key].title), `${label}: エンディングが想定(${key})と違う: ${endText.slice(0, 40)}`);
    assert(errors.length === 0, `${label}: ブラウザエラー: ${errors.join(" | ")}`);
    console.log(`PASS ${label}  (${key} エンディング)`);
  } catch (e) {
    failures.push(`${label}: ${e.message}`);
    console.error(`FAIL ${label}: ${e.message}`);
    // 失敗時の画面の状態（原因調査用）
    const state = await page
      .evaluate(() => ({
        screens: [...document.querySelectorAll(".screen.active")].map((x) => x.id),
        line: document.getElementById("line-text")?.textContent.slice(0, 40),
        choicePrompt: document.getElementById("choice-prompt")?.textContent,
        choiceHidden: document.getElementById("choice-layer")?.hidden
      }))
      .catch(() => null);
    console.error("  画面の状態:", JSON.stringify(state), "errors:", JSON.stringify(errors.slice(0, 3)));
  } finally {
    await page.close();
  }
}

// 3ルートで、3種類のエンディングを一巡する
await playRoute({ routeId: "route_marico", optionIndex: 0, gender: "m", bond: "good", q1Correct: true, q2Correct: true, name: "テスト太郎" });
await playRoute({ routeId: "route_niko", optionIndex: 1, gender: "f", bond: "bad", q1Correct: false, q2Correct: false, name: "テスト花子" });
await playRoute({ routeId: "route_nina", optionIndex: 2, gender: "m", bond: "good", q1Correct: true, q2Correct: false, name: "テスト次郎" });

// ---- その他のUI: ルート選択スキップ・設定・ミュート ----
{
  const errors = [];
  const page = await newPage(errors);
  try {
    await page.click("#btn-continue"); // ルート選択へ（スキップ）
    await page.waitForSelector("#screen-name-input.active");
    await page.fill("#input-player-name", "スキップ");
    await page.click("#btn-name-confirm");
    await page.waitForSelector("#choice-layer:not([hidden])", { timeout: 15000 });
    assert((await page.locator("#choice-list button").count()) === 3, "ルート選択の選択肢が3つでない");

    const before = await page.getAttribute("#btn-mute-toggle", "aria-pressed");
    await page.click("#btn-mute-toggle");
    assert((await page.getAttribute("#btn-mute-toggle", "aria-pressed")) !== before, "ミュートが切り替わらない");
    await page.click("#btn-config-open");
    assert(await isVisible(page, "#config-overlay"), "設定画面が開かない");
    await page.click("#btn-config-close");
    assert(!(await isVisible(page, "#config-overlay")), "設定画面が閉じない");

    // ホームボタン: タイトル以外で表示され、1回押しでは戻らず（誤操作防止）、2回目で戻る。猶予を過ぎると元の表示に戻る
    assert(await isVisible(page, "#btn-home"), "ホームボタンが表示されていない");
    await page.click("#btn-home");
    assert((await page.textContent("#btn-home")).includes("もう一度"), "1回押しで確認表示にならない");
    assert(await page.evaluate(() => document.getElementById("screen-novel").classList.contains("active")), "1回押しでホームへ戻ってしまった");
    await page.waitForFunction(() => document.getElementById("btn-home").textContent === "ホーム", null, { timeout: 5000 });
    await page.click("#btn-home");
    await page.click("#btn-home");
    await page.waitForSelector("#screen-title.active");
    assert(!(await isVisible(page, "#btn-home")), "タイトル画面にホームボタンが表示されている");
    // 設定メニューの「タイトルへ戻る」も従来どおり動く
    await page.click("#btn-start");
    await page.waitForSelector("#screen-name-input.active");
    await page.click("#btn-config-open");
    await page.click("#btn-config-title");
    await page.waitForSelector("#screen-title.active");
    assert(errors.length === 0, `ブラウザエラー: ${errors.join(" | ")}`);
    console.log("PASS ルート選択スキップ・設定・ミュート・ホームボタン");
  } catch (e) {
    failures.push(`UI: ${e.message}`);
    console.error(`FAIL UI: ${e.message}`);
  } finally {
    await page.close();
  }
}

await browser.close();
server.close();
if (failures.length) {
  console.error(`\n${failures.length} 件失敗`);
  process.exit(1);
}
console.log("\nすべて成功");
