# オンライン オセロ

友達とリアルタイムで対戦できるオセロゲーム。

## 構成
- バックエンド: Node.js + Express + Socket.IO
- フロントエンド: バニラ HTML/CSS/JS（ビルド不要）
- ゲームロジックはサーバー側で検証（不正防止）

## ローカルで起動
```bash
npm install
npm start
```
ブラウザで `http://localhost:3000` を開く。

## 遊び方
1. ニックネームを入力 → 「ルームを作成」
2. 表示された 5 文字のルームコードを友達に共有（または「コピー」で URL をシェア）
3. 友達がコードを入れて参加すると対戦開始（先手＝黒）
4. ハイライトされたマスをクリックで石を置く
5. 終局後は「もう一度」で先後入れ替えで再戦

## デプロイ
`PORT` 環境変数を読むので、Render / Railway / Fly.io / Heroku などの PaaS にそのまま載せられます。

最低限の手順:
1. このディレクトリを git リポジトリに push
2. Node 18+ ランタイムを選択
3. Build command: `npm install`
4. Start command: `npm start`

WebSocket 対応のホスティングを選んでください（Vercel の Serverless は不可。Render / Railway / Fly などを推奨）。

## ファイル
- `server.js` — Express + Socket.IO サーバ、Othello ロジック
- `public/index.html` — UI
- `public/style.css` — スタイル
- `public/client.js` — クライアント側のロジック
