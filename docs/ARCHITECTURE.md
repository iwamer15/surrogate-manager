# Surrogate Manager の構成（保守する人向け）

## フォルダ構成

```
backend/
├── api/
│   ├── main.py            # API サーバ（FastAPI）。routers/ を登録する
│   ├── database.py        # DB 接続（既定 SQLite。環境変数 SURROGATE_MANAGER_DB で切り替え）
│   ├── routers/           # 機能ごとの API
│   │   ├── samples.py         # サンプルの登録・一覧・ファイルのアップロード
│   │   ├── datasets.py        # フォルダからの一括取り込み（STL の対応付け）
│   │   ├── model_versions.py  # モデルの版
│   │   ├── predictions.py     # 予測結果
│   │   ├── fields.py          # フィールド可視化（閉ループ解析）
│   │   ├── todos.py / users.py
│   └── schemas/           # API の入出力の形（pydantic）
├── models/                # DB のテーブル定義（SQLAlchemy）
└── services/              # 画面や API から独立した計算
    ├── closed_loop.py     # 閉ループ（孤立した液相）の検出。CLI でも使える
    ├── sample_field.py    # デモ点群の生成
    └── dataset_spec.py    # 結果 CSV と STL の対応付け（ml-process-lab と共通のファイル）

frontend/src/
├── App.tsx                # 画面の切り替え
├── api/client.ts, types.ts  # API の呼び出しと型（backend の schemas と対応）
├── pages/                 # 画面ごと（データ管理・バージョン管理・予測結果・フィールド可視化・TODO）
└── components/            # ダイアログ・部品（fieldviewer/ は 3D 表示）
```

## データの持ち方

- サンプル・モデルの版・予測結果・TODO は DB に入れる。
- STL・CSV などのファイルは **パスだけ** を DB に記録する（中身は入れない）。
  - 画面からアップロードしたファイルは `data/<サンプル名>/` に保存する。
  - 「フォルダから取り込む」は、元の場所のパスをそのまま記録する（コピーしない）。
- フィールド可視化で読み込んだ点群はサーバのメモリだけに持つ（再起動で消える）。

## フォルダから取り込むときの STL の決まり方（services/dataset_spec.py）

1. 画面で個別に選んだ STL（データのフォルダの `dataset_overrides.yml`。画面が書く）
2. `dataset.yml` に書いたルール（例: `cad/{id}.stl`）
3. 結果 CSV と同じフォルダの STL

`dataset.yml` の書き方は、画面の「② ルールで決める」に出るひな形（コメント付き）を参照。

## よくある変更と直す場所

| やりたいこと | 直す場所 |
|---|---|
| 画面を増やす | `pages/` に追加し、`App.tsx` の `Page` と `components/Sidebar.tsx` の `navItems` に登録 |
| API を増やす | `api/routers/` に追加して `api/main.py` で登録、`frontend/src/api/client.ts`・`types.ts` |
| テーブルに列を足す | `models/` と `api/schemas/`（既存の DB には自動で列が足されないので、移行手順が必要） |
| 閉ループの判定を変える | `services/closed_loop.py`（CLI: `python -m services.closed_loop <CSV>`） |
| データの置き方・STL の探し方 | `services/dataset_spec.py`（**ml-process-lab の `backend/mlab/dataset_spec.py` にも同じ変更を入れる**） |
| DB をチームで共有する | 環境変数 `SURROGATE_MANAGER_DB` に PostgreSQL の接続先を書く |

## 書き方の決まり

- 画面の文言・コメントは日本語。各ファイルの先頭に「何のファイルか」を書く。
- Windows の `.bat` は英語（ASCII）のみ（cmd.exe が UTF-8 の日本語を読み違えるため）。
- パスは OS に依存しない書き方（Python は `pathlib`）。設定ファイル内のパスは `/` 区切り。
