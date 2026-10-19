# Surrogate Manager

鋳造解析サロゲートモデルのデータ・タスク管理ツール。

## 説明資料

| ファイル | 内容 |
|---|---|
| [docs/about.html](docs/about.html) | このツールの説明ページ（位置付け・画面・閉ループ解析の考え方・状況） |
| [docs/overview.html](docs/overview.html) | 2つのツール（ML Process Lab / Surrogate Manager）の位置付けと関係をまとめたスライド1枚 |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | 保守する人向けの構成・データの持ち方・直す場所 |

どちらもダウンロードしてブラウザで開けます。

---

## かんたん起動

| OS | 起動方法 | 詳細 |
|---|---|---|
| **Windows** | `start.bat` をダブルクリック（初回はライブラリを自動導入）→ ブラウザで http://localhost:5173 が開く | **[docs/WINDOWS.md](docs/WINDOWS.md)**（準備・社内プロキシ・トラブル対処） |
| Windows（アプリの窓で） | `start-electron.bat` をダブルクリック | 同上 |

終了は「backend」「frontend」の黒い画面を閉じる。

---

## 構成

```
surrogate-manager/
├── backend/          # Python 3.11 + FastAPI + SQLite（+ numpy）
├── frontend/         # Electron + React + TypeScript (Vite) + three.js
├── data/             # サンプルデータ。予測結果 CSV はここに置くと画面から選べる
├── docs/WINDOWS.md   # Windows での起動手順
├── scripts/          # start.bat から呼ぶ補助スクリプト
├── start.bat / start-electron.bat
└── README.md         # このファイル
```

---

## 前提条件

| ツール | バージョン | 用途 |
|---|---|---|
| uv | 最新 | Python パッケージ管理（Python 3.11 も uv が自動取得） |
| Node.js | **22.12 以上** | フロントエンド（Vite 8 / Electron の要件。18・20 は不可） |
| npm | Node.js に同梱 | パッケージ管理 |

---

## 起動手順（開発時・手動）

以下のコマンドは Windows（PowerShell）/ Mac どちらでも同じです。

### 1. バックエンド

```bash
cd backend

# 初回のみ：依存パッケージインストール
uv sync

# サーバー起動（--app-dir . で PYTHONPATH 設定が不要）
uv run uvicorn api.main:app --app-dir . --host 127.0.0.1 --port 8000 --reload
```

起動確認：http://127.0.0.1:8000/health → `{"status":"ok"}`
API仕様：http://127.0.0.1:8000/docs

### 2. フロントエンド（ブラウザで確認）

```bash
cd frontend

# 初回のみ
npm install

# Vite 開発サーバー起動
npm run dev
```

ブラウザで http://localhost:5173 を開く。
バックエンドへの `/api` リクエストは自動で `127.0.0.1:8000` へプロキシされる。

### 3. Electron アプリとして起動

```bash
cd frontend

# バックエンドを別ターミナルで先に起動しておく
npm run electron
```

---

## 各機能の確認方法

| 機能 | 確認場所 |
|---|---|
| データ管理（STL+CSV） | サイドバー「📦 データ管理」（「📁 フォルダから取り込む」で一括登録） |
| バージョン管理 | サイドバー「🔖 バージョン管理」 |
| 予測結果管理 | サイドバー「📊 予測結果管理」 |
| フィールド可視化（閉ループ解析） | サイドバー「🧊 フィールド可視化」 |
| TODO管理 | サイドバー「✅ TODO」 |
| API一覧 | http://localhost:8000/docs |

---

## API エンドポイント一覧

```
GET/POST   /api/v1/samples/
GET/PATCH/DELETE /api/v1/samples/{id}
POST       /api/v1/samples/{id}/files

POST       /api/v1/datasets/preview      # フォルダのサンプル一覧と STL の候補
POST       /api/v1/datasets/overrides    # 画面で選んだ STL を保存
GET/PUT    /api/v1/datasets/spec         # dataset.yml（ルール）の読み書き
POST       /api/v1/datasets/import       # サンプルとして一括登録

GET/POST   /api/v1/model-versions/
GET/PATCH/DELETE /api/v1/model-versions/{id}
POST       /api/v1/model-versions/{id}/samples
DELETE     /api/v1/model-versions/{id}/samples/{sample_id}

GET/POST   /api/v1/predictions/
GET/DELETE /api/v1/predictions/{id}

GET/POST   /api/v1/todos/
GET/PATCH/DELETE /api/v1/todos/{id}

GET/POST   /api/v1/users/
GET/PATCH/DELETE /api/v1/users/{id}

GET        /health
```

---

## DB について

- **開発環境**：`backend/surrogate_manager.db`（SQLite、自動生成）
- **チーム運用**：環境変数 `SURROGATE_MANAGER_DB` に接続先を書くと切り替わる（例 `postgresql://user:pass@server/surrogate`）

DBは `uvicorn` 起動時に自動でテーブルが作成される。

---

## Windows 向けビルド

```bash
cd frontend
npm run build:win
# → release/Surrogate Manager Setup.exe が生成される
```

---

## 実装済み機能

