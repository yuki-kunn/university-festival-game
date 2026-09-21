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
      novel: document.getElementById("screen-novel"),
      notyet: document.getElementById("screen-notyet"),
      end: document.getElementById("screen-end"),
      quiz: document.getElementById("screen-quiz")
    },
    btnStart: document.getElementById("btn-start"),
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
      quiz2Correct: null
    }
  };

  const quizState = {
    step: null,
    selectedContradiction: [],
    timelineOrder: [],
    timelineRemaining: []
  };

  const CHAR_CLASS = { "マリコ": "marico", "ニコ": "niko", "ニナ": "nina" };

  function showScreen(name) {
    Object.values(el.screens).forEach(s => s.classList.remove("active"));
    el.screens[name].classList.add("active");
  }

  async function loadScript(id) {
    if (scriptCache[id]) return scriptCache[id];
    const path = SCRIPT_SOURCES[id];
    const res = await fetch(path);
    const json = await res.json();
    scriptCache[id] = json;
    return json;
  }

  function setBackground(scriptId, lineIndex) {
    let bg = "clubroom";
    if (scriptId === "common_intro" && lineIndex >= 25 && lineIndex < 42) bg = "corridor";
    if (scriptId === "route_marico") bg = "broadcast";
    if (scriptId === "route_niko") bg = "library";
    if (scriptId === "route_nina") bg = "mirror";
    el.bgLayer.setAttribute("data-bg", bg);
  }

  function setCharacterPlaceholder(speaker) {
    el.charLayer.innerHTML = "";
    if (speaker && CHAR_CLASS[speaker]) {
      const div = document.createElement("div");
      div.className = "char-placeholder " + CHAR_CLASS[speaker];
      el.charLayer.appendChild(div);
    }
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

  function skipTyping() {
    clearTimeout(state.typingTimer);
    const line = state.lines[state.index];
    el.lineText.textContent = line.text;
    state.isTyping = false;
    el.nextIndicator.style.visibility = "visible";
  }

  function renderLine() {
    const line = state.lines[state.index];
    setBackground(state.currentScriptId, state.index);
    setCharacterPlaceholder(line.speaker);

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
    startScript("common_intro");
  });

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

    const lines = [{ speaker: null, text: "――" + ending.title + "――" }, ...ending.lines];
    playLinesThenEnd(lines, ending.title + "\n\nご協力ありがとうございました。");
  }

  showScreen("title");
})();
