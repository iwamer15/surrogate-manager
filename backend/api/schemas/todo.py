from pydantic import BaseModel
from datetime import datetime
from typing import Optional
from models.todo import TodoStatus, TodoPriority


class TodoCreate(BaseModel):
    title: str
    description: Optional[str] = None
    priority: TodoPriority = TodoPriority.medium
    assignee_id: Optional[int] = None
    due_date: Optional[datetime] = None


class TodoUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    status: Optional[TodoStatus] = None
    priority: Optional[TodoPriority] = None
    assignee_id: Optional[int] = None
    due_date: Optional[datetime] = None


class TodoRead(BaseModel):
    id: int
    title: str
    description: Optional[str]
    status: TodoStatus
    priority: TodoPriority
    assignee_id: Optional[int]
    assignee_name: str = ""
    due_date: Optional[datetime]
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