- [x] サンプル（STL+CSV）の登録・一覧・詳細・検索・削除
- [x] フォルダからの一括取り込み（STL の個別指定・dataset.yml のルール）
- [x] ファイルアップロード（STL/CSV）
- [x] モデルバージョン管理（アルゴリズム・ハイパーパラメータ・特徴量・目的変数）
- [x] 学習/検証サンプルの割り当て
- [x] 予測結果の記録（予測値 vs 実測値、MAE/RMSE/R² 自動計算）
- [x] TODO管理（カンバンボード、優先度・期限・担当者）
- [x] ユーザー管理 API

## 未実装

- [ ] 認証・ログイン画面
- [ ] Electron + Python バンドル（配布用ビルド）
- [ ] DVC 連携（バージョン管理の Git/DVC 自動記録）
- [ ] 進捗管理画面（精度推移グラフ）


---

## フォルダから取り込む（結果 CSV と STL の対応付け）

結果 CSV はデータのフォルダの下のどの階層にあってもよく、STL が同じフォルダに無くても対応付けられます。
STL は次の順で決まります（仕組みは `backend/services/dataset_spec.py`。ml-process-lab と surrogate-manager で共通）。

| 順 | 方法 | 保存先 |
|---|---|---|
| 1 | **画面で個別に選ぶ**：サンプルごとに、フォルダより下の全 STL から選ぶ（名前の近い候補が上に並ぶ） | `dataset_overrides.yml`（画面が自動で書く） |
| 2 | **ルールで決める**：「STL は `cad/` の `{id}.stl`」のような決まりを書く | `dataset.yml`（人が書く。画面で「試す → 保存」できる） |
| 3 | 何も指定しない：結果 CSV と同じフォルダの STL | — |

`dataset.yml` の例（画面の「② ルールで決める」にコメント付きのひな形が出ます）:

```yaml
results:
  pattern: "cae/**/results.csv"      # 結果 CSV の探し方（** は下のすべての階層）
  regex: "(?P<id>run_\\d+)"          # パスから値を取り出す（{id} として使える）
stl:
  dirs: ["cad", "cad/old"]           # STL を探すフォルダ（上から順）
  file: ["{id}.stl", "{id}_*.stl"] # ファイル名のルール（glob 可）
```

どちらのファイルも、データのフォルダの直下に置きます。中のパスはそのフォルダからの相対パス（`/` 区切り）です。

画面: 「📦 データ管理」→「📁 フォルダから取り込む」→ フォルダを指定して「調べる」→ STL を確認・指定 →「取り込む」。
ファイルはコピーせず、元の場所のパスをサンプルに記録します（同じ名前のサンプルはパスを更新）。

---

## フィールド可視化（閉ループ解析）

サロゲートで予測した凝固時間の点群（`x, y, z, 値` の CSV、2mm 角ボクセル想定）を読み込み、
**閉ループ（周囲が先に固まって孤立する液相＝引け巣リスク部）** を検出して 3D 表示する。

### 使い方
1. サイドバー「🧊 フィールド可視化」→ CSV をドロップ（または `data/` 配下の CSV を選択／「デモデータで試す」）
2. 探索範囲（近傍）を選ぶ
   - 標準: 6近傍（面）/ 18近傍 / 26近傍 × 半径 1〜4 ボクセル
   - カスタム: Z 層ごとの格子をクリックして任意のオフセットを指定（点対称の相手も自動で切替）
3. 最小 Δt・最小体積を決めて「閉ループ解析を実行」（読み込み時は自動実行。最小 Δt の初期値は値の範囲の 2%）
4. 表示
   - 色: 凝固時間 / 閉ループ別 / Δt（危険度）
   - 周囲の濃さ・閉ループだけ表示・値の下限・XYZ 断面で内部を確認
   - 一覧の閉ループをクリックでその位置へズーム、3D の点をクリックで座標と値を表示
   - 「凝固進行」スライダー/▶ で時刻 t の液相（青）・孤立した液相（赤）・凝固済み（灰）を再生
5. 「CSV出力」で `x, y, z, value, loop_id` を保存

### 判定の考え方
凝固時間の遅い順にボクセルを追加し、近傍でつながった液相の島が合流する瞬間を記録する（Union-Find による max-tree）。
合流で吸収される側の島が「閉ループ」。

| 項目 | 意味 |
|---|---|
| ピーク | 閉ループ内の最大凝固時間（最終凝固点） |
| 孤立時刻 | その液相が周囲から切り離される時刻 |
| Δt | ピーク − 孤立時刻。孤立したまま固まる時間で、大きいほど引け巣リスクが高い |
| 最終凝固部 | 最後まで吸収されない島（押湯など）。閉ループ扱いしない |

### CLI（画面なしで使う）
```bash
cd backend
uv run python -m services.closed_loop ../data/samples/field_demo.csv \
  -o out.csv --summary loops.json --connectivity 6 --radius 1 --min-dt 0.5
# 任意の近傍: --offsets "[[1,0,0],[0,1,0],[0,0,1],[0,0,2]]"
# デモデータ生成: uv run python -m services.sample_field ../data/samples/field_demo.csv
```

目安: 100万ボクセル・6近傍で約7秒（開発用 Mac）。読み込んだ点群はサーバのメモリに保持（最大8件、再起動で消える）。

### 関連ファイル
- `backend/services/closed_loop.py` … 解析エンジン（numpy）
- `backend/services/sample_field.py` … デモ用の疑似凝固時間フィールド
- `backend/api/routers/fields.py` … `/api/v1/fields/*`
- `frontend/src/pages/FieldViewerPage.tsx`, `frontend/src/components/fieldviewer/` … 画面（three.js）
