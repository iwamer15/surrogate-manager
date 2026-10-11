from pydantic import BaseModel
from datetime import datetime
from typing import Optional
from models.sample import SampleStatus, FileType


class SampleFileBase(BaseModel):
    file_type: FileType
    filename: str
    path: str


class SampleFileRead(SampleFileBase):
    id: int
    sample_id: int
    created_at: datetime

    model_config = {"from_attributes": True}


class SampleCreate(BaseModel):
    name: str
    description: Optional[str] = None


class SampleUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    status: Optional[SampleStatus] = None
    stl_path: Optional[str] = None
    dvc_rev: Optional[str] = None
    git_commit: Optional[str] = None


class SampleRead(BaseModel):
    id: int
    name: str
    description: Optional[str]
    stl_path: Optional[str]
    status: SampleStatus
    dvc_rev: Optional[str]
    git_commit: Optional[str]
    created_at: datetime
    updated_at: datetime
    files: list[SampleFileRead] = []

    model_config = {"from_attributes": True}
