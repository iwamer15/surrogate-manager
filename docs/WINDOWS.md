# Windows での起動手順

Windows 10 / 11 で Surrogate Manager を動かすための手順です。
はじめて使う人は「1. 準備」から順に進めてください。2回目以降は「3. 毎回の起動」だけで使えます。

> 配布用インストーラー（`Setup.exe`）を作る手順は [ELECTRON_BUILD.md](../ELECTRON_BUILD.md) を見てください。
> このページは **ソースコードから直接起動する** 手順です。

---

## 0. 全体の流れ

```
① ツールを入れる（uv / Node.js）           … 初回だけ・約10分
② 受け取った zip を展開して置く            … 初回だけ
③ start.bat をダブルクリック               … 毎回
      ├ 初回は Python / Node のライブラリを自動で導入（数分）
      ├ 「backend」の黒い画面が開く（API サーバ :8000）
      ├ 「frontend」の黒い画面が開く（画面サーバ :5173）
      └ ブラウザで http://localhost:5173 が開く
④ 終わるときは「backend」「frontend」の黒い画面を閉じる
```

---

## 1. 準備（初回だけ）

### 1-1. 必要なもの

| ツール | バージョン | 用途 |
|---|---|---|
| uv | 最新 | Python とライブラリの管理（Python 3.11 も自動で入る） |
| Node.js | **22.12 以上**（LTS 推奨） | 画面（React / Vite / Electron） |
| ブラウザ | Edge / Chrome | 画面表示（3D 表示に WebGL を使用） |

> Node.js 18 / 20 では動きません（Vite 8・Electron の要件）。

### 1-2. インストール（winget を使う方法）

スタートメニューで「**ターミナル**」または「**PowerShell**」を開き、1行ずつ実行します。

```powershell
winget install --id=astral-sh.uv -e
```

```powershell
winget install OpenJS.NodeJS.LTS
```

インストール後、**ターミナルを一度閉じて開き直し**、次で確認します。

```powershell
uv --version
node --version
```

`node --version` が `v22.12.0` 以上（例 `v22.x` / `v24.x`）なら OK です。

<details>
<summary>winget が使えない場合</summary>

- uv: PowerShell で `powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"`
- Node.js: https://nodejs.org/ja から「LTS」をダウンロードして実行

社内 PC でインストール権限がない場合は情報システム部門に依頼してください。
</details>

### 1-3. ソース一式を置く

受け取った zip を **OneDrive の同期フォルダ以外**（例 `C:\work`）に展開し、フォルダ名を `surrogate-manager` にします。
`node_modules` には数万ファイルがあり、OneDrive が同期しようとして非常に遅くなります。

展開後、`C:\work\surrogate-manager` の中に `start.bat` と `backend`・`frontend` フォルダがあれば OK です。

---

## 2. 初回起動

エクスプローラーで `C:\work\surrogate-manager` を開き、**`start.bat` をダブルクリック**します。

初回だけ次が自動で行われます（数分かかります）。

| 表示 | 中身 |
|---|---|
| `[setup] Installing Python packages` | `backend` で `uv sync`。Python 3.11 が無ければ uv が自動で取得し、`backend\.venv` を作る |
| `[setup] Installing Node packages` | `frontend` で `npm install`。`frontend\node_modules` を作る |

> 「Windows によって PC が保護されました」と出たら「詳細情報」→「実行」。
> 「Windows セキュリティの重要な警告（ファイアウォール）」が出た場合は「キャンセル」で構いません（このツールは自分の PC 内 `127.0.0.1` だけで通信します）。

---

## 3. 毎回の起動

### ブラウザで使う（おすすめ）

`start.bat` をダブルクリック → 自動でブラウザに http://localhost:5173 が開きます。

黒い画面が2つ開きますが、**使っている間は閉じないでください**。

| 画面のタイトル | 役割 |
|---|---|
| `Surrogate Manager - backend (close to stop)` | API サーバ（http://127.0.0.1:8000） |
| `Surrogate Manager - frontend (close to stop)` | 画面サーバ（http://localhost:5173） |

### デスクトップアプリ（Electron）の窓で使う

`start-electron.bat` をダブルクリック。ブラウザの代わりにアプリの窓が開きます（開発者ツールも一緒に開きます）。

### 終了

「backend」「frontend」の黒い画面を ✕ で閉じます（Electron の場合はアプリの窓 → backend の黒い画面の順）。

### 手動で起動したい場合

`start.bat` と同じことを、ターミナル2つで行えます。

ターミナル①（バックエンド）

```powershell
cd C:\work\surrogate-manager\backend
```

```powershell
uv run uvicorn api.main:app --app-dir . --host 127.0.0.1 --port 8000
```

ターミナル②（フロントエンド）

```powershell
cd C:\work\surrogate-manager\frontend
```

```powershell
npm run dev
```

ブラウザで http://localhost:5173 を開きます。
API 仕様書は http://127.0.0.1:8000/docs で見られます。

> Mac 用の `PYTHONPATH=. uv run ...` という書き方は Windows では動きません。
> 上の `--app-dir .` を使う書き方なら Windows / Mac どちらでも動きます。

---

## 4. 最新版に更新する

1. 「backend」「frontend」の黒い画面を閉じて、ツールを止める
2. 新しい zip を別の場所に展開し、中身をすべて `C:\work\surrogate-manager` にコピーして上書きする
   - 登録したデータ（`backend\surrogate_manager.db`）や `data` フォルダの CSV は zip に入っていないので、上書きしても消えません

