"""データベースの接続。

既定は backend/surrogate_manager.db（SQLite・PC ごとに別）。
環境変数 SURROGATE_MANAGER_DB に接続先を書くと切り替わる（チームで共有する PostgreSQL や、テスト用の DB）。
  例: SURROGATE_MANAGER_DB=postgresql://user:pass@server/surrogate
"""

import os
from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

DB_PATH = Path(__file__).parent.parent / "surrogate_manager.db"
DATABASE_URL = os.environ.get("SURROGATE_MANAGER_DB") or f"sqlite:///{DB_PATH}"

# SQLite は既定で「作ったスレッドからしか使えない」ので、FastAPI のスレッドから使えるようにする
_connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}
engine = create_engine(DATABASE_URL, connect_args=_connect_args)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    """API 1 回ごとにセッションを開き、終わったら閉じる（FastAPI の Depends で使う）。"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    """テーブルが無ければ作る（起動時に呼ぶ）。モデルを import してテーブル定義を登録してから作る。"""
    from models import sample, prediction, todo, user, model_version  # noqa: F401
    Base.metadata.create_all(bind=engine)
