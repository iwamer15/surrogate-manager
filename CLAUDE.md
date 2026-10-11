# surrogate-manager

## プロジェクト概要
鋳造解析サロゲートモデルのデータ・タスク管理ツール。
学習データ（STL+CSV）のバージョン管理、予測結果の追跡、
進捗管理、TODOをチームで共有できるデスクトップアプリ。

## 現在の状態
- 初期セットアップ完了（フォルダ構成・Git・DVC初期化済み）
- アプリケーションコードは未実装
- まずバックエンドのDBスキーマ・APIから着手する

## ドメイン知識
- 用途：鋳造解析のサロゲートモデル
- STLファイル：鋳造品の3Dジオメトリ（形状データ）
- CSVファイル：鋳造条件（入力）と解析結果（出力）を含む
  - 入力例：注湯温度、金型温度、冷却速度、材料パラメータ など
  - 出力例：湯流れ、凝固時間、引け巣リスク、残留応力 など
- 1サンプル = 1鋳造条件セット = STL1個 + CSV複数個
- サンプル数：数百件規模

## データ構造
```
data/
├── sample_001/
│   ├── geometry.stl       # 鋳造品の3Dジオメトリ
│   ├── conditions.csv     # 鋳造条件（入力パラメータ）
│   └── results.csv        # 解析結果（または入力+結果が同一CSV）
├── sample_002/
└── sample_XXX/
```

## 利用者
- 部署内チーム（6人以上）
- Mac（開発環境）/ Windows 11（導入・運用環境）
- 非エンジニアも使うため、UIはシンプルに

## 技術スタック
- Frontend: Electron + React + TypeScript
- Backend: Python 3.11 + FastAPI
- DB: SQLite（開発）→ PostgreSQL（チーム運用）
- データバージョン管理: DVC + Git
- パッケージ管理: uv（Python）、npm（Node.js）
- ビルド: electron-builder（Windows .exe生成）

## 主要コマンド（開発時）
\`\`\`bash
# バックエンド起動
cd backend && uv run uvicorn api.main:app --reload

# フロントエンド起動
cd frontend && npm run dev

# Electronアプリ起動
cd frontend && npm run electron

# Windowsビルド
cd frontend && npm run build:win
\`\`\`

## 主要機能（優先度：全て同等）
1. データ管理：STL+CSVセットの登録・閲覧・検索
2. バージョン管理：DVC連携によるデータ変更履歴の追跡
3. 予測結果管理：サロゲート予測値 vs 解析結果の記録・比較
4. 進捗管理：モデル学習状況・精度推移（MAE/RMSEなど）の可視化
5. TODO管理：チームタスクの作成・割り当て・追跡

## 開発上の注意
- パス区切りは path モジュールで統一（Windows/Mac両対応）
- Windows installer（.exe）を electron-builder で生成
- チーム共有を前提とした認証・権限管理を実装する
- STLファイルはバイナリのため、Git管理対象外・DVC管理対象とする
- CSVのエンコーディングは UTF-8 を基本とする

## 開発優先順位
1. バックエンド：DBスキーマ・APIエンドポイント定義
2. フロントエンド：基本UI（データ一覧・登録画面）
3. DVC連携：バージョン管理機能
4. チーム機能：認証・権限・TODO共有