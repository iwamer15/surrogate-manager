/**
 * TODO のカード 1 枚（優先度・期限・担当者）。
 */
import type { Todo, TodoStatus } from '../api/types'
import styles from './TodoCard.module.css'

interface Props {
  todo: Todo
  onEdit: () => void
  onDelete: () => void
  onMove: (status: TodoStatus) => void
}

const PRIORITY_COLOR = { low: '#64748b', medium: '#f59e0b', high: '#ef4444' }
const PRIORITY_LABEL = { low: '低', medium: '中', high: '高' }

function isOverdue(due: string | null) {
  if (!due) return false
  return new Date(due) < new Date()
}

function fmtDue(due: string) {
  return new Date(due).toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' })
}

const PREV: Record<TodoStatus, TodoStatus | null> = {
  open: null, in_progress: 'open', done: 'in_progress',
}
const NEXT: Record<TodoStatus, TodoStatus | null> = {
  open: 'in_progress', in_progress: 'done', done: null,
}

export function TodoCard({ todo, onEdit, onDelete, onMove }: Props) {
  const overdue = isOverdue(todo.due_date)

  return (
    <div className={styles.card} onClick={onEdit}>
      <div className={styles.header}>
        <span
          className={styles.priority}
          style={{ color: PRIORITY_COLOR[todo.priority], borderColor: `${PRIORITY_COLOR[todo.priority]}40`, background: `${PRIORITY_COLOR[todo.priority]}12` }}
        >
          {PRIORITY_LABEL[todo.priority]}
        </span>
        <button className={styles.deleteBtn}
          onClick={e => { e.stopPropagation(); onDelete() }}>✕</button>
      </div>

      <p className={styles.titleText}>{todo.title}</p>

      {todo.description && (
        <p className={styles.desc}>{todo.description}</p>
      )}

      <div className={styles.footer}>
        <div className={styles.meta}>
          {todo.assignee_name && (
            <span className={styles.assignee}>
              <span className={styles.avatar}>{todo.assignee_name[0]}</span>
              {todo.assignee_name}
            </span>
          )}
          {todo.due_date && (
            <span className={`${styles.due} ${overdue && todo.status !== 'done' ? styles.overdue : ''}`}>
              {overdue && todo.status !== 'done' ? '⚠ ' : ''}
              {fmtDue(todo.due_date)}
            </span>
          )}
        </div>
        <div className={styles.moveBtns} onClick={e => e.stopPropagation()}>
          {PREV[todo.status] && (
            <button className={styles.moveBtn} onClick={() => onMove(PREV[todo.status]!)} title="戻す">←</button>
          )}
          {NEXT[todo.status] && (
            <button className={`${styles.moveBtn} ${styles.moveFwd}`} onClick={() => onMove(NEXT[todo.status]!)} title="進める">→</button>
          )}
        </div>
      </div>
    </div>
  )
}
