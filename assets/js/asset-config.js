/**
 * 画像素材の配信元設定（Cloudflare R2）。
 *
 * 旧GAS(ImageApi.gs) + Google Drive方式から移行。R2は静的ファイルを
 * そのまま公開URLで配信できるため、GASのようなBase64/JSON変換や
 * グループ単位のAPI呼び出しは不要になった。
 *
 * ASSET_GROUPS は「どのタイミングでどの画像をまとめて先読みするか」を
 * 決めるための分類で、GAS時代の同名の定義を踏襲している
 * （フロント側のロード戦略はengine.js参照）。
 */
window.ASSET_BASE_URL = "https://pub-6d1d173081c34031bc5aa782f7e7a5d1.r2.dev/images/";

// 素材ID -> 所属グループ（複数可）。ここに載っていないIDは常時取得対象外。
window.ASSET_GROUPS = {
  // --- common: タイトル〜共通導入〜バディ選択までに必要な最小セット ---
  marico_normal: ["common"],
  niko_normal: ["common"],
  nina_normal: ["common"],
  mc_normal_m: ["common"],
  mc_normal_f: ["common"],
  clubroom_day: ["common"],
  corridor: ["common"],
  unknown_student: ["common"],

  // --- extras: 集合写真など、共通導入の必須表示には使わず、
  //     アイテムビューア等で個別に参照する画像（性別出し分けもここに含む） ---
  group_photo_m: ["extras"],
  group_photo_f: ["extras"],

  // --- route_marico: マリコルート選択後に必要 ---
  marico_scared: ["route_marico"],
  broadcast_room: ["route_marico"],
  mc_serious_m: ["route_marico", "route_niko", "route_nina"],
  mc_serious_f: ["route_marico", "route_niko", "route_nina"],

  // --- route_niko: ニコルート選択後に必要 ---
  niko_serious: ["route_niko"],
  library: ["route_niko"],

  // --- route_nina: ニナルート選択後に必要 ---
  nina_fading: ["route_nina"],
  clubroom_night: ["route_nina"],
  mirror_closeup: ["route_nina"]
};
