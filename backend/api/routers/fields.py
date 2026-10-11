"""サロゲート予測フィールド（点群）の閉ループ解析・可視化用 API。

読み込んだ点群はプロセス内メモリに保持する（DB には保存しない）。
"""

import base64
import time
import uuid
from pathlib import Path

import numpy as np
from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel, Field

from services import closed_loop as cl
from services.sample_field import make_field

router = APIRouter(prefix="/fields", tags=["fields"])

DATA_DIR = (Path(__file__).resolve().parents[3] / "data").resolve()
MAX_DATASETS = 8

_store: dict[str, dict] = {}


class AnalyzeParams(BaseModel):
    connectivity: int = Field(6, description="6 / 18 / 26")
    radius: int = Field(1, ge=1, le=5)
    custom_offsets: list[list[int]] | None = None
    min_delta_t: float = 0.0
    min_voxels: int = Field(1, ge=1)
    max_loops: int = Field(500, ge=1, le=5000)


class LoadPath(BaseModel):
    path: str
    pitch: float | None = None


def _register(name: str, data: np.ndarray, columns: list[str], pitch: float | None) -> dict:
    try:
        f = cl.build_field(data, pitch=pitch, columns=columns)
    except ValueError as e:
        raise HTTPException(400, str(e))
    if len(_store) >= MAX_DATASETS:
        _store.pop(next(iter(_store)))
    fid = uuid.uuid4().hex[:12]
    _store[fid] = {"name": name, "field": f, "labels": None, "loops": None}
    return _info(fid)


def _info(fid: str) -> dict:
    d = _store[fid]
    f: cl.VoxelField = d["field"]
    return {
        "id": fid,
        "name": d["name"],
        "points": int(len(f.value)),
        "columns": f.columns,
        "pitch": f.pitch.tolist(),
        "shape": list(f.shape),
        "bounds_min": f.xyz.min(axis=0).tolist(),
        "bounds_max": f.xyz.max(axis=0).tolist(),
        "value_min": float(f.value.min()),
        "value_max": float(f.value.max()),
    }


def _get(fid: str) -> dict:
    if fid not in _store:
        raise HTTPException(404, "データが見つかりません（サーバ再起動で消えます。再読み込みしてください）")
    return _store[fid]


@router.get("/")
def list_fields():
    return [_info(fid) for fid in _store]


@router.post("/upload")
async def upload(file: UploadFile = File(...), pitch: float | None = Form(None)):
    raw = await file.read()
    try:
        data, cols = cl.read_csv_text(raw.decode("utf-8-sig"))
    except (ValueError, UnicodeDecodeError) as e:
        raise HTTPException(400, f"CSV を読めません: {e}")
    return _register(file.filename or "upload.csv", data, cols, pitch)


@router.post("/demo")
def demo():
    return _register("デモ（板+ボス2個+押湯）", make_field(), ["x", "y", "z", "solidification_time"], 2.0)


@router.get("/files")
def list_files():
    """data/ 配下の CSV（予測結果の置き場）を一覧する。"""
    if not DATA_DIR.exists():
        return []
    out = []
    for p in sorted(DATA_DIR.rglob("*.csv")):
        out.append({"path": p.relative_to(DATA_DIR).as_posix(), "size": p.stat().st_size})
    return out


@router.post("/load")
def load_path(body: LoadPath):
    p = (DATA_DIR / body.path).resolve()
    if DATA_DIR not in p.parents or not p.is_file():
        raise HTTPException(400, "data/ 配下の CSV を指定してください")
    try:
        data, cols = cl.read_csv_text(p.read_text(encoding="utf-8-sig"))
    except ValueError as e:
        raise HTTPException(400, f"CSV を読めません: {e}")
    return _register(body.path, data, cols, body.pitch)


@router.get("/{fid}")
def info(fid: str):
    _get(fid)
    return _info(fid)


@router.delete("/{fid}", status_code=204)
def delete(fid: str):
    _store.pop(fid, None)


@router.get("/{fid}/points")
def points(fid: str):
    """[x, y, z, value] × N の float32 バイナリ（リトルエンディアン）。"""
    f: cl.VoxelField = _get(fid)["field"]
    buf = np.concatenate([f.xyz, f.value[:, None]], axis=1).astype("<f4").tobytes()
    return Response(buf, media_type="application/octet-stream")


@router.post("/{fid}/analyze")
def analyze(fid: str, body: AnalyzeParams):
    d = _get(fid)
    params = cl.AnalysisParams(body.connectivity, body.radius, body.custom_offsets,
                               body.min_delta_t, body.min_voxels, body.max_loops)
    t0 = time.perf_counter()
    try:
        res = cl.detect_closed_loops(d["field"], params)
    except ValueError as e:
        raise HTTPException(400, str(e))
    d["labels"], d["loops"] = res["labels"], res["loops"]
    return {
        "loops": res["loops"],
        "final_regions": res["final_regions"],
        "candidates": res["candidates"],
        "offsets": res["offsets"],
        "elapsed_sec": round(time.perf_counter() - t0, 3),
        # 点の並びは /points と同じ。int32 リトルエンディアンを base64 で
        "labels_b64": base64.b64encode(res["labels"].astype("<i4").tobytes()).decode(),
    }


@router.get("/{fid}/export.csv")
def export_csv(fid: str):
    d = _get(fid)
    f: cl.VoxelField = d["field"]
    labels = d["labels"] if d["labels"] is not None else np.zeros(len(f.value), dtype=np.int32)
    name = Path(d["name"]).stem + "_closed_loop.csv"
    return Response(
        cl.result_to_csv(f, labels).encode("utf-8"),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{name}"},
    )
