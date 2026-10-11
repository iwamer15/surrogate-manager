import { useEffect, useState } from 'react'
import { api } from '../api/client'
import type { Sample } from '../api/types'
import { StatusBadge } from '../components/StatusBadge'
import { SampleCreateModal } from '../components/SampleCreateModal'
import styles from './SamplesPage.module.css'

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('ja-JP', {
    year: 'numeric', month: '2-digit', day: '2-digit',
  })
}

export function SamplesPage() {
  const [samples, setSamples] = useState<Sample[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [selected, setSelected] = useState<Sample | null>(null)

  useEffect(() => {
    load()
  }, [])

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const data = await api.samples.list()
      setSamples(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : '取得に失敗しました')
    } finally {
      setLoading(false)
    }
  }

  async function handleDelete(id: number) {
    if (!confirm('このサンプルを削除しますか？')) return
    await api.samples.delete(id)
    setSamples(prev => prev.filter(s => s.id !== id))
    if (selected?.id === id) setSelected(null)
  }

  const filtered = samples.filter(s =>
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    (s.description ?? '').toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>データ管理</h1>
          <p className={styles.subtitle}>{samples.length} 件のサンプル</p>
        </div>
        <button className={styles.addBtn} onClick={() => setShowModal(true)}>
          + サンプルを登録
        </button>
      </div>

      <div className={styles.toolbar}>
        <input
          className={styles.search}
          type="search"
          placeholder="サンプル名・説明で検索..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <button className={styles.refreshBtn} onClick={load} title="更新">↻</button>
      </div>

      {error && (
        <div className={styles.errorBanner}>
          {error}
          <button onClick={load}>再試行</button>
        </div>
      )}

      <div className={styles.content}>
        <div className={styles.tableWrap}>
          {loading ? (
            <div className={styles.empty}>読み込み中...</div>
          ) : filtered.length === 0 ? (
            <div className={styles.empty}>
              {search ? '検索結果がありません' : 'サンプルがまだ登録されていません'}
            </div>
          ) : (
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>サンプル名</th>
                  <th>説明</th>
                  <th>ステータス</th>
                  <th>ファイル数</th>
                  <th>DVC Rev</th>
                  <th>登録日</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(sample => (
                  <tr
                    key={sample.id}
                    className={selected?.id === sample.id ? styles.selectedRow : ''}
                    onClick={() => setSelected(sample)}
                  >
                    <td className={styles.nameCell}>{sample.name}</td>
                    <td className={styles.descCell}>{sample.description ?? '—'}</td>
                    <td><StatusBadge status={sample.status} /></td>
                    <td>{sample.files.length}</td>
                    <td>
                      {sample.dvc_rev
                        ? <code className={styles.rev}>{sample.dvc_rev.slice(0, 8)}</code>
                        : '—'
                      }
                    </td>
                    <td>{formatDate(sample.created_at)}</td>
                    <td>
                      <button
                        className={styles.deleteBtn}
                        onClick={e => { e.stopPropagation(); handleDelete(sample.id) }}
                        title="削除"
                      >
                        🗑
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {selected && (
          <aside className={styles.detail}>
            <div className={styles.detailHeader}>
              <h2 className={styles.detailTitle}>{selected.name}</h2>
              <button className={styles.closeBtn} onClick={() => setSelected(null)}>✕</button>
            </div>
            <StatusBadge status={selected.status} />
            {selected.description && (
              <p className={styles.detailDesc}>{selected.description}</p>
            )}
            <dl className={styles.meta}>
              <dt>登録日</dt>
              <dd>{formatDate(selected.created_at)}</dd>
              <dt>最終更新</dt>
              <dd>{formatDate(selected.updated_at)}</dd>
              {selected.stl_path && (
                <>
                  <dt>STLファイル</dt>
                  <dd className={styles.path}>{selected.stl_path}</dd>
                </>
              )}
              {selected.dvc_rev && (
                <>
                  <dt>DVC Rev</dt>
                  <dd><code>{selected.dvc_rev}</code></dd>
                </>
              )}
            </dl>
            <div className={styles.filesSection}>
              <h3 className={styles.filesTitle}>ファイル ({selected.files.length})</h3>
              {selected.files.length === 0 ? (
                <p className={styles.noFiles}>ファイルが登録されていません</p>
              ) : (
                <ul className={styles.fileList}>
                  {selected.files.map(f => (
                    <li key={f.id} className={styles.fileItem}>
                      <span className={styles.fileType}>{f.file_type}</span>
                      <span className={styles.fileName}>{f.filename}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </aside>
        )}
      </div>

      {showModal && (
        <SampleCreateModal
          onCreated={sample => {
            setSamples(prev => [sample, ...prev])
            setShowModal(false)
            setSelected(sample)
          }}
          onClose={() => setShowModal(false)}
        />
      )}
    </div>
  )
}
