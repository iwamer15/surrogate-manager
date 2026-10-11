from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload

from api.database import get_db
from models.prediction import Prediction, compute_metrics
from models.sample import Sample
from models.model_version import ModelVersion
from api.schemas.prediction import PredictionCreate, PredictionRead

router = APIRouter(prefix="/predictions", tags=["predictions"])


def _enrich(pred: Prediction) -> PredictionRead:
    data = PredictionRead.model_validate(pred)
    data.sample_name = pred.sample.name if pred.sample else ""
    data.model_version_name = pred.model_version.version_name if pred.model_version else ""
    return data


@router.get("/", response_model=list[PredictionRead])
def list_predictions(
    sample_id: int | None = None,
    model_version_id: int | None = None,
    skip: int = 0,
    limit: int = 200,
    db: Session = Depends(get_db),
):
    q = (
        db.query(Prediction)
        .options(joinedload(Prediction.sample), joinedload(Prediction.model_version))
    )
    if sample_id is not None:
        q = q.filter(Prediction.sample_id == sample_id)
    if model_version_id is not None:
        q = q.filter(Prediction.model_version_id == model_version_id)
    preds = q.order_by(Prediction.predicted_at.desc()).offset(skip).limit(limit).all()
    return [_enrich(p) for p in preds]


@router.post("/", response_model=PredictionRead, status_code=201)
def create_prediction(body: PredictionCreate, db: Session = Depends(get_db)):
    if not db.get(Sample, body.sample_id):
        raise HTTPException(status_code=404, detail="Sample not found")
    if body.model_version_id and not db.get(ModelVersion, body.model_version_id):
        raise HTTPException(status_code=404, detail="Model version not found")

    metrics = {}
    if body.actual_values:
        metrics = compute_metrics(body.predicted_values, body.actual_values)

    pred = Prediction(
        sample_id=body.sample_id,
        model_version_id=body.model_version_id,
        predicted_values=body.predicted_values,
        actual_values=body.actual_values,
        note=body.note,
        mae=metrics.get("mae"),
        rmse=metrics.get("rmse"),
        r2=metrics.get("r2"),
        per_output_metrics=metrics.get("per_output"),
    )
    db.add(pred)
    db.commit()
    db.refresh(pred)

    pred = (
        db.query(Prediction)
        .options(joinedload(Prediction.sample), joinedload(Prediction.model_version))
        .filter(Prediction.id == pred.id)
        .first()
    )
    return _enrich(pred)


@router.get("/{prediction_id}", response_model=PredictionRead)
def get_prediction(prediction_id: int, db: Session = Depends(get_db)):
    pred = (
        db.query(Prediction)
        .options(joinedload(Prediction.sample), joinedload(Prediction.model_version))
        .filter(Prediction.id == prediction_id)
        .first()
    )
    if not pred:
        raise HTTPException(status_code=404, detail="Prediction not found")
    return _enrich(pred)


@router.delete("/{prediction_id}", status_code=204)
def delete_prediction(prediction_id: int, db: Session = Depends(get_db)):
    pred = db.get(Prediction, prediction_id)
    if not pred:
        raise HTTPException(status_code=404, detail="Prediction not found")
    db.delete(pred)
    db.commit()
