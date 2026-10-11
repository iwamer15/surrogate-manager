import { useState, useEffect } from 'react'
import { api } from '../api/client'
import type { Todo, TodoCreate, TodoUpdate, TodoPriority, User } from '../api/types'
import styles from './TodoModal.module.css'

interface Props {
  todo?: Todo          // 未指定なら新規作成モード
  onSaved: (t: Todo) => void
  onClose: () => void
}

export function TodoModal({ todo, onSaved, onClose }: Props) {
  const isEdit = !!todo
  const [users, setUsers] = useState<User[]>([])

  const [title, setTitle] = useState(todo?.title ?? '')
  const [description, setDescription] = useState(todo?.description ?? '')
  const [priority, setPriority] = useState<TodoPriority>(todo?.priority ?? 'medium')
  const [assigneeId, setAssigneeId] = useState<number | ''>(todo?.assignee_id ?? '')
  const [dueDate, setDueDate] = useState(
    todo?.due_date ? todo.due_date.split('T')[0] : ''
  )

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api.users.list().then(setUsers).catch(() => {})
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) { setError('タイトルを入力してください'); return }
    setLoading(true)
    setError(null)
    try {
      const payload: TodoCreate & TodoUpdate = {
        title: title.trim(),
        description: description.trim() || undefined,
        priority,
        assignee_id: assigneeId !== '' ? (assigneeId as number) : undefined,
        due_date: dueDate ? new Date(dueDate).toISOString() : undefined,
      }
      const result = isEdit
        ? await api.todos.update(todo!.id, payload)
        : await api.todos.create(payload)
      onSaved(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存に失敗しました')
    } finally {
      setLoading(false)
    }
  }

  const PRIORITIES: { value: TodoPriority; label: string; color: string }[] = [
    { value: 'low',    label: '低',  color: '#64748b' },
    { value: 'medium', label: '中',  color: '#f59e0b' },
    { value: 'high',   label: '高',  color: '#ef4444' },
  ]

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <h2 className={styles.title}>{isEdit ? 'タスクを編集' : 'タスクを作成'}</h2>
        <form onSubmit={handleSubmit}>

          <div className={styles.field}>
            <label className={styles.label}>タイトル <span className={styles.req}>*</span></label>
            <input className={styles.input} value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="タスクの内容を入力" autoFocus />
          </div>

          <div className={styles.field}>
            <label className={styles.label}>詳細</label>
            <textarea className={styles.textarea} value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="補足説明・手順・参考情報など" rows={3} />
          </div>

          <div className={styles.row2}>
            <div className={styles.field}>
              <label className={styles.label}>優先度</label>
              <div className={styles.priorityBtns}>
                {PRIORITIES.map(p => (
                  <button key={p.value} type="button"
                    className={`${styles.priorityBtn} ${priority === p.value ? styles.activePriority : ''}`}
                    style={priority === p.value ? { borderColor: p.color, color: p.color, background: `${p.color}18` } : {}}
                    onClick={() => setPriority(p.value)}>
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            <div className={styles.field}>
              <label className={styles.label}>期限</label>
              <input className={styles.input} type="date" value={dueDate}
                onChange={e => setDueDate(e.target.value)} />
            </div>
          </div>

          <div className={styles.field}>
            <label className={styles.label}>担当者</label>
            <select className={styles.select} value={assigneeId}
              onChange={e => setAssigneeId(e.target.value ? Number(e.target.value) : '')}>
              <option value="">未割り当て</option>
              {users.map(u => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>
            {users.length === 0 && (
              <span className={styles.hint}>ユーザーが登録されていません（設定画面から追加できます）</span>
            )}
          </div>

          {error && <p className={styles.error}>{error}</p>}

          <div className={styles.footer}>
            <button type="button" className={styles.cancel} onClick={onClose}>キャンセル</button>
            <button type="submit" className={styles.submit} disabled={loading || !title.trim()}>
              {loading ? '保存中...' : isEdit ? '更新' : '作成'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