ライブラリが増えた場合に備えて、更新後は次も実行してください（`start.bat` は初回しか自動導入しないため）。

```powershell
cd backend; uv sync; cd ..\frontend; npm install
```

---

## 5. フィールド可視化（閉ループ解析）で自分の CSV を使う

- 画面左のサイドバー「🧊 フィールド可視化」を開き、CSV をドロップ
- または CSV を `C:\work\surrogate-manager\data\` 配下（例 `data\results\`）に置くと、画面の「data/ 配下の CSV から選ぶ」に出ます
- CSV の形式
  - `x, y, z, 値` の4列（5列目以降は無視）。ヘッダ行はあってもなくても可
  - 区切りはカンマ / タブ / 空白を自動判定
  - 文字コードは UTF-8 / Shift_JIS（Excel で「CSV（コンマ区切り）」保存したもの）どちらも可
  - ボクセルピッチは座標から自動判定。合わないときは画面の「ボクセルピッチ」に `2` などを入力
- 動作確認用のデモデータは画面の「デモデータで試す」で使えます

画面を使わずに解析だけする場合:

```powershell
cd C:\work\surrogate-manager\backend
```

```powershell
uv run python -m services.closed_loop ..\data\results\予測.csv -o out.csv --summary loops.json --connectivity 6 --min-dt 0.5
```

---

## 6. 困ったとき

| 症状 | 原因と対処 |
|---|---|
| `[ERROR] uv is not installed` / `Node.js is not installed` | 1-2 のインストール後、**ターミナルやエクスプローラーを開き直して**から再実行（PATH の反映のため）。それでもだめなら PC を再起動 |
| `[ERROR] Node.js 22.12 or later is required` | `winget upgrade OpenJS.NodeJS.LTS` で更新 |
| `uv sync` / `npm install` が `SSL` / `certificate` / `timeout` で失敗 | 社内プロキシの影響。下の「社内ネットワーク」を参照 |
| `npm install` の途中で Electron のダウンロードに失敗 | 同上。ブラウザ版（`start.bat`）は Electron が無くても使えるので、`npm install --ignore-scripts` で回避も可 |
| `Backend did not start within 60 seconds` | 「backend」の黒い画面のエラーを確認。`address already in use` / `10048` ならポート 8000 を他のソフトが使用中 → 下の「ポートを使っているプロセスを調べる」 |
| ブラウザが開くが「取得に失敗しました」「500」「ECONNREFUSED」 | backend の画面が閉じていないか確認。閉じていたら `start.bat` をやり直す |
| PowerShell で `npm` を打つと「スクリプトの実行が無効」 | `npm.cmd run dev` と打つか、コマンドプロンプト（cmd）を使う。`start.bat` には影響しません |
| 3D 表示が真っ黒 / 何も出ない | ブラウザの WebGL が無効。Edge/Chrome の「設定 → システム → ハードウェア アクセラレーションを使用」をオン |
| 100万点以上で重い | 「周囲の濃さ」を 0 にする、断面で範囲を絞る、「点サイズ」を小さくする |
| 読み込んだデータが消えた | 点群はサーバのメモリにのみ保持（最大8件）。backend を閉じると消えるので再読み込み |

### ポートを使っているプロセスを調べる

```powershell
netstat -ano | findstr :8000
```

右端の数字（PID）をタスクマネージャーの「詳細」タブで探して終了します。

### 社内ネットワーク（プロキシ・SSL 検査）

プロキシの URL は情報システム部門に確認してください（例 `http://proxy.example.co.jp:8080`）。

PowerShell で、そのウィンドウだけ有効な設定:

```powershell
$env:HTTP_PROXY="http://proxy.example.co.jp:8080"; $env:HTTPS_PROXY=$env:HTTP_PROXY
```

uv が社内の証明書で `SSL` エラーになる場合（Windows の証明書ストアを使わせる）:

```powershell
$env:UV_NATIVE_TLS="1"
```

npm のプロキシ設定（恒久）:

```powershell
npm config set proxy http://proxy.example.co.jp:8080
```

```powershell
npm config set https-proxy http://proxy.example.co.jp:8080
```

社内の証明書ファイル（`.pem` / `.cer`）を配布されている場合:

```powershell
npm config set cafile "C:\path\to\corp-ca.pem"
```

> `npm config set strict-ssl false` のように証明書検証を切る設定は、安全のため使わないでください。

設定後、同じウィンドウで `cd C:\work\surrogate-manager\backend; uv sync` → `cd ..\frontend; npm install` を実行し、成功したら `start.bat` を使えます。

---

## 7. ファイル構成（起動まわり）

| ファイル | 役割 |
|---|---|
| `start.bat` | Windows 用。チェック → 初回セットアップ → backend / frontend 起動 → ブラウザを開く |
| `start-electron.bat` | Windows 用。ブラウザの代わりに Electron の窓で開く |
| `scripts\_check.bat` | uv / Node.js の有無とバージョン確認、初回の `uv sync` / `npm install` |
| `scripts\_backend.bat` | backend を別窓で起動し、`/health` が返るまで待つ |
| `backend\.venv\` | Python の仮想環境（自動生成） |
| `frontend\node_modules\` | Node のライブラリ（自動生成） |
| `backend\surrogate_manager.db` | データ管理・TODO 等の SQLite DB（自動生成。各 PC ごとに別） |

> DB は PC ごとに別々です。チームで同じデータを共有する仕組み（PostgreSQL 化）は今後の予定です。
