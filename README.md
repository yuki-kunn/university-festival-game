# University Festival Game

大学文化祭で展示するゲーム「不在証明」。

## 素材配信について

キャラクター立ち絵・背景画像・BGM・効果音は、すべて Cloudflare R2
（バケット名: `alibi-assets`）から公開URL経由で配信している。

- 画像の配信元URLは `assets/js/asset-config.js`
- 音声の配信元URLは `assets/js/audio-config.js`
- 画像がどのタイミング（common / route_marico / route_niko / route_nina / extras）で
  まとめて先読みされるかは `assets/js/asset-config.js` の `ASSET_GROUPS` を参照

素材を追加・差し替える場合は、Cloudflareダッシュボード（またはAPI経由）で
R2バケットに `images/<素材ID>.png` または `audio/bgm|se/<素材ID>.mp3` として
アップロードし、必要であれば `ASSET_GROUPS` に登録する。

過去に Google Apps Script + Google Drive で同様の配信を行っていたが、
GASの実行環境のコールドスタート（初回アクセスに最大50秒程度かかることがあった）
や、Base64/JSON変換によるオーバーヘッドが問題となったため、Cloudflare R2へ
移行した（Issue #38）。
