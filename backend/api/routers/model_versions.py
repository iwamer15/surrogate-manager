from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload

from api.database import get_db
from models.model_version import ModelVersion, ModelVersionSample, SampleSplit
from models.sample import Sample
from api.schemas.model_version import (
    ModelVersionCreate, ModelVersionUpdate, ModelVersionRead, AddSamplesRequest
)

router = APIRouter(prefix="/model-versions", tags=["model-versions"])


def _enrich(version: ModelVersion) -> ModelVersionRead:
    data = ModelVersionRead.model_validate(version)
    for vs in data.version_samples:
        row = next((s for s in version.version_samples if s.id == vs.id), None)
        if row and row.sample:
            vs.sample_name = row.sample.name
    return data


@router.get("/", response_model=list[ModelVersionRead])
def list_versions(db: Session = Depends(get_db)):
    versions = (
        db.query(ModelVersion)
        .options(joinedload(ModelVersion.version_samples).joinedload(ModelVersionSample.sample))
        .order_by(ModelVersion.created_at.desc())
        .all()
    )
    return [_enrich(v) for v in versions]


@router.post("/", response_model=ModelVersionRead, status_code=201)
def create_version(body: ModelVersionCreate, db: Session = Depends(get_db)):
    if db.query(ModelVersion).filter(ModelVersion.version_name == body.version_name).first():
        raise HTTPException(status_code=409, detail="Version name already exists")
    version = ModelVersion(**body.model_dump())
    db.add(version)
    db.commit()
    db.refresh(version)
    return _enrich(version)


@router.get("/{version_id}", response_model=ModelVersionRead)
def get_version(version_id: int, db: Session = Depends(get_db)):
    version = (
        db.query(ModelVersion)
        .options(joinedload(ModelVersion.version_samples).joinedload(ModelVersionSample.sample))
        .filter(ModelVersion.id == version_id)
        .first()
    )
    if not version:
        raise HTTPException(status_code=404, detail="Model version not found")
    return _enrich(version)


@router.patch("/{version_id}", response_model=ModelVersionRead)
def update_version(version_id: int, body: ModelVersionUpdate, db: Session = Depends(get_db)):
    version = db.get(ModelVersion, version_id)
    if not version:
        raise HTTPException(status_code=404, detail="Model version not found")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(version, field, value)
    db.commit()
    db.refresh(version)
    return _enrich(version)


@router.delete("/{version_id}", status_code=204)
def delete_version(version_id: int, db: Session = Depends(get_db)):
    version = db.get(ModelVersion, version_id)
    if not version:
        raise HTTPException(status_code=404, detail="Model version not found")
    db.delete(version)
    db.commit()


@router.post("/{version_id}/samples", response_model=ModelVersionRead)
def add_samples(version_id: int, body: AddSamplesRequest, db: Session = Depends(get_db)):
    version = db.get(ModelVersion, version_id)
    if not version:
        raise HTTPException(status_code=404, detail="Model version not found")

    for entry in body.samples:
        sample_id = entry["sample_id"]
        split = SampleSplit(entry["split"])

        if not db.get(Sample, sample_id):
            raise HTTPException(status_code=404, detail=f"Sample {sample_id} not found")

        existing = (
            db.query(ModelVersionSample)
            .filter_by(model_version_id=version_id, sample_id=sample_id)
            .first()
        )
        if existing:
            existing.split = split
        else:
            db.add(ModelVersionSample(model_version_id=version_id, sample_id=sample_id, split=split))

    db.commit()
    db.refresh(version)

    version = (
        db.query(ModelVersion)
        .options(joinedload(ModelVersion.version_samples).joinedload(ModelVersionSample.sample))
        .filter(ModelVersion.id == version_id)
        .first()
    )
    return _enrich(version)


@router.delete("/{version_id}/samples/{sample_id}", status_code=204)
def remove_sample(version_id: int, sample_id: int, db: Session = Depends(get_db)):
    row = (
        db.query(ModelVersionSample)
        .filter_by(model_version_id=version_id, sample_id=sample_id)
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Sample not assigned to this version")
    db.delete(row)
    db.commit()
