/**
 * バージョン管理画面: モデルの版の一覧・作成・状態の更新、学習・検証に使うサンプルの割り当て。
 */
import { useEffect, useState } from 'react'
import { api } from '../api/client'
import type { ModelVersion, ModelVersionStatus } from '../api/types'
import { ModelVersionStatusBadge } from '../components/ModelVersionStatusBadge'
import { ModelVersionCreateModal } from '../components/ModelVersionCreateModal'
import { MetricsUpdateModal } from '../components/MetricsUpdateModal'
import styles from './ModelVersionsPage.module.css'

function fmt(n: number | null | undefined): string {
  return n != null ? n.toFixed(4) : '—'
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit' })
}

const STATUS_OPTIONS: { value: ModelVersionStatus | ''; label: string }[] = [
  { value: '', label: 'すべて' },
  { value: 'draft', label: '下書き' },
  { value: 'training', label: '学習中' },
  { value: 'trained', label: '学習済み' },
  { value: 'validated', label: '検証済み' },
  { value: 'deployed', label: '運用中' },
]

export function ModelVersionsPage() {
  const [versions, setVersions] = useState<ModelVersion[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<ModelVersion | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [showMetrics, setShowMetrics] = useState(false)
  const [filterStatus, setFilterStatus] = useState<ModelVersionStatus | ''>('')

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    setError(null)
    try {
      setVersions(await api.modelVersions.list())
    } catch (err) {
      setError(err instanceof Error ? err.message : '取得に失敗しました')
    } finally {
      setLoading(false)
    }
  }

  function upsert(v: ModelVersion) {
    setVersions(prev => {
      const idx = prev.findIndex(x => x.id === v.id)
      return idx >= 0 ? prev.map((x, i) => i === idx ? v : x) : [v, ...prev]
    })
    setSelected(v)
  }

  async function handleStatusChange(id: number, status: ModelVersionStatus) {
    const updated = await api.modelVersions.update(id, { status })
    upsert(updated)
  }

  async function handleDelete(id: number) {
    if (!confirm('このバージョンを削除しますか？')) return
    await api.modelVersions.delete(id)
    setVersions(prev => prev.filter(v => v.id !== id))
    if (selected?.id === id) setSelected(null)
  }

  async function handleRemoveSample(versionId: number, sampleId: number) {
    const updated = await api.modelVersions.removeSample(versionId, sampleId)
      .then(() => api.modelVersions.get(versionId))
    upsert(updated)
  }

  const filtered = versions.filter(v => !filterStatus || v.status === filterStatus)

  const trainCount = (v: ModelVersion) => v.version_samples.filter(s => s.split === 'train').length
  const valCount = (v: ModelVersion) => v.version_samples.filter(s => s.split === 'validation').length

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>バージョン管理</h1>
          <p className={styles.subtitle}>{versions.length} バージョン</p>
        </div>
        <button className={styles.addBtn} onClick={() => setShowCreate(true)}>+ バージョンを作成</button>
      </div>

      <div className={styles.toolbar}>
        <div className={styles.filterTabs}>
          {STATUS_OPTIONS.map(opt => (
            <button key={opt.value}
              className={`${styles.filterTab} ${filterStatus === opt.value ? styles.activeTab : ''}`}
              onClick={() => setFilterStatus(opt.value)}>
              {opt.label}
              <span className={styles.tabCount}>
                {opt.value === '' ? versions.length : versions.filter(v => v.status === opt.value).length}
              </span>
            </button>
          ))}
        </div>
        <button className={styles.refreshBtn} onClick={load} title="更新">↻</button>
      </div>

      {error && (
        <div className={styles.errorBanner}>{error} <button onClick={load}>再試行</button></div>
      )}

      <div className={styles.content}>
        <div className={styles.tableWrap}>
          {loading ? (
            <div className={styles.empty}>読み込み中...</div>
          ) : filtered.length === 0 ? (
            <div className={styles.empty}>
              {filterStatus ? 'このステータスのバージョンはありません' : 'バージョンがまだ作成されていません'}
            </div>
          ) : (
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>バージョン名</th>
                  <th>アルゴリズム</th>
                  <th>ステータス</th>
                  <th>学習</th>
                  <th>検証</th>
                  <th>MAE</th>
                  <th>RMSE</th>
                  <th>R²</th>
                  <th>作成日</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(v => (
                  <tr key={v.id}
                    className={selected?.id === v.id ? styles.selectedRow : ''}
                    onClick={() => setSelected(v)}>
                    <td className={styles.nameCell}>{v.version_name}</td>
                    <td className={styles.algoCell}>{v.algorithm ?? '—'}</td>
                    <td><ModelVersionStatusBadge status={v.status} /></td>
                    <td><span className={styles.countBadge}>{trainCount(v)}</span></td>
                    <td><span className={`${styles.countBadge} ${styles.valCount}`}>{valCount(v)}</span></td>
                    <td className={styles.metricCell}>{fmt(v.mae)}</td>
                    <td className={styles.metricCell}>{fmt(v.rmse)}</td>
                    <td className={styles.metricCell}>{v.r2 != null ? v.r2.toFixed(3) : '—'}</td>
                    <td>{fmtDate(v.created_at)}</td>
                    <td>
                      <button className={styles.deleteBtn}
                        onClick={e => { e.stopPropagation(); handleDelete(v.id) }}
                        title="削除">🗑</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {selected && (
          <aside className={styles.detail}>
            <div className={styles.detailHead}>
              <div>
                <div className={styles.detailTitle}>{selected.version_name}</div>
                <ModelVersionStatusBadge status={selected.status} />
              </div>
              <button className={styles.closeBtn} onClick={() => setSelected(null)}>✕</button>
            </div>

            {selected.description && (
              <p className={styles.detailDesc}>{selected.description}</p>
            )}

            {/* ステータス変更 */}
            <div className={styles.section}>
              <div className={styles.sectionTitle}>ステータス変更</div>
              <div className={styles.statusBtns}>
                {(['draft', 'training', 'trained', 'validated', 'deployed'] as ModelVersionStatus[]).map(s => (
                  <button key={s}
                    className={`${styles.statusBtn} ${selected.status === s ? styles.activeStatus : ''}`}
                    onClick={() => handleStatusChange(selected.id, s)}>
                    {s === 'draft' ? '下書き' : s === 'training' ? '学習中' : s === 'trained' ? '学習済み' : s === 'validated' ? '検証済み' : '運用中'}
                  </button>
                ))}
              </div>
            </div>

            {/* 学習設定 */}
            <div className={styles.section}>
              <div className={styles.sectionTitle}>学習設定</div>
              {selected.algorithm && (
                <div className={styles.configRow}>
                  <span className={styles.configKey}>アルゴリズム</span>
                  <span className={styles.configVal}>{selected.algorithm}</span>
                </div>
              )}
              {selected.hyperparameters && Object.entries(selected.hyperparameters).map(([k, v]) => (
                <div key={k} className={styles.configRow}>
                  <span className={styles.configKey}>{k}</span>
                  <code className={styles.configVal}>{String(v)}</code>
                </div>
              ))}
            </div>

            {/* 特徴量・出力 */}
            {(selected.input_features || selected.target_outputs) && (
              <div className={styles.section}>
                <div className={styles.sectionTitle}>特徴量 / 出力</div>
                {selected.input_features && (
                  <div className={styles.featureBlock}>
                    <span className={styles.featureLabel}>入力</span>
                    <div className={styles.tags}>
                      {selected.input_features.map(f => (
                        <span key={f} className={styles.tag}>{f}</span>
                      ))}
                    </div>
                  </div>
                )}
                {selected.target_outputs && (
                  <div className={styles.featureBlock}>
                    <span className={styles.featureLabel}>出力</span>
                    <div className={styles.tags}>
                      {selected.target_outputs.map(f => (
                        <span key={f} className={`${styles.tag} ${styles.outputTag}`}>{f}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 精度メトリクス */}
            <div className={styles.section}>
              <div className={styles.sectionTitleRow}>
                <span className={styles.sectionTitle}>精度メトリクス</span>
                <button className={styles.editBtn} onClick={() => setShowMetrics(true)}>記録 / 更新</button>
              </div>
              {selected.mae != null ? (
                <>
                  <div className={styles.metricsRow}>
                    {[['MAE', selected.mae], ['RMSE', selected.rmse], ['R²', selected.r2]].map(([label, val]) => (
                      <div key={label as string} className={styles.metricBox}>
                        <span className={styles.metricLabel}>{label as string}</span>
                        <span className={styles.metricValue}>{fmt(val as number | null)}</span>
                      </div>
                    ))}
                  </div>
                  {selected.per_output_metrics && (
                    <div className={styles.perOutputTable}>
                      <table className={styles.innerTable}>
                        <thead>
                          <tr><th>出力</th><th>MAE</th><th>RMSE</th><th>R²</th></tr>
                        </thead>
                        <tbody>
                          {Object.entries(selected.per_output_metrics).map(([out, m]) => (
                            <tr key={out}>
                              <td className={styles.outName}>{out}</td>
                              <td>{m.mae?.toFixed(4) ?? '—'}</td>
                              <td>{m.rmse?.toFixed(4) ?? '—'}</td>
                              <td>{m.r2?.toFixed(3) ?? '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </>
              ) : (
                <p className={styles.noData}>未記録</p>
              )}
            </div>

            {/* サンプル一覧 */}
            <div className={styles.section}>
              <div className={styles.sectionTitle}>
                学習/検証サンプル ({selected.version_samples.length})
              </div>
              {selected.version_samples.length === 0 ? (
                <p className={styles.noData}>サンプルが割り当てられていません</p>
              ) : (
                <ul className={styles.sampleList}>
                  {selected.version_samples.map(vs => (
                    <li key={vs.id} className={styles.sampleItem}>
                      <span className={`${styles.splitPill} ${styles[vs.split]}`}>
                        {vs.split === 'train' ? '学習' : vs.split === 'validation' ? '検証' : 'テスト'}
                      </span>
                      <span className={styles.sampleName}>{vs.sample_name || `ID:${vs.sample_id}`}</span>
                      <button className={styles.removeSampleBtn}
                        onClick={() => handleRemoveSample(selected.id, vs.sample_id)}>✕</button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {selected.artifact_path && (
              <div className={styles.section}>
                <div className={styles.sectionTitle}>モデルファイル</div>
                <code className={styles.path}>{selected.artifact_path}</code>
              </div>
            )}
          </aside>
        )}
      </div>

      {showCreate && (
        <ModelVersionCreateModal
          onCreated={v => { upsert(v); setShowCreate(false) }}
          onClose={() => setShowCreate(false)}
        />
      )}
      {showMetrics && selected && (
        <MetricsUpdateModal
          version={selected}
          onUpdated={v => { upsert(v); setShowMetrics(false) }}
          onClose={() => setShowMetrics(false)}
        />
      )}
    </div>
  )
}
