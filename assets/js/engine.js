(() => {
  "use strict";

  const SCRIPT_SOURCES = {
    common_intro: "data/script_common.json",
    route_marico: "data/script_marico.json",
    route_niko: "data/script_niko.json",
    route_nina: "data/script_nina.json"
  };

  const QUIZ_DATA_SRC = "data/quiz_common.json";
  const ENDINGS_SRC = "data/endings.json";

  const NOT_IMPLEMENTED_ROUTES = {};

  const scriptCache = {};
  let quizData = null;
  let endingsData = null;

  const el = {
    screens: {
      title: document.getElementById("screen-title"),
      nameInput: document.getElementById("screen-name-input"),
      loading: document.getElementById("screen-loading"),
      novel: document.getElementById("screen-novel"),
      notyet: document.getElementById("screen-notyet"),
      end: document.getElementById("screen-end"),
      quiz: document.getElementById("screen-quiz")
    },
    loadingText: document.getElementById("loading-text"),
    btnStart: document.getElementById("btn-start"),
    inputPlayerName: document.getElementById("input-player-name"),
    btnNameConfirm: document.getElementById("btn-name-confirm"),
    btnGenderM: document.getElementById("btn-gender-m"),
    btnGenderF: document.getElementById("btn-gender-f"),
    btnMuteToggle: document.getElementById("btn-mute-toggle"),
    btnBackTitle: document.getElementById("btn-back-title"),
    btnRestart: document.getElementById("btn-restart"),
    novelScreen: document.getElementById("screen-novel"),
    bgLayer: document.getElementById("bg-layer"),
    charLayer: document.getElementById("char-layer"),
    speakerName: document.getElementById("speaker-name"),
    lineText: document.getElementById("line-text"),
    textbox: document.getElementById("textbox"),
    nextIndicator: document.getElementById("next-indicator"),
    choiceLayer: document.getElementById("choice-layer"),
    choicePrompt: document.getElementById("choice-prompt"),
    choiceList: document.getElementById("choice-list"),
    notyetMessage: document.getElementById("notyet-message"),
    endMessage: document.getElementById("end-message"),

    itemViewer: document.getElementById("item-viewer"),
    itemViewerCaption: document.getElementById("item-viewer-caption"),
    itemViewerImage: document.getElementById("item-viewer-image"),
    btnItemClose: document.getElementById("btn-item-close"),

    quizScreen: document.getElementById("screen-quiz"),
    quizTitle: document.getElementById("quiz-title"),
    quizPrompt: document.getElementById("quiz-prompt"),
    quizCardsContradiction: document.getElementById("quiz-cards-contradiction"),
    quizTimelineWrap: document.getElementById("quiz-timeline"),
    quizTimelineSlots: document.getElementById("quiz-timeline-slots"),
    quizCardsTimeline: document.getElementById("quiz-cards-timeline"),
    btnTimelineReset: document.getElementById("btn-timeline-reset"),
    btnQuizSubmit: document.getElementById("btn-quiz-submit"),
    quizResult: document.getElementById("quiz-result"),
    quizResultVerdict: document.getElementById("quiz-result-verdict"),
    quizResultExplain: document.getElementById("quiz-result-explain"),
    btnQuizNext: document.getElementById("btn-quiz-next")
  };

  const state = {
    currentScriptId: null,
    lines: [],
    index: 0,
    isTyping: false,
    typingTimer: null,

    playthrough: {
      routeId: null,
      bond: null,
      quiz1Correct: null,
      quiz2Correct: null,
      playerName: null,
      playerGender: "m" // "m" | "f"。名前入力画面の性別選択で変更される
    }
  };

  const DEFAULT_PLAYER_NAME = "＜主人公＞";

  const quizState = {
    step: null,
    selectedContradiction: [],
    timelineOrder: [],
    timelineRemaining: []
  };

  const CHAR_CLASS = { "マリコ": "marico", "ニコ": "niko", "ニナ": "nina", "主人公": "mc" };

  // 話者名 -> 素材APIの画像ID（基本表情）
  const CHAR_IMAGE_ID = {
    "マリコ": "marico_normal",
    "ニコ": "niko_normal",
    "ニナ": "nina_normal"
    // "主人公" は性別によって画像が変わるため getCharImageId() で解決する
  };

  // ルートが緊迫する場面（scriptId + 行インデックスの下限）では、
  // 通常表情ではなく緊張・動揺した表情差分に切り替える。
  // 各シナリオ（data/script_*.json）を実際に読み、雰囲気が変わる行を
  // 基準に設定している（小道具のitem行挿入により行番号がずれるため、
  // 素材を追加した際はここも合わせて確認・更新すること）：
  //   マリコ（全43行）: 21行目「マリコの声色が、急に変わった」から動揺が始まる
  //   ニコ（全41行）  : 18行目「ニコ先輩の声が、珍しく硬くなる」から真剣な空気になる
  //   ニナ（全43行）  : 12行目「これ」「先輩の声が震えていた」から動揺が始まる
  const CHAR_TENSE_IMAGE_ID = {
    "マリコ": "marico_scared",
    "ニコ": "niko_serious",
    "ニナ": "nina_fading"
  };
  const TENSE_SCENE_START_INDEX = {
    route_marico: 21,
    route_niko: 18,
    route_nina: 12
  };

  // 主人公専用の緊張時表情（性別ごと）
  const MC_TENSE_IMAGE_ID = { m: "mc_serious_m", f: "mc_serious_f" };

  // このシーン（背景）に切り替わったら、通常より寄ったクローズアップ演出にする
  const CLOSEUP_BACKGROUNDS = new Set(["mirror"]);

  // 背景キー -> 素材APIの画像ID
  const BG_IMAGE_ID = {
    clubroom: "clubroom_day",
    clubroom_night: "clubroom_night",
    corridor: "corridor",
    broadcast: "broadcast_room",
    library: "library",
    mirror: "mirror_closeup"
  };

  // ルートID -> 追加取得すべき素材グループ名
  const ROUTE_ASSET_GROUP = {
    route_marico: "route_marico",
    route_niko: "route_niko",
    route_nina: "route_nina"
  };

  // ---- BGM/SE切り替えのタイミング定義 ----
  // data/script_common.json を実際に読み、雰囲気が変わる行を基準に設定：
  //   0-22行目: 平穏な日常パート → bgm_daily
  //   23行目  : 「部活動の終了を告げるチャイムが鳴った」→ se_chime
  //   27行目  : 「ザザ、という耳障りなノイズ」無人放送の発生 → se_broadcast_noise、以降 bgm_mystery
  const COMMON_INTRO_CHIME_INDEX = 23;
  const COMMON_INTRO_BROADCAST_INDEX = 27;

  // 各ルートの緊迫シーン開始行は、表情差分の切り替えと同じタイミング
  // （TENSE_SCENE_START_INDEX）で bgm_climax + se_cold_wind に切り替える。

  // クイズ正答数・絆に応じたエンディングキー -> BGMキー
  // （"merry_bad" は専用BGM素材がないため bad_end を流用する）
  const ENDING_BGM_KEY = {
    true: "true_end",
    merry_bad: "bad_end",
    bad: "bad_end"
  };

  let lastBgmSceneKey = null; // シーンBGM切り替えの重複呼び出しを防ぐ

  // シナリオの進行（scriptId + 行インデックス）に応じて、BGM/SEを更新する。
  // renderLineから毎行呼ばれるが、同じシーンキーの間は何もしない。
  function updateSceneAudio(scriptId, lineIndex) {
    let sceneKey = null;
    let bgmKey = null;

    if (scriptId === "common_intro") {
      if (lineIndex === COMMON_INTRO_CHIME_INDEX) {
        AudioManager.playSe("chime");
      }
      if (lineIndex === COMMON_INTRO_BROADCAST_INDEX) {
        AudioManager.playSe("broadcast_noise");
      }
      if (lineIndex < COMMON_INTRO_BROADCAST_INDEX) {
        sceneKey = "common_daily";
        bgmKey = "daily";
      } else {
        sceneKey = "common_mystery";
        bgmKey = "mystery";
      }
    } else if (TENSE_SCENE_START_INDEX[scriptId] !== undefined) {
      const tenseStart = TENSE_SCENE_START_INDEX[scriptId];
      if (lineIndex < tenseStart) {
        sceneKey = scriptId + "_tension";
        bgmKey = "tension";
      } else {
        sceneKey = scriptId + "_climax";
        bgmKey = "climax";
        if (lineIndex === tenseStart) {
          AudioManager.playSe("cold_wind");
        }
      }
    }

    if (sceneKey && sceneKey !== lastBgmSceneKey) {
      lastBgmSceneKey = sceneKey;
      if (bgmKey) AudioManager.playBgm(bgmKey);
    }
  }

  function showScreen(name) {
    Object.values(el.screens).forEach(s => s.classList.remove("active"));
    el.screens[name].classList.add("active");
  }

  // 素材グループの取得を待つ間、ローディング画面を表示する。
  // すでにキャッシュ済みで取得が一瞬（LOADING_SCREEN_DELAY_MS未満）で終わる場合は、
  // ローディング画面を一切表示せずそのまま進める（不要なちらつきを防ぐ）。
  const LOADING_SCREEN_DELAY_MS = 250;

  async function withLoadingScreen(promise, message) {
    let finished = false;
    promise.then(() => { finished = true; });

    await new Promise((resolve) => setTimeout(resolve, LOADING_SCREEN_DELAY_MS));

    if (!finished) {
      el.loadingText.textContent = message;
      showScreen("loading");
      await promise;
    }
  }

  async function loadScript(id) {
    if (scriptCache[id]) return scriptCache[id];
    const path = SCRIPT_SOURCES[id];
    const res = await fetch(path);
    const json = await res.json();
    scriptCache[id] = json;
    return json;
  }

  // ニナルートは「夜の部室（姿見の前に立つ）」→「鏡の中に生徒たちが
  // 見え始める（10行目）」で背景を切り替える2段階構成。
  // data/script_nina.jsonを実際に読み、以下を基準に設定している：
  //   0-9行目 : まだ何も起きていない夜の部室 → clubroom_night
  //   10行目〜: 「鏡の表面が僅かに揺らいだ」以降、鏡の中の異変が見え始める → mirror
  const NINA_MIRROR_START_INDEX = 10;

  function setBackground(scriptId, lineIndex) {
    let bg = "clubroom";
    if (scriptId === "common_intro" && lineIndex >= 25 && lineIndex < 42) bg = "corridor";
    if (scriptId === "route_marico") bg = "broadcast";
    if (scriptId === "route_niko") bg = "library";
    if (scriptId === "route_nina") bg = lineIndex >= NINA_MIRROR_START_INDEX ? "mirror" : "clubroom_night";

    const imageId = BG_IMAGE_ID[bg];
    const assetUrl = imageId && AssetCache.get(imageId);
    if (assetUrl) {
      el.bgLayer.style.backgroundImage = "url('" + assetUrl + "')";
      el.bgLayer.style.backgroundSize = "cover";
      el.bgLayer.style.backgroundPosition = "center";
      el.bgLayer.removeAttribute("data-bg");
    } else {
      el.bgLayer.style.backgroundImage = "";
      el.bgLayer.setAttribute("data-bg", bg);
    }
    return bg;
  }

  // 話者名 -> 表示すべき素材ID を解決する（主人公は性別で、
  // 各キャラは物語が緊迫する場面かどうかで出し分ける）
  function resolveCharImageId(speaker, scriptId, lineIndex) {
    const tenseStart = TENSE_SCENE_START_INDEX[scriptId];
    const isTenseScene = typeof tenseStart === "number" && lineIndex >= tenseStart;

    if (speaker === "主人公") {
      const gender = state.playthrough.playerGender === "f" ? "f" : "m";
      return isTenseScene ? MC_TENSE_IMAGE_ID[gender] : ("mc_normal_" + gender);
    }
    if (isTenseScene && CHAR_TENSE_IMAGE_ID[speaker]) {
      return CHAR_TENSE_IMAGE_ID[speaker];
    }
    return CHAR_IMAGE_ID[speaker];
  }

  function setCharacterPlaceholder(speaker, scriptId, lineIndex, bg) {
    el.charLayer.innerHTML = "";
    if (!speaker || !CHAR_CLASS[speaker]) return;

    const isCloseup = CLOSEUP_BACKGROUNDS.has(bg);

    // .char-frame は立ち絵を映す「窓」。中の画像をscaleで拡大し、
    // はみ出た部分をoverflow: hiddenでクロップしてバストアップ構図にする。
    const frame = document.createElement("div");
    frame.className = "char-frame";
    if (isCloseup) frame.setAttribute("data-shot", "close");

    const imageId = resolveCharImageId(speaker, scriptId, lineIndex);
    const assetUrl = imageId && AssetCache.get(imageId);
    if (assetUrl) {
      const img = document.createElement("img");
      img.className = "char-sprite";
      img.src = assetUrl;
      img.alt = speaker;
      frame.appendChild(img);
    } else {
      const div = document.createElement("div");
      div.className = "char-placeholder " + CHAR_CLASS[speaker];
      frame.appendChild(div);
    }
    el.charLayer.appendChild(frame);
  }

  function typeLine(text) {
    clearTimeout(state.typingTimer);
    state.isTyping = true;
    el.nextIndicator.style.visibility = "hidden";
    el.lineText.textContent = "";
    let i = 0;
    const speed = 28;

    function step() {
      if (i <= text.length) {
        el.lineText.textContent = text.slice(0, i);
        i++;
        state.typingTimer = setTimeout(step, speed);
      } else {
        state.isTyping = false;
        el.nextIndicator.style.visibility = "visible";
      }
    }
    step();
  }

  const ITEM_IMAGE_SOURCES = {
    old_roster: "assets/images/items/old_roster.svg",
    library_card: "assets/images/items/library_card.svg",
    broadcast_mic: "assets/images/items/broadcast_mic.svg"
  };
  const itemSvgCache = {};

  // group_photo は主人公が写り込んでいる集合写真のため、性別選択に応じて
  // 見た目（group_photo_m / group_photo_f）が変わる。他の小道具と違い
  // SVGイラストではなく実写風の画像（R2から配信）なので、
  // AssetCache.get()でURLを取得して<img>として表示する。
  function groupPhotoImageId() {
    return state.playthrough.playerGender === "f" ? "group_photo_f" : "group_photo_m";
  }

  async function showItemViewer(itemId, caption) {
    el.itemViewerCaption.textContent = caption;
    el.itemViewerImage.innerHTML = "";

    if (itemId === "group_photo") {
      // バックグラウンド先読みがまだ終わっていない場合の保険として、
      // ここで一度だけ完了を待つ（既に完了していれば即resolve）
      await AssetCache.fetchGroup("extras");
      const url = AssetCache.get(groupPhotoImageId());
      if (url) {
        const img = document.createElement("img");
        img.className = "item-photo";
        img.src = url;
        img.alt = caption;
        el.itemViewerImage.appendChild(img);
      }
    } else {
      const src = ITEM_IMAGE_SOURCES[itemId];
      if (src) {
        const svgMarkup = await loadItemSvg(itemId, src);
        el.itemViewerImage.innerHTML = svgMarkup;
        if (itemId === "old_roster") {
          applyPlayerNameToRoster();
        }
      }
    }

    el.itemViewer.hidden = false;
  }

  async function loadItemSvg(itemId, src) {
    if (itemSvgCache[itemId]) return itemSvgCache[itemId];
    const res = await fetch(src);
    const text = await res.text();
    itemSvgCache[itemId] = text;
    return text;
  }

  function applyPlayerNameToRoster() {
    const nameEl = el.itemViewerImage.querySelector("#player-name-text");
    if (!nameEl) return;
    const name = state.playthrough.playerName || DEFAULT_PLAYER_NAME;
    nameEl.textContent = name;
  }

  el.btnItemClose.addEventListener("click", (e) => {
    e.stopPropagation();
    el.itemViewer.hidden = true;
    advanceAfterItem();
  });

  function advanceAfterItem() {
    state.index++;
    if (state.index >= state.lines.length) {
      const script = scriptCache[state.currentScriptId];
      if (script.choice) {
        showChoice(script.choice);
      } else {
        endScript(script);
      }
      return;
    }
    renderLine();
  }

  function skipTyping() {
    clearTimeout(state.typingTimer);
    const line = state.lines[state.index];
    el.lineText.textContent = line.text;
    state.isTyping = false;
    el.nextIndicator.style.visibility = "visible";
  }

  function renderLine() {
    const line = state.lines[state.index];

    if (line.item) {
      showItemViewer(line.item, line.caption || "");
      return;
    }

    const bg = setBackground(state.currentScriptId, state.index);
    setCharacterPlaceholder(line.speaker, state.currentScriptId, state.index, bg);
    updateSceneAudio(state.currentScriptId, state.index);

    if (line.speaker) {
      el.speakerName.textContent = line.speaker === "放送" ? "？？？（放送）" : line.speaker;
      el.speakerName.setAttribute("data-speaker", line.speaker);
      el.textbox.classList.remove("narration");
    } else {
      el.speakerName.textContent = "";
      el.textbox.classList.add("narration");
    }

    typeLine(line.text);
  }

  function advance() {
    if (!el.itemViewer.hidden) return;
    AudioManager.playSe("click");
    if (state.isTyping) {
      skipTyping();
      return;
    }
    state.index++;
    if (state.index >= state.lines.length) {
      const script = scriptCache[state.currentScriptId];
      if (script.choice) {
        showChoice(script.choice);
      } else {
        endScript(script);
      }
      return;
    }
    renderLine();
  }

  function showChoice(choice) {
    el.choicePrompt.textContent = choice.prompt;
    el.choiceList.innerHTML = "";
    choice.options.forEach(opt => {
      const btn = document.createElement("button");
      btn.className = "choice-btn";
      btn.textContent = opt.label;
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        el.choiceLayer.hidden = true;
        if (opt.bond) {
          state.playthrough.bond = opt.bond;
        }
        goToNext(opt.next);
      });
      el.choiceList.appendChild(btn);
    });
    el.choiceLayer.hidden = false;
  }

  async function goToNext(scriptId) {
    if (NOT_IMPLEMENTED_ROUTES[scriptId]) {
      el.notyetMessage.textContent = NOT_IMPLEMENTED_ROUTES[scriptId];
      showScreen("notyet");
      return;
    }
    if (scriptId === "quiz_common") {
      state.playthrough.routeId = state.currentScriptId;
      await startQuiz();
      return;
    }

    // ルート選択のタイミングで、該当ルート専用の素材グループの取得を待つ。
    // 取得が一瞬で終わる場合（キャッシュ済み等）はローディング画面を出さない。
    const group = ROUTE_ASSET_GROUP[scriptId];
    if (group) {
      await withLoadingScreen(AssetCache.fetchGroup(group), "調査の準備をしています…");
    }

    await startScript(scriptId);
  }

  function endScript(script) {
    el.endMessage.textContent = script.endNote || "この先は現在製作中です。";
    showScreen("end");
  }

  async function startScript(id) {
    const script = await loadScript(id);
    state.currentScriptId = id;
    state.lines = script.lines;
    state.index = 0;
    showScreen("novel");
    renderLine();
  }

  function playLinesThenEnd(lines, endNote) {
    state.currentScriptId = "__ending__";
    state.lines = lines;
    state.index = 0;
    scriptCache["__ending__"] = { lines, endNote };
    showScreen("novel");
    renderLine();
  }

  el.novelScreen.addEventListener("click", () => {
    if (!el.choiceLayer.hidden) return;
    advance();
  });

  el.btnStart.addEventListener("click", () => {
    el.inputPlayerName.value = "";
    showScreen("nameInput");
    el.inputPlayerName.focus();
  });

  el.btnNameConfirm.addEventListener("click", () => {
    confirmPlayerNameAndStart();
  });

  function selectGender(gender) {
    state.playthrough.playerGender = gender;
    const isM = gender === "m";
    el.btnGenderM.classList.toggle("active", isM);
    el.btnGenderM.setAttribute("aria-checked", String(isM));
    el.btnGenderF.classList.toggle("active", !isM);
    el.btnGenderF.setAttribute("aria-checked", String(!isM));
  }
  el.btnGenderM.addEventListener("click", () => selectGender("m"));
  el.btnGenderF.addEventListener("click", () => selectGender("f"));

  el.btnMuteToggle.addEventListener("click", (e) => {
    e.stopPropagation(); // ノベル画面クリックでのテキスト送りに巻き込まれないようにする
    const nextMuted = !AudioManager.isMuted();
    AudioManager.setMuted(nextMuted);
    el.btnMuteToggle.textContent = nextMuted ? "🔇" : "🔊";
    el.btnMuteToggle.setAttribute("aria-pressed", String(nextMuted));
  });

  el.inputPlayerName.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      confirmPlayerNameAndStart();
    }
  });

  async function confirmPlayerNameAndStart() {
    const raw = el.inputPlayerName.value.trim();
    state.playthrough.playerName = raw.length > 0 ? raw : DEFAULT_PLAYER_NAME;
    // タイトル画面〜名前入力の間に先行取得している可能性が高いが、
    // 万一まだであればローディング画面を出して完了を待ってから導入シーンへ入る
    await withLoadingScreen(AssetCache.fetchGroup("common"), "物語の準備をしています…");
    // 集合写真(group_photo_m/f)は共通導入の後半で使うが、common程急ぎではないため
    // 取得完了を待たずバックグラウンドで先読みしておく
    AssetCache.fetchGroup("extras");
    startScript("common_intro");
  }

  el.btnBackTitle.addEventListener("click", () => {
    showScreen("title");
  });

  el.btnRestart.addEventListener("click", () => {
    showScreen("title");
  });

  // ===================== 推理クイズ =====================

  async function loadQuizData() {
    if (!quizData) {
      const res = await fetch(QUIZ_DATA_SRC);
      quizData = await res.json();
    }
    return quizData;
  }

  async function loadEndingsData() {
    if (!endingsData) {
      const res = await fetch(ENDINGS_SRC);
      endingsData = await res.json();
    }
    return endingsData;
  }

  async function startQuiz() {
    await loadQuizData();
    state.playthrough.quiz1Correct = null;
    state.playthrough.quiz2Correct = null;
    showScreen("quiz");
    showQuizIntro();
  }

  function showQuizIntro() {
    el.quizTitle.textContent = "推理パート";
    el.quizPrompt.textContent = quizData.intro.lines.map(l => l.text).join("\n\n");
    el.quizCardsContradiction.hidden = true;
    el.quizTimelineWrap.hidden = true;
    el.btnQuizSubmit.hidden = false;
    el.btnQuizSubmit.textContent = "手がかりを整理する";
    el.quizResult.hidden = true;

    el.btnQuizSubmit.onclick = () => {
      startQuiz1();
    };
  }

  // ---- 設問1：矛盾指摘型 ----
  function startQuiz1() {
    const q = quizData.quiz1_contradiction;
    quizState.step = "quiz1";
    quizState.selectedContradiction = [];

    el.quizTitle.textContent = q.title;
    el.quizPrompt.textContent = q.prompt;

    el.quizCardsContradiction.hidden = false;
    el.quizTimelineWrap.hidden = true;
    el.quizResult.hidden = true;
    el.quizCardsContradiction.innerHTML = "";

    q.cards.forEach(card => {
      const div = document.createElement("div");
      div.className = "quiz-card";
      div.textContent = card.text;
      div.dataset.id = card.id;
      div.addEventListener("click", () => toggleContradictionCard(div, card.id));
      el.quizCardsContradiction.appendChild(div);
    });

    el.btnQuizSubmit.hidden = false;
    el.btnQuizSubmit.textContent = "この2枚で確定する";
    el.btnQuizSubmit.disabled = true;
    el.btnQuizSubmit.onclick = () => judgeQuiz1();
  }

  function toggleContradictionCard(div, id) {
    const idx = quizState.selectedContradiction.indexOf(id);
    if (idx >= 0) {
      quizState.selectedContradiction.splice(idx, 1);
      div.classList.remove("selected");
    } else {
      if (quizState.selectedContradiction.length >= 2) return;
      quizState.selectedContradiction.push(id);
      div.classList.add("selected");
    }
    el.btnQuizSubmit.disabled = quizState.selectedContradiction.length !== 2;
  }

  function judgeQuiz1() {
    const q = quizData.quiz1_contradiction;
    const selected = quizState.selectedContradiction.slice().sort();
    const correct = q.correctPair.slice().sort();
    const isCorrect = selected.length === 2 && selected[0] === correct[0] && selected[1] === correct[1];
    state.playthrough.quiz1Correct = isCorrect;

    showQuizResult(
      isCorrect ? "推理成立 ― 矛盾を見抜いた" : "推理不成立 ― 矛盾を見逃した",
      isCorrect ? q.explanationCorrect : q.explanationWrong,
      () => startQuiz2()
    );
  }

  // ---- 設問2：時系列並べ替え型 ----
  function startQuiz2() {
    const q = quizData.quiz2_timeline;
    quizState.step = "quiz2";
    quizState.timelineOrder = [];
    quizState.timelineRemaining = q.cards.map(c => c.id);

    el.quizTitle.textContent = q.title;
    el.quizPrompt.textContent = q.prompt;

    el.quizCardsContradiction.hidden = true;
    el.quizTimelineWrap.hidden = false;
    el.quizResult.hidden = true;

    renderTimelineCards();
    renderTimelineSlots();

    el.btnQuizSubmit.hidden = false;
    el.btnQuizSubmit.textContent = "この順番で確定する";
    el.btnQuizSubmit.disabled = true;
    el.btnQuizSubmit.onclick = () => judgeQuiz2();
  }

  function renderTimelineCards() {
    const q = quizData.quiz2_timeline;
    el.quizCardsTimeline.innerHTML = "";
    q.cards.forEach(card => {
      const div = document.createElement("div");
      div.className = "quiz-card";
      div.textContent = card.text;
      div.dataset.id = card.id;
      if (quizState.timelineOrder.includes(card.id)) {
        div.classList.add("used");
      }
      div.addEventListener("click", () => pickTimelineCard(card.id));
      el.quizCardsTimeline.appendChild(div);
    });
  }

  function renderTimelineSlots() {
    const q = quizData.quiz2_timeline;
    el.quizTimelineSlots.innerHTML = "";
    quizState.timelineOrder.forEach((id, i) => {
      const card = q.cards.find(c => c.id === id);
      const div = document.createElement("div");
      div.className = "quiz-slot";
      div.innerHTML = '<span class="slot-num">' + (i + 1) + '.</span><span>' + card.text + "</span>";
      el.quizTimelineSlots.appendChild(div);
    });
    el.btnQuizSubmit.disabled = quizState.timelineOrder.length !== q.cards.length;
  }

  function pickTimelineCard(id) {
    if (quizState.timelineOrder.includes(id)) return;
    quizState.timelineOrder.push(id);
    renderTimelineCards();
    renderTimelineSlots();
  }

  function judgeQuiz2() {
    const q = quizData.quiz2_timeline;
    const isCorrect = JSON.stringify(quizState.timelineOrder) === JSON.stringify(q.correctOrder);
    state.playthrough.quiz2Correct = isCorrect;

    showQuizResult(
      isCorrect ? "推理成立 ― 正しい時の流れ" : "推理不成立 ― 順序を見誤った",
      isCorrect ? q.explanationCorrect : q.explanationWrong,
      () => finishQuiz()
    );
  }

  function showQuizResult(verdict, explain, onNext) {
    el.quizCardsContradiction.hidden = true;
    el.quizTimelineWrap.hidden = true;
    el.btnQuizSubmit.hidden = true;
    el.quizResult.hidden = false;
    el.quizResultVerdict.textContent = verdict;
    el.quizResultExplain.textContent = explain;
    el.btnQuizNext.onclick = onNext;
  }

  el.btnTimelineReset.addEventListener("click", () => {
    quizState.timelineOrder = [];
    renderTimelineCards();
    renderTimelineSlots();
  });

  // ---- クイズ結果からエンディング決定 ----
  async function finishQuiz() {
    await loadEndingsData();
    const { routeId, bond, quiz1Correct, quiz2Correct } = state.playthrough;

    const correctCount = (quiz1Correct ? 1 : 0) + (quiz2Correct ? 1 : 0);
    let endingKey;
    if (correctCount === 2) {
      endingKey = bond === "good" ? "true" : "merry_bad";
    } else if (correctCount === 1) {
      endingKey = bond === "good" ? "merry_bad" : "bad";
    } else {
      endingKey = "bad";
    }

    const ending = endingsData[routeId] && endingsData[routeId][endingKey];
    if (!ending) {
      endScript({ endNote: "エンディングデータが見つかりませんでした。" });
      return;
    }

    lastBgmSceneKey = "ending_" + endingKey;
    AudioManager.playBgm(ENDING_BGM_KEY[endingKey] || "bad_end");

    const lines = [{ speaker: null, text: "――" + ending.title + "――" }, ...ending.lines];
    playLinesThenEnd(lines, ending.title + "\n\nご協力ありがとうございました。");
  }

  // ミュートボタンの見た目を、前回訪問時の設定（localStorage）と同期させる
  if (AudioManager.isMuted()) {
    el.btnMuteToggle.textContent = "🔇";
    el.btnMuteToggle.setAttribute("aria-pressed", "true");
  }

  (async () => {
    await AssetCache.init(); // IndexedDBに前回までのキャッシュがあれば読み込む
    AssetCache.fetchGroup("common"); // タイトル表示中〜名前入力中に先行取得（完了は待たない）
  })();
  showScreen("title");
})();
