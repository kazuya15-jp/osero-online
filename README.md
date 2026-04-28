# Othello Game

友達とリアルタイムで対戦できるオセロゲーム。

## 構成
- バックエンド: Node.js + Express + Socket.IO + PostgreSQL
- フロントエンド: バニラ HTML/CSS/JS（ビルド不要）
- 認証: bcrypt + JWT（localStorage 保存）
- ゲームロジックはサーバー側で検証（不正防止）

## アカウント / 戦績
- アカウント名 (3〜20 文字、半角英数字・`_`・`-`) とパスワード (6 文字以上) で登録 / ログイン
- 各ユーザーに **勝 / 負 / 引分 / Elo レーティング** を保存（初期レーティング 1500、K=32）
- 対局終了時（通常終了・降参いずれも）に自動で更新

## ローカルで起動
1. PostgreSQL を起動し、空のデータベースを作る（例: `createdb othello`）
2. `.env.example` をコピーして `.env` を作成し、`DATABASE_URL` と `JWT_SECRET` を埋める
3. 依存をインストールして起動

```bash
npm install
node --env-file=.env server.js   # Node 20+ なら .env を自動読み込み
# もしくは
DATABASE_URL=... JWT_SECRET=... npm start
```
ブラウザで `http://localhost:3000` を開く。

## 遊び方
1. アカウントを **新規登録** → 自動でログイン
2. ロビーで「ルームを作成」、5 文字のルームコードを友達に共有
3. 友達がコードを入れて参加すると対戦開始（先手＝黒）
4. ハイライトされたマスをクリックで石を置く
5. 終局後は両者「もう一度」で先後入れ替えて再戦
6. ロビー画面で自分の戦績・レーティングを確認できる

## デプロイ（Render）

1. **GitHub リポジトリを Render に接続**
2. **PostgreSQL を作成** — Render ダッシュボード → New + → PostgreSQL → Free プランで作成
3. **Web Service を作成** — New + → Web Service → 同じリポジトリを選択
   - Runtime: Node
   - Build Command: `npm install`
   - Start Command: `npm start`
   - Instance Type: Free（または有料）
4. **環境変数を設定** — Web Service の Environment タブで以下を追加
   - `DATABASE_URL` — 作成した Render Postgres の **Internal Database URL** をコピーして貼る
   - `JWT_SECRET` — 32 文字以上のランダム文字列（漏洩したら即ローテーション）
5. デプロイ完了後、`https://<service名>.onrender.com` を開いてアカウント登録 → 動作確認

WebSocket 対応のホスティングが必要です（Vercel の Serverless は不可）。

## ファイル
- `server.js` — Express + Socket.IO サーバ、認証 API、Othello ロジック、対局結果の永続化
- `db.js` — PostgreSQL 接続とスキーマ初期化、戦績更新クエリ
- `auth.js` — bcrypt パスワードハッシュ + JWT 発行/検証
- `elo.js` — Elo レーティング計算
- `public/index.html` — UI（ログイン / ロビー / ゲーム画面）
- `public/style.css` — スタイル
- `public/client.js` — クライアント側のロジック（認証、ゲーム表示）
- `.env.example` — ローカル開発用の環境変数サンプル

## 作業履歴 / 変更ログ

新しい Claude セッションでも過去の経緯が分かるよう、ユーザーからの指示と実施した変更をここに追記していく（新しいものを上に）。

各エントリのフォーマット:
- **YYYY-MM-DD — 見出し**
  - 指示: ユーザーから何を依頼されたか
  - 対応: 実際に何を変更したか（主なファイル / コミット）

---

### 2026-04-28 — アカウント制度 + 戦績 + Elo レーティング追加
- 指示: 「このゲームにアカウント制度を追加したい。アカウント名とパスワードでログイン、戦績（勝/負/引分）+ レーティングをアカウントに保存」「デプロイ先は Render、アカウント必須、Elo レーティングも追加」。
- 対応:
  - 依存追加: `pg` / `bcryptjs` / `jsonwebtoken`
  - 新規ファイル: `db.js`（Postgres 接続 + `users` / `games` テーブル初期化 + 戦績更新）、`auth.js`（bcrypt + JWT）、`elo.js`（Elo 計算、初期 1500 / K=32）、`.env.example`
  - `server.js`: `/api/register` `/api/login` `/api/me` を追加。Socket.IO の handshake で JWT 検証（未認証は接続拒否）。対局終了時（通常 + 降参）に `recordGameResult()` で戦績&レーティングを永続化。
  - `public/index.html` `public/client.js` `public/style.css`: ログイン/登録タブ UI、プロフィール表示（勝/負/分/勝率/レーティング）、対局時のレーティング表示、再戦時の先後入れ替え。
  - README に Render Postgres セットアップ手順を追記。

### 2026-04-28 — Othello Game へのリブランディング + README 作業履歴セクション新設
- 指示: 「毎回変更した作業や指示内容を保存して、次回新しい Claude セッションでも分かるように」+「push」。
- 対応: README.md に作業履歴セクション新設、`package.json` / `public/index.html` のタイトルを「Othello Game」へ統一。コミット `4215c5b` で main に push。

### 2026 (日付不明) — 降参ボタン追加 + 再戦は両者合意制に変更
- 指示: 降参ボタンと、再戦時の両者合意フローを追加してほしい（コミットメッセージより推定）。
- 対応: コミット `c4c54da`。

### 2026 (日付不明) — オーディオシステム追加 (BGM + SE)
- 指示: BGM と効果音を入れてほしい（コミットメッセージより推定）。
- 対応: コミット `da91948`。

### 2026 (日付不明) — ロビーにヒーロー画像を追加
- 指示: ロビー画面にヒーロー画像を追加（コミットメッセージより推定）。
- 対応: コミット `cee6033`。

### 2026 (日付不明) — 初期コミット
- 指示: プロジェクト初期化。
- 対応: Node.js + Express + Socket.IO ベースのオセロゲーム実装。コミット `15be7b2`。
