# University Festival Game - Development Rules

## 📋 プロジェクト概要
- **プロジェクト名**: University Festival Game
- **リポジトリ**: https://github.com/yuki-kunn/university-festival-game
- **目的**: 大学の文化祭で展示するゲーム制作
- **展示予定**: 2026年11月〜12月

---

## 🔧 Git ワークフロー

### ブランチング戦略

#### メインブランチ
- **main**: 本番環境。リリース可能な状態のみ
- **develop**: 開発環境。複数の機能ブランチを統合

#### 機能ブランチの命名規則
```
{type}/{issue-number}-{issue-title}
```

##### Type の種類
| Type | 説明 | 用途 |
|------|------|------|
| `feature` | 新機能追加 | ゲームロジック、UI 追加など |
| `dev` | 開発・実装タスク | 企画設計、プロトタイプなど |
| `bug` | バグ修正 | 不具合対応 |
| `fix` | 軽微な修正 | タイプミス、微調整 |
| `docs` | ドキュメント | README、仕様書など |
| `refactor` | リファクタリング | コード整理、最適化 |
| `perf` | パフォーマンス改善 | 最適化、軽量化 |
| `test` | テスト | ユニットテスト、統合テスト |

#### ブランチ命名例
```
feature/1-player-movement          # Issue #1 - プレイヤー移動機能
dev/2-game-loop-implementation     # Issue #2 - ゲームループ実装
bug/3-collision-detection-bug      # Issue #3 - 衝突判定バグ修正
docs/4-update-readme               # Issue #4 - README 更新
```

### Git ワークフロー

#### 1. Issue 作成
新しい作業が必要な場合は、**必ず先に Issue を作成**

```bash
# GitHub Web 上で新規 Issue を作成
# または gh cli を使用
gh issue create --title "プレイヤー移動機能の実装" --body "WASD キーでプレイヤーを移動できるようにする"
```

#### 2. ブランチ作成
Issue 番号とタイプを含めてブランチ作成

```bash
git checkout develop
git pull origin develop
git checkout -b feature/1-player-movement
```

#### 3. コミットとプッシュ
```bash
git add .
git commit -m "feat: プレイヤー移動機能の実装

- WASD キーで左右移動に対応
- 移動速度は設定可能
- アニメーション対応"

git push origin feature/1-player-movement
```

#### 4. Pull Request 作成
```bash
gh pr create --title "feat: プレイヤー移動機能の実装" \
  --body "Issue #1 を解決します

## 概要
プレイヤーキャラクターが WASD キーで移動できるようになります

## 変更内容
- プレイヤー移動ロジック実装
- アニメーション対応
- 設定ファイルに速度パラメータ追加

## テスト内容
- [ ] WASD キーで正常に移動確認
- [ ] 画面端で停止確認
- [ ] アニメーションが滑らかか確認" \
  --base develop
```

#### 5. PR マージと cleanup
PR がマージされたら、ローカルブランチを削除

```bash
git checkout develop
git pull origin develop
git branch -D feature/1-player-movement
```

### コミットメッセージ形式

**Angular Commit Message Format** を採用

```
<type>(<scope>): <subject>

<body>

<footer>
```

#### Type
- `feat`: 新機能
- `fix`: バグ修正
- `docs`: ドキュメント
- `style`: コード・フォーマット（機能変更なし）
- `refactor`: リファクタリング
- `perf`: パフォーマンス改善
- `test`: テスト追加
- `chore`: ビルド設定、依存関係など

#### Scope
`(player)`, `(enemy)`, `(ui)`, `(sound)` など機能エリア

#### Subject
- 命令形で記述（「実装する」「修正する」）
- 最初の文字は大文字
- 50 文字以内

#### Body
- 詳細な説明（オプション）
- なぜこの変更が必要なのかを記述

#### Footer
- Issue の参照: `Closes #1`
- Breaking Changes: `BREAKING CHANGE:`

#### コミットメッセージ例
```
feat(player): プレイヤー移動機能を実装

プレイヤーキャラクターが WASD キーで移動できるように実装。
移動速度は config.js で設定可能。

- キーボード入力検出
- 移動アニメーション対応
- 画面端での停止判定

Closes #1
```

---

## 📊 Issue テンプレート

Issue 作成時は以下の形式で記述

```markdown
## 概要
（簡潔に何が必要か説明）

## 詳細
（詳しい背景、要件を記述）

## 受け入れ基準
- [ ] 条件 1
- [ ] 条件 2
- [ ] 条件 3

## 関連リソース
（参考になるドキュメント、関連 Issue など）
```

---

## 🚀 開発環境

### ツール
- **言語**: JavaScript / TypeScript
- **フレームワーク**: Phaser（推奨）
- **バージョン管理**: Git
- **リポジトリ**: GitHub

### ローカルセットアップ
```bash
git clone https://github.com/yuki-kunn/university-festival-game.git
cd university-festival-game
npm install
npm run dev
```

### ブランチ管理
```bash
# develop ブランチの最新に更新
git fetch origin
git checkout develop
git pull origin develop

# 新規機能ブランチ作成
git checkout -b feature/{issue-number}-{title}
```

---

## 📝 ドキュメント管理

### 主要ドキュメント
- **CLAUDE.md** (このファイル): 開発ルール、ガイドライン
- **GAME_SPEC.md**: ゲーム仕様書、企画書
- **GAME_SPEC_GUIDE.md**: 仕様書の使用ガイド
- **DEVELOPMENT_CHECKLIST.md**: 制作進捗チェックリスト

### ドキュメント更新ルール
- 大きな仕様変更は GAME_SPEC.md を更新
- ルール追加・変更時は このファイル (CLAUDE.md) を更新
- ドキュメント更新も Issue / PR で管理

---

## ✅ チェックリスト（PR マージ前）

PR をマージする前に、以下を確認

- [ ] Issue 番号がブランチ名に含まれている
- [ ] コミットメッセージが形式に従っている
- [ ] テストが通っている
- [ ] ドキュメントが更新されている（必要に応じて）
- [ ] コードレビューが完了している

---

## 📞 トラブルシューティング

### ブランチをリセットしたい場合
```bash
# リモートから最新を取得
git fetch origin

# ローカルをリモートに同期
git reset --hard origin/{branch-name}
```

### コミットをやり直したい場合
```bash
# 最新のコミットを取り消し（変更は保持）
git reset --soft HEAD~1

# 変更を確認して再コミット
git add .
git commit -m "修正メッセージ"
```

### マージコンフリクト発生時
```bash
# コンフリクト箇所を手動修正
# <<<<<<<, =======, >>>>>>> を確認して修正

# 修正後、確定
git add .
git commit -m "fix: merge conflict resolution"
```

---

## 📋 更新履歴

| 日付 | 更新内容 |
|------|----------|
| 2026-09-21 | 初版作成。ブランチング戦略、コミットメッセージ形式、Issue 管理ルールを定義 |

---

## 補足

- このファイルは必要に応じて更新されます
- 新しいルール追加時は、Issue を作成し、PR で管理してください
- チーム内で質問がある場合は、GitHub の Discussions や Issue で共有してください

