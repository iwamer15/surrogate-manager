"""利用者 API の入出力の形。
"""

from pydantic import BaseModel, EmailStr
from datetime import datetime
from typing import Optional
from models.user import UserRole


class UserCreate(BaseModel):
    name: str
    email: EmailStr
    role: UserRole = UserRole.member


class UserUpdate(BaseModel):
    name: Optional[str] = None
    role: Optional[UserRole] = None


class UserRead(BaseModel):
    id: int
    name: str
    email: str
    role: UserRole
    created_at: datetime

    model_config = {"from_attributes": True}
