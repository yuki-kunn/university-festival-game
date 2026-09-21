(() => {
  "use strict";

  const SCRIPT_SOURCES = {
    common_intro: "data/script_common.json",
    route_marico: "data/script_marico.json"
  };

  const NOT_IMPLEMENTED_ROUTES = {
    route_niko: "ニコルートは現在製作中です。今後のアップデートをお待ちください。",
    route_nina: "ニナルートは現在製作中です。今後のアップデートをお待ちください。"
  };

  const scriptCache = {};

  const el = {
    screens: {
      title: document.getElementById("screen-title"),
      novel: document.getElementById("screen-novel"),
      notyet: document.getElementById("screen-notyet"),
      end: document.getElementById("screen-end")
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
    endMessage: document.getElementById("end-message")
  };

  const state = {
    currentScriptId: null,
    lines: [],
    index: 0,
    isTyping: false,
    typingTimer: null
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

  showScreen("title");
})();
