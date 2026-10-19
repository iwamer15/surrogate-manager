"""予測結果 API の入出力の形。
"""

from pydantic import BaseModel
from datetime import datetime
from typing import Optional, Any


class PerOutputMetric(BaseModel):
    predicted: float
    actual: float
    error: float
    abs_error: float
    rel_error_pct: Optional[float]


class PredictionCreate(BaseModel):
    sample_id: int
    model_version_id: Optional[int] = None
    predicted_values: dict[str, float]
    actual_values: Optional[dict[str, float]] = None
    note: Optional[str] = None


class PredictionRead(BaseModel):
    id: int
    sample_id: int
    model_version_id: Optional[int]
    predicted_values: Optional[dict[str, Any]]
    actual_values: Optional[dict[str, Any]]
    mae: Optional[float]
    rmse: Optional[float]
    r2: Optional[float]
    per_output_metrics: Optional[dict[str, Any]]
    note: Optional[str]
    predicted_at: datetime

    # 結合情報（ルーターで付与）
    sample_name: str = ""
    model_version_name: str = ""

    model_config = {"from_attributes": True}
