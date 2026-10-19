"""予測結果（predictions）のテーブル。予測値・解析値は出力名ごとの辞書（JSON）で持つ。
"""

import math
from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, JSON
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from api.database import Base


class Prediction(Base):
    __tablename__ = "predictions"

    id = Column(Integer, primary_key=True, index=True)
    sample_id = Column(Integer, ForeignKey("samples.id"), nullable=False, index=True)
    model_version_id = Column(Integer, ForeignKey("model_versions.id"), nullable=True, index=True)

    predicted_values = Column(JSON, nullable=True)   # {output_name: float}
    actual_values = Column(JSON, nullable=True)      # {output_name: float}

    # 全体メトリクス（自動計算）
    mae = Column(Float, nullable=True)
    rmse = Column(Float, nullable=True)
    r2 = Column(Float, nullable=True)
    # 出力変数ごとのメトリクス: {output_name: {mae, rmse, error, rel_error}}
    per_output_metrics = Column(JSON, nullable=True)

    note = Column(String, nullable=True)
    predicted_at = Column(DateTime(timezone=True), server_default=func.now())

    sample = relationship("Sample", back_populates="predictions")
    model_version = relationship("ModelVersion")


def compute_metrics(
    predicted: dict[str, float],
    actual: dict[str, float],
) -> dict:
    """predicted_values と actual_values から誤差メトリクスを計算する。"""
    keys = [k for k in predicted if k in actual]
    if not keys:
        return {}

    errors = [predicted[k] - actual[k] for k in keys]
    abs_errors = [abs(e) for e in errors]
    sq_errors = [e ** 2 for e in errors]
    actual_vals = [actual[k] for k in keys]
    mean_actual = sum(actual_vals) / len(actual_vals)

    mae = sum(abs_errors) / len(abs_errors)
    rmse = math.sqrt(sum(sq_errors) / len(sq_errors))
    ss_res = sum(sq_errors)
    ss_tot = sum((v - mean_actual) ** 2 for v in actual_vals)
    r2 = 1 - ss_res / ss_tot if ss_tot != 0 else None

    per_output = {}
    for k in keys:
        err = predicted[k] - actual[k]
        rel = (err / actual[k] * 100) if actual[k] != 0 else None
        per_output[k] = {
            "predicted": predicted[k],
            "actual": actual[k],
            "error": round(err, 6),
            "abs_error": round(abs(err), 6),
            "rel_error_pct": round(rel, 3) if rel is not None else None,
        }

    return {
        "mae": round(mae, 6),
        "rmse": round(rmse, 6),
        "r2": round(r2, 6) if r2 is not None else None,
        "per_output": per_output,
    }
