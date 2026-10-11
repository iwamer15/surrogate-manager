from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload

from api.database import get_db
from models.todo import Todo, TodoStatus
from api.schemas.todo import TodoCreate, TodoUpdate, TodoRead

router = APIRouter(prefix="/todos", tags=["todos"])


def _enrich(todo: Todo) -> TodoRead:
    data = TodoRead.model_validate(todo)
    data.assignee_name = todo.assignee_user.name if todo.assignee_user else ""
    return data


def _q(db: Session):
    return db.query(Todo).options(joinedload(Todo.assignee_user))


@router.get("/", response_model=list[TodoRead])
def list_todos(
    status: TodoStatus | None = None,
    assignee_id: int | None = None,
    db: Session = Depends(get_db),
):
    q = _q(db)
    if status is not None:
        q = q.filter(Todo.status == status)
    if assignee_id is not None:
        q = q.filter(Todo.assignee_id == assignee_id)
    return [_enrich(t) for t in q.order_by(Todo.created_at.desc()).all()]


@router.post("/", response_model=TodoRead, status_code=201)
def create_todo(body: TodoCreate, db: Session = Depends(get_db)):
    todo = Todo(**body.model_dump())
    db.add(todo)
    db.commit()
    db.refresh(todo)
    todo = _q(db).filter(Todo.id == todo.id).first()
    return _enrich(todo)


@router.get("/{todo_id}", response_model=TodoRead)
def get_todo(todo_id: int, db: Session = Depends(get_db)):
    todo = _q(db).filter(Todo.id == todo_id).first()
    if not todo:
        raise HTTPException(status_code=404, detail="Todo not found")
    return _enrich(todo)


@router.patch("/{todo_id}", response_model=TodoRead)
def update_todo(todo_id: int, body: TodoUpdate, db: Session = Depends(get_db)):
    todo = db.get(Todo, todo_id)
    if not todo:
        raise HTTPException(status_code=404, detail="Todo not found")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(todo, field, value)
    db.commit()
    todo = _q(db).filter(Todo.id == todo_id).first()
    return _enrich(todo)


@router.delete("/{todo_id}", status_code=204)
def delete_todo(todo_id: int, db: Session = Depends(get_db)):
    todo = db.get(Todo, todo_id)
    if not todo:
        raise HTTPException(status_code=404, detail="Todo not found")
    db.delete(todo)
    db.commit()
