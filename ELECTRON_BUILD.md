# Electron 統合ビルド手順（Windows向け）

このドキュメントはWindows実行環境での作業を想定しています。  
完了すると `Surrogate Manager Setup.exe` が生成され、チームに配布できます。

---

## 前提条件

以下がインストール済みであること。

| ツール | バージョン | 確認コマンド |
|---|---|---|
| Python | 3.11 | `python --version` |
| uv | 最新 | `uv --version` |
| Node.js | 18以上 | `node --version` |
| npm | 9以上 | `npm --version` |

---

## 全体の流れ

```
① Python バックエンドを PyInstaller で実行ファイル化
       ↓
② Electron main プロセスを修正（backend.exe を自動起動）
       ↓
③ electron-builder で Windows インストーラー生成
       ↓
④ 動作確認
```

---

## ① Python バックエンドを実行ファイル化

### 1-1. PyInstaller をインストール

```powershell
cd surrogate-manager\backend
uv add pyinstaller --dev
```

### 1-2. ビルドスクリプトを作成

`backend\build_backend.py` を作成する：

```python
# backend/build_backend.py
import subprocess, sys

subprocess.run([
    sys.executable, "-m", "PyInstaller",
    "--onefile",
    "--name", "backend",
    "--add-data", "api;api",
    "--add-data", "models;models",
    "--hidden-import", "uvicorn.logging",
    "--hidden-import", "uvicorn.loops",
    "--hidden-import", "uvicorn.loops.auto",
    "--hidden-import", "uvicorn.protocols",
    "--hidden-import", "uvicorn.protocols.http",
    "--hidden-import", "uvicorn.protocols.http.auto",
    "--hidden-import", "uvicorn.lifespan",
    "--hidden-import", "uvicorn.lifespan.on",
    "--hidden-import", "sqlalchemy.dialects.sqlite",
    "run_server.py",
], check=True)
```

`backend\run_server.py` を作成する：

```python
# backend/run_server.py
import uvicorn, sys, os

# 実行ファイルと同じディレクトリをPYTHONPATHに追加
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

if __name__ == "__main__":
    uvicorn.run("api.main:app", host="127.0.0.1", port=8000)
```

### 1-3. ビルド実行

```powershell
cd surrogate-manager\backend
uv run python build_backend.py
```

完了すると `backend\dist\backend.exe` が生成されます。

### 1-4. 単体動作確認

```powershell
.\dist\backend.exe
# → http://127.0.0.1:8000/health にアクセスして {"status":"ok"} が返ればOK
```

---

## ② Electron main プロセスの修正

`frontend\electron\main.ts` の `startBackend()` 関数を本番用に書き換えます。

```typescript
function startBackend() {
  if (isDev) return  // 開発時はそのまま

  // backend.exe のパスを特定
  const backendExe = app.isPackaged
    ? path.join(process.resourcesPath, 'backend', 'backend.exe')
    : path.join(__dirname, '../../backend/dist/backend.exe')

  backendProcess = spawn(backendExe, [], {
    detached: false,
    windowsHide: true,  // コンソールウィンドウを非表示
  })

  backendProcess.on('error', (err) => {
    console.error('Backend failed to start:', err)
  })
}
```

---

## ③ electron-builder の設定

`frontend\package.json` の `build` セクションを確認・更新：

```json
"build": {
  "appId": "com.surrogate-manager.app",
  "productName": "Surrogate Manager",
  "directories": {
    "output": "release"
  },
  "files": [
    "dist/**/*",
    "dist-electron/**/*"
  ],
  "extraResources": [
    {
      "from": "../backend/dist/backend.exe",
      "to": "backend/backend.exe"
    }
  ],
  "win": {
    "target": "nsis",
    "icon": "public/icon.ico"
  },
  "nsis": {
    "oneClick": false,
    "allowToChangeInstallationDirectory": true,
    "installerLanguages": ["ja-JP"],
    "language": "1041"
  }
}
```

### アイコンの準備（任意）

256×256px 以上の `.ico` ファイルを `frontend\public\icon.ico` に置く。  
なければ `"icon"` 行を削除してデフォルトアイコンを使用。

---

## ④ インストーラービルド

```powershell
cd surrogate-manager\frontend

# 依存パッケージ確認
npm install

# ビルド（React + Electron + インストーラー生成）
npm run build:win
```

完了すると：

```
frontend\release\
└── Surrogate Manager Setup.exe   ← これを配布する
```

---

## ⑤ 動作確認

1. `Surrogate Manager Setup.exe` を実行してインストール
2. スタートメニューから「Surrogate Manager」を起動
3. 起動後 5〜10秒でバックエンドが立ち上がりUIが表示される
4. データ管理・TODO・バージョン管理が使えることを確認

---

## トラブルシューティング

### バックエンドが起動しない

```
症状：アプリが開くが「サーバーに接続できません」と表示される
原因：backend.exe が正しいパスにない、またはポート8000が使用中
対応：
  1. release フォルダ内の resources\backend\backend.exe が存在するか確認
  2. タスクマネージャーでポート8000を使っているプロセスを終了
```

### PyInstaller のビルドが失敗する

```
症状：ModuleNotFoundError が出る
対応：--hidden-import にそのモジュールを追加して再ビルド
```

### Windows Defender に警告される

```
症状：「WindowsがPCを保護しました」と表示される
原因：コードサイニング証明書がない（開発段階では正常）
対応：「詳細情報」→「実行」で続行
```

---

## 完了後の配布方法

```
Surrogate Manager Setup.exe
  ↓ チームの共有フォルダに置く
  ↓ 各自がダブルクリックしてインストール
  ↓ Python/Node.js 不要で動作する
```

---

## 参考：開発モードでの起動（変わらず使える）

Electronビルドとは別に、開発時はこれまで通り起動できます。

```powershell
# ターミナル①
cd backend && uv run uvicorn api.main:app --reload --port 8000 (PYTHONPATH=.)

# ターミナル②
cd frontend && npm run dev
```
