/**
 * サンプルを 1 件登録するダイアログ。まとめて登録するときは DatasetImportModal.tsx。
 */
import { useState } from 'react'
import { api } from '../api/client'
import type { Sample } from '../api/types'
import styles from './SampleCreateModal.module.css'

interface Props {
  onCreated: (sample: Sample) => void
  onClose: () => void
}

export function SampleCreateModal({ onCreated, onClose }: Props) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setLoading(true)
    setError(null)
    try {
      const sample = await api.samples.create({ name: name.trim(), description: description.trim() || undefined })
      onCreated(sample)
    } catch (err) {
      setError(err instanceof Error ? err.message : '作成に失敗しました')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <h2 className={styles.title}>サンプルを登録</h2>
        <form onSubmit={handleSubmit}>
          <div className={styles.field}>
            <label className={styles.label}>サンプル名 <span className={styles.required}>*</span></label>
            <input
              className={styles.input}
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="例: sample_001"
              autoFocus
              required
            />
          </div>
          <div className={styles.field}>
            <label className={styles.label}>説明</label>
            <textarea
              className={styles.textarea}
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="鋳造条件の概要など"
              rows={3}
            />
          </div>
          {error && <p className={styles.error}>{error}</p>}
          <div className={styles.actions}>
            <button type="button" className={styles.cancel} onClick={onClose}>キャンセル</button>
            <button type="submit" className={styles.submit} disabled={loading || !name.trim()}>
              {loading ? '登録中...' : '登録'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
