"""Surrogate Manager の API サーバ（FastAPI）。各機能の API（routers/）をまとめて登録する。

起動: uv run uvicorn api.main:app --app-dir . --host 127.0.0.1 --port 8000
API 仕様書: http://127.0.0.1:8000/docs
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.database import init_db
from api.routers import samples, predictions, todos, users, model_versions, fields, datasets

app = FastAPI(
    title="Surrogate Manager API",
    description="鋳造解析サロゲートモデルのデータ・タスク管理API",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(samples.router, prefix="/api/v1")
app.include_router(predictions.router, prefix="/api/v1")
app.include_router(todos.router, prefix="/api/v1")
app.include_router(users.router, prefix="/api/v1")
app.include_router(model_versions.router, prefix="/api/v1")
app.include_router(fields.router, prefix="/api/v1")
app.include_router(datasets.router, prefix="/api/v1")


@app.on_event("startup")
def on_startup():
    init_db()


@app.get("/health")
def health():
    return {"status": "ok"}
