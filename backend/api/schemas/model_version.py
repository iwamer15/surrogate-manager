from pydantic import BaseModel
from datetime import datetime
from typing import Optional, Any
from models.model_version import ModelVersionStatus, SampleSplit


class ModelVersionSampleRead(BaseModel):
    id: int
    sample_id: int
    split: SampleSplit
    sample_name: str = ""

    model_config = {"from_attributes": True}


class ModelVersionCreate(BaseModel):
    version_name: str
    description: Optional[str] = None
    algorithm: Optional[str] = None
    hyperparameters: Optional[dict[str, Any]] = None
    input_features: Optional[list[str]] = None
    target_outputs: Optional[list[str]] = None
    dvc_data_rev: Optional[str] = None
    git_commit: Optional[str] = None
    artifact_path: Optional[str] = None


class ModelVersionUpdate(BaseModel):
    description: Optional[str] = None
    algorithm: Optional[str] = None
    status: Optional[ModelVersionStatus] = None
    hyperparameters: Optional[dict[str, Any]] = None
    input_features: Optional[list[str]] = None
    target_outputs: Optional[list[str]] = None
    dvc_data_rev: Optional[str] = None
    git_commit: Optional[str] = None
    artifact_path: Optional[str] = None
    mae: Optional[float] = None
    rmse: Optional[float] = None
    r2: Optional[float] = None
    per_output_metrics: Optional[dict[str, dict[str, float]]] = None
    trained_at: Optional[datetime] = None


class ModelVersionRead(BaseModel):
    id: int
    version_name: str
    description: Optional[str]
    algorithm: Optional[str]
    status: ModelVersionStatus
    hyperparameters: Optional[dict[str, Any]]
    input_features: Optional[list[str]]
    target_outputs: Optional[list[str]]
    dvc_data_rev: Optional[str]
    git_commit: Optional[str]
    artifact_path: Optional[str]
    mae: Optional[float]
    rmse: Optional[float]
    r2: Optional[float]
    per_output_metrics: Optional[dict[str, Any]]
    trained_at: Optional[datetime]
    created_at: datetime
    updated_at: datetime
    version_samples: list[ModelVersionSampleRead] = []

    model_config = {"from_attributes": True}


class AddSamplesRequest(BaseModel):
    samples: list[dict[str, Any]]  # [{"sample_id": 1, "split": "train"}, ...]
