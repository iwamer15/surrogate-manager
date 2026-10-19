"""モデルの版（model_versions）と、版ごとのサンプルの割り当て（学習・検証・テスト）のテーブル。
"""

from sqlalchemy import Column, Integer, String, Float, DateTime, Enum, ForeignKey, Text, JSON, UniqueConstraint
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import enum
from api.database import Base


class ModelVersionStatus(str, enum.Enum):
    draft = "draft"
    training = "training"
    trained = "trained"
    validated = "validated"
    deployed = "deployed"


class SampleSplit(str, enum.Enum):
    train = "train"
    validation = "validation"
    test = "test"


class ModelVersion(Base):
    __tablename__ = "model_versions"

    id = Column(Integer, primary_key=True, index=True)
    version_name = Column(String, nullable=False, unique=True, index=True)
    description = Column(Text, nullable=True)
    algorithm = Column(String, nullable=True)
    status = Column(Enum(ModelVersionStatus), default=ModelVersionStatus.draft, nullable=False)

    # 学習設定
    hyperparameters = Column(JSON, nullable=True)       # {"n_estimators": 100, "max_depth": 5, ...}
    input_features = Column(JSON, nullable=True)        # ["pour_temp", "mold_temp", "cooling_rate", ...]
    target_outputs = Column(JSON, nullable=True)        # ["solidification_time", "shrinkage_risk", ...]

    # データバージョン参照
    dvc_data_rev = Column(String, nullable=True)
    git_commit = Column(String, nullable=True)

    # モデルアーティファクト
    artifact_path = Column(String, nullable=True)

    # 全体精度メトリクス
    mae = Column(Float, nullable=True)
    rmse = Column(Float, nullable=True)
    r2 = Column(Float, nullable=True)
    # 出力ごとのメトリクス: {"solidification_time": {"mae": 0.1, "rmse": 0.2, "r2": 0.95}, ...}
    per_output_metrics = Column(JSON, nullable=True)

    trained_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    version_samples = relationship(
        "ModelVersionSample", back_populates="model_version", cascade="all, delete-orphan"
    )


class ModelVersionSample(Base):
    __tablename__ = "model_version_samples"

    id = Column(Integer, primary_key=True, index=True)
    model_version_id = Column(Integer, ForeignKey("model_versions.id"), nullable=False, index=True)
    sample_id = Column(Integer, ForeignKey("samples.id"), nullable=False, index=True)
    split = Column(Enum(SampleSplit), nullable=False)

    __table_args__ = (
        UniqueConstraint("model_version_id", "sample_id", name="uq_version_sample"),
    )

    model_version = relationship("ModelVersion", back_populates="version_samples")
    sample = relationship("Sample")
