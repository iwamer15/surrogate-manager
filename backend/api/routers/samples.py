from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session
from typing import Optional
import aiofiles
import os
from pathlib import Path

from api.database import get_db
from models.sample import Sample, SampleFile, FileType
from api.schemas.sample import SampleCreate, SampleUpdate, SampleRead, SampleFileRead

router = APIRouter(prefix="/samples", tags=["samples"])

DATA_DIR = Path(__file__).parent.parent.parent.parent / "data"


@router.get("/", response_model=list[SampleRead])
def list_samples(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    return db.query(Sample).offset(skip).limit(limit).all()


@router.post("/", response_model=SampleRead, status_code=201)
def create_sample(body: SampleCreate, db: Session = Depends(get_db)):
    sample = Sample(**body.model_dump())
    db.add(sample)
    db.commit()
    db.refresh(sample)
    return sample


@router.get("/{sample_id}", response_model=SampleRead)
def get_sample(sample_id: int, db: Session = Depends(get_db)):
    sample = db.get(Sample, sample_id)
    if not sample:
        raise HTTPException(status_code=404, detail="Sample not found")
    return sample


@router.patch("/{sample_id}", response_model=SampleRead)
def update_sample(sample_id: int, body: SampleUpdate, db: Session = Depends(get_db)):
    sample = db.get(Sample, sample_id)
    if not sample:
        raise HTTPException(status_code=404, detail="Sample not found")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(sample, field, value)
    db.commit()
    db.refresh(sample)
    return sample


@router.delete("/{sample_id}", status_code=204)
def delete_sample(sample_id: int, db: Session = Depends(get_db)):
    sample = db.get(Sample, sample_id)
    if not sample:
        raise HTTPException(status_code=404, detail="Sample not found")
    db.delete(sample)
    db.commit()


@router.post("/{sample_id}/files", response_model=SampleFileRead, status_code=201)
async def upload_file(
    sample_id: int,
    file_type: FileType = Form(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    sample = db.get(Sample, sample_id)
    if not sample:
        raise HTTPException(status_code=404, detail="Sample not found")

    dest_dir = DATA_DIR / sample.name
    dest_dir.mkdir(parents=True, exist_ok=True)
    dest_path = dest_dir / file.filename

    async with aiofiles.open(dest_path, "wb") as f:
        content = await file.read()
        await f.write(content)

    sample_file = SampleFile(
        sample_id=sample_id,
        file_type=file_type,
        filename=file.filename,
        path=str(dest_path),
    )
    db.add(sample_file)
    if file_type == FileType.other and file.filename.endswith(".stl"):
        sample.stl_path = str(dest_path)
    db.commit()
    db.refresh(sample_file)
    return sample_file
