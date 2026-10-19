/**
 * TODO 画面: カンバン形式のチームタスク管理（未着手 / 進行中 / 完了）。
 */
import { useEffect, useState } from 'react'
import { api } from '../api/client'
import type { Todo, TodoStatus } from '../api/types'
import { TodoCard } from '../components/TodoCard'
import { TodoModal } from '../components/TodoModal'
import styles from './TodosPage.module.css'

const COLUMNS: { status: TodoStatus; label: string; color: string }[] = [
  { status: 'open',        label: '未着手', color: '#64748b' },
  { status: 'in_progress', label: '進行中', color: '#f59e0b' },
  { status: 'done',        label: '完了',   color: '#22c55e' },
]

export function TodosPage() {
  const [todos, setTodos] = useState<Todo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<Todo | null | 'new'>( null) // null=非表示 'new'=新規 Todo=編集

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    setError(null)
    try {
      setTodos(await api.todos.list())
    } catch (err) {
      setError(err instanceof Error ? err.message : '取得に失敗しました')
    } finally {
      setLoading(false)
    }
  }

  function upsert(t: Todo) {
    setTodos(prev => {
      const idx = prev.findIndex(x => x.id === t.id)
      return idx >= 0 ? prev.map((x, i) => i === idx ? t : x) : [t, ...prev]
    })
  }

  async function handleMove(id: number, status: TodoStatus) {
    const updated = await api.todos.update(id, { status })
    upsert(updated)
  }

  async function handleDelete(id: number) {
    if (!confirm('このタスクを削除しますか？')) return
    await api.todos.delete(id)
    setTodos(prev => prev.filter(t => t.id !== id))
  }

  const byStatus = (status: TodoStatus) => todos.filter(t => t.status === status)
  const openCount = byStatus('open').length
  const inProgressCount = byStatus('in_progress').length
  const doneCount = byStatus('done').length
  const overdueCount = todos.filter(
    t => t.due_date && t.status !== 'done' && new Date(t.due_date) < new Date()
  ).length

  return (
    <div className={styles.page}>
      {/* ヘッダー */}
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>TODO管理</h1>
          <div className={styles.stats}>
            <span className={styles.stat}><span className={styles.dot} style={{ background: '#64748b' }} />{openCount} 未着手</span>
            <span className={styles.stat}><span className={styles.dot} style={{ background: '#f59e0b' }} />{inProgressCount} 進行中</span>
            <span className={styles.stat}><span className={styles.dot} style={{ background: '#22c55e' }} />{doneCount} 完了</span>
            {overdueCount > 0 && (
              <span className={`${styles.stat} ${styles.overdueCount}`}>⚠ {overdueCount} 期限超過</span>
            )}
          </div>
        </div>
        <div className={styles.headerActions}>
          <button className={styles.refreshBtn} onClick={load}>↻</button>
          <button className={styles.addBtn} onClick={() => setEditing('new')}>+ タスクを追加</button>
        </div>
      </div>

      {error && (
        <div className={styles.errorBanner}>{error} <button onClick={load}>再試行</button></div>
      )}

      {/* カンバンボード */}
      {loading ? (
        <div className={styles.loadingMsg}>読み込み中...</div>
      ) : (
        <div className={styles.board}>
          {COLUMNS.map(col => {
            const cards = byStatus(col.status)
            return (
              <div key={col.status} className={styles.column}>
                <div className={styles.colHeader}>
                  <div className={styles.colTitle}>
                    <span className={styles.colDot} style={{ background: col.color }} />
                    {col.label}
                    <span className={styles.colCount} style={{ background: `${col.color}20`, color: col.color }}>
                      {cards.length}
                    </span>
                  </div>
                  <button className={styles.colAddBtn}
                    onClick={() => setEditing('new')}
                    title="タスクを追加">＋</button>
                </div>

                <div className={styles.cardList}>
                  {cards.length === 0 ? (
                    <div className={styles.emptyCol}>
                      {col.status === 'open' ? 'タスクがありません' :
                       col.status === 'in_progress' ? '進行中のタスクはありません' : '完了済みはありません'}
                    </div>
                  ) : (
                    cards.map(todo => (
                      <TodoCard
                        key={todo.id}
                        todo={todo}
                        onEdit={() => setEditing(todo)}
                        onDelete={() => handleDelete(todo.id)}
                        onMove={status => handleMove(todo.id, status)}
                      />
                    ))
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {editing !== null && (
        <TodoModal
          todo={editing === 'new' ? undefined : editing}
          onSaved={t => { upsert(t); setEditing(null) }}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}
