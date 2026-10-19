"""データセットの取り込み API（画面「データ管理」→「フォルダから取り込む」）。

フォルダの下にある結果 CSV と STL（と鋳造条件）を対応付けて、サンプルとして一括登録する。
対応付けの仕組みは services/dataset_spec.py（ml-process-lab と共通）:
  1. 画面で個別に選んだ STL（dataset_overrides.yml）
  2. dataset.yml に書いたルール（例: cad/{id}.stl）
  3. 結果 CSV と同じフォルダの STL
ファイルはコピーせず、元の場所のパスをサンプルに記録する。
"""

from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from api.database import get_db
from models.sample import FileType, Sample, SampleFile
from services import dataset_spec as DS

router = APIRouter(prefix="/datasets", tags=["datasets"])

DATA_DIR = (Path(__file__).resolve().parents[3] / "data").resolve()


class RootIn(BaseModel):
    root: str
    spec_text: str | None = None      # 保存前の dataset.yml を試すとき


class OverridesIn(BaseModel):
    root: str
    stl: dict[str, str | None] = Field(default_factory=dict)   # サンプル名 → 相対パス（空で指定を外す）


class SpecIn(BaseModel):
    root: str
    text: str


class ImportIn(BaseModel):
    root: str
    names: list[str] | None = None     # 取り込むサンプル（省略で全部）
    update_existing: bool = True       # 同じ名前のサンプルがあれば、パスを更新する


def _root(root: str) -> Path:
    """絶対パス、または data/ からの相対パス。"""
    p = Path(root).expanduser()
    p = (p if p.is_absolute() else DATA_DIR / p).resolve()
    if not p.is_dir():
        raise HTTPException(400, f"フォルダが見つかりません: {root}")
    return p


def _call(fn, *args):
    """dataset_spec の ValueError（ルールの書き間違いなど）を、画面に出せるエラーにする。"""
    try:
        return fn(*args)
    except (ValueError, OSError) as e:
        raise HTTPException(400, str(e))


@router.post("/preview")
def preview(body: RootIn):
    """サンプル一覧・STL の候補・フォルダ内の全 STL。"""
    return _call(DS.preview, _root(body.root), body.spec_text)


@router.post("/overrides")
def save_overrides(body: OverridesIn):
    root = _root(body.root)
    _call(DS.save_overrides, root, body.stl)
    return _call(DS.preview, root)


@router.get("/spec")
def get_spec(root: str):
    return _call(DS.read_spec_text, _root(root))


@router.put("/spec")
def save_spec(body: SpecIn):
    root = _root(body.root)
    _call(DS.save_spec_text, root, body.text)
    return _call(DS.preview, root)


@router.post("/import")
def import_samples(body: ImportIn, db: Session = Depends(get_db)):
    """対応付けたサンプルを登録する。STL・結果 CSV・鋳造条件のパスを記録（ファイルはコピーしない）。"""
    root = _root(body.root)
    res = _call(DS.resolve, root)
    want = set(body.names) if body.names else None
    created, updated, skipped = [], [], []
    for s in res.samples:
        if want is not None and s.name not in want:
            continue
        sample = db.query(Sample).filter(Sample.name == s.name).first()
        if sample and not body.update_existing:
            skipped.append(s.name)
            continue
        if sample is None:
            sample = Sample(name=s.name, description=f"取り込み元: {root}")
            db.add(sample)
            db.flush()
            created.append(s.name)
        else:
            updated.append(s.name)
        sample.stl_path = str(s.stl) if s.stl else None
        # 取り込みで登録した結果・条件ファイルは入れ替える（手で追加した「その他」のファイルは残す）
        for f in list(sample.files):
            if f.file_type in (FileType.results, FileType.conditions):
                db.delete(f)
        sample.files.append(SampleFile(file_type=FileType.results, filename=s.csv.name, path=str(s.csv)))
        if s.conditions:
            sample.files.append(SampleFile(file_type=FileType.conditions, filename=s.conditions.name, path=str(s.conditions)))
    db.commit()
    no_stl = [s.name for s in res.samples if s.stl is None and (want is None or s.name in want)]
    return {"created": created, "updated": updated, "skipped": skipped, "without_stl": no_stl}
