/**
 * 音声素材（BGM・SE）の配信元URL設定（Cloudflare R2）。
 *
 * 画像と同様、GAS + Google Drive方式からCloudflare R2の公開URLへ移行した。
 * R2は元々静的ファイル配信に向いており、音声のような大きめのファイル
 * （BGM最大5.8MB）でもBase64化のオーバーヘッドなく高速に配信できる。
 */
window.AUDIO_SOURCES = {
  bgm: {
    daily: "https://pub-6d1d173081c34031bc5aa782f7e7a5d1.r2.dev/audio/bgm/daily.mp3",
    mystery: "https://pub-6d1d173081c34031bc5aa782f7e7a5d1.r2.dev/audio/bgm/mystery.mp3",
    tension: "https://pub-6d1d173081c34031bc5aa782f7e7a5d1.r2.dev/audio/bgm/tension.mp3",
    climax: "https://pub-6d1d173081c34031bc5aa782f7e7a5d1.r2.dev/audio/bgm/climax.mp3",
    true_end: "https://pub-6d1d173081c34031bc5aa782f7e7a5d1.r2.dev/audio/bgm/true_end.mp3",
    bad_end: "https://pub-6d1d173081c34031bc5aa782f7e7a5d1.r2.dev/audio/bgm/bad_end.mp3"
  },
  se: {
    click: "https://pub-6d1d173081c34031bc5aa782f7e7a5d1.r2.dev/audio/se/click.mp3",
    broadcast_noise: "https://pub-6d1d173081c34031bc5aa782f7e7a5d1.r2.dev/audio/se/broadcast_noise.mp3",
    chime: "https://pub-6d1d173081c34031bc5aa782f7e7a5d1.r2.dev/audio/se/chime.mp3",
    cold_wind: "https://pub-6d1d173081c34031bc5aa782f7e7a5d1.r2.dev/audio/se/cold_wind.mp3"
  }
};
