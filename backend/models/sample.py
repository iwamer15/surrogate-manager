from sqlalchemy import Column, Integer, String, DateTime, Enum, Text, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import enum
from api.database import Base


class SampleStatus(str, enum.Enum):
    registered = "registered"
    processing = "processing"
    completed = "completed"
    error = "error"


class Sample(Base):
    __tablename__ = "samples"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False, index=True)
    description = Column(Text, nullable=True)
    stl_path = Column(String, nullable=True)
    status = Column(Enum(SampleStatus), default=SampleStatus.registered, nullable=False)
    dvc_rev = Column(String, nullable=True)       # DVC revision hash
    git_commit = Column(String, nullable=True)    # 対応 Git コミット
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    files = relationship("SampleFile", back_populates="sample", cascade="all, delete-orphan")
    predictions = relationship("Prediction", back_populates="sample", cascade="all, delete-orphan")


class FileType(str, enum.Enum):
    conditions = "conditions"
    results = "results"
    other = "other"


class SampleFile(Base):
    __tablename__ = "sample_files"

    id = Column(Integer, primary_key=True, index=True)
    sample_id = Column(Integer, ForeignKey("samples.id"), nullable=False, index=True)
    file_type = Column(Enum(FileType), nullable=False)
    filename = Column(String, nullable=False)
    path = Column(String, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    sample = relationship("Sample", back_populates="files")
