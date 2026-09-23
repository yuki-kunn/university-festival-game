/**
 * BGM・効果音（SE）の再生を管理するモジュール。
 *
 * - BGM: 2本の<audio>要素を交互に使い、音量をフェードさせながら
 *   切り替える（クロスフェード）。同じ曲が指定された場合は何もしない。
 * - SE: 都度新しいAudioインスタンスを作って再生する（重ねて鳴らせるように）。
 * - ブラウザの自動再生ポリシー対策として、ユーザーの最初のクリック/タップを
 *   待ってから実際の再生を許可する（それまでの再生要求はpendingとして保持）。
 * - ミュート状態はlocalStorageに保存し、次回訪問時も引き継ぐ
 *   （読み書きに失敗しても動作に支障が出ないようtry/catchで囲む）。
 */
window.AudioManager = (() => {
  "use strict";

  const BGM_CROSSFADE_MS = 1500;
  const BGM_VOLUME = 0.55;
  const SE_VOLUME = 0.7;
  const MUTE_STORAGE_KEY = "alibi_audio_muted";

  const bgmPlayers = [new Audio(), new Audio()];
  bgmPlayers.forEach(p => { p.loop = true; p.volume = 0; p.preload = "auto"; });
  let activeBgmIndex = 0;
  let currentBgmKey = null;

  let muted = loadMutedPref();
  let unlocked = false; // ユーザー操作前は再生できないため、要求を保留する
  let pendingBgmKey = null;

  function loadMutedPref() {
    try {
      return localStorage.getItem(MUTE_STORAGE_KEY) === "1";
    } catch (err) {
      return false;
    }
  }

  function saveMutedPref(value) {
    try {
      localStorage.setItem(MUTE_STORAGE_KEY, value ? "1" : "0");
    } catch (err) {
      // 保存できなくても致命的ではないので無視する
    }
  }

  function fade(player, from, to, ms) {
    const start = performance.now();
    function step(now) {
      const t = Math.min(1, (now - start) / ms);
      // 浮動小数点誤差でvolumeが[0,1]をわずかに外れることがあり、
      // HTMLMediaElement.volumeへの代入は範囲外だと例外を投げるためclampする
      const v = from + (to - from) * t;
      player.volume = Math.max(0, Math.min(1, v));
      if (t < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  function playBgm(key) {
    if (muted) { pendingBgmKey = null; currentBgmKey = key; return; }
    if (!unlocked) { pendingBgmKey = key; return; }
    if (key === currentBgmKey) return;

    const src = window.AUDIO_SOURCES && window.AUDIO_SOURCES.bgm && window.AUDIO_SOURCES.bgm[key];
    if (!src) {
      console.warn("[AudioManager] unknown bgm key:", key);
      return;
    }

    currentBgmKey = key;
    const outPlayer = bgmPlayers[activeBgmIndex];
    const inPlayer = bgmPlayers[1 - activeBgmIndex];
    activeBgmIndex = 1 - activeBgmIndex;

    inPlayer.src = src;
    inPlayer.currentTime = 0;
    inPlayer.volume = 0;
    const playPromise = inPlayer.play();
    if (playPromise && playPromise.catch) playPromise.catch(() => {});

    fade(inPlayer, 0, BGM_VOLUME, BGM_CROSSFADE_MS);
    fade(outPlayer, outPlayer.volume, 0, BGM_CROSSFADE_MS);
    setTimeout(() => { if (outPlayer !== bgmPlayers[activeBgmIndex]) outPlayer.pause(); }, BGM_CROSSFADE_MS + 50);
  }

  function stopBgm() {
    currentBgmKey = null;
    pendingBgmKey = null;
    bgmPlayers.forEach(p => {
      fade(p, p.volume, 0, BGM_CROSSFADE_MS);
      setTimeout(() => p.pause(), BGM_CROSSFADE_MS + 50);
    });
  }

  function playSe(key) {
    if (muted || !unlocked) return;
    const src = window.AUDIO_SOURCES && window.AUDIO_SOURCES.se && window.AUDIO_SOURCES.se[key];
    if (!src) {
      console.warn("[AudioManager] unknown se key:", key);
      return;
    }
    const audio = new Audio(src);
    audio.volume = SE_VOLUME;
    const playPromise = audio.play();
    if (playPromise && playPromise.catch) playPromise.catch(() => {});
  }

  function setMuted(value) {
    muted = value;
    saveMutedPref(muted);
    if (muted) {
      bgmPlayers.forEach(p => { p.volume = 0; });
    } else if (unlocked && currentBgmKey) {
      // ミュート解除時、現在のBGMキーを一旦クリアしてから再生し直すことで
      // フェードインを再現する
      const key = currentBgmKey;
      currentBgmKey = null;
      playBgm(key);
    }
  }

  function isMuted() {
    return muted;
  }

  // ユーザーの最初のクリック/タップ/キー操作で、保留していたBGM再生要求を解放する
  function unlockOnce() {
    if (unlocked) return;
    unlocked = true;
    if (pendingBgmKey) {
      const key = pendingBgmKey;
      pendingBgmKey = null;
      currentBgmKey = null; // playBgm内のキー比較でスキップされないようにリセット
      playBgm(key);
    }
  }
  ["click", "keydown", "touchstart"].forEach(evt => {
    window.addEventListener(evt, unlockOnce, { once: true, passive: true });
  });

  return { playBgm, stopBgm, playSe, setMuted, isMuted };
})();
