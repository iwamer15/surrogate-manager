/**
 * 予測結果管理画面: 予測値と解析値の記録・比較（MAE / RMSE / R²）。
 */
import { useEffect, useState } from 'react'
import { api } from '../api/client'
import type { Prediction, ModelVersion } from '../api/types'
import { PredictionCreateModal } from '../components/PredictionCreateModal'
import styles from './PredictionsPage.module.css'

function fmt(n: number | null | undefined, digits = 4) {
  return n != null ? n.toFixed(digits) : '—'
}
function fmtDate(iso: string) {
  return new Date(iso).toLocaleString('ja-JP', {
    month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  })
}

function ErrorBar({ rel }: { rel: number | null }) {
  if (rel == null) return null
  const abs = Math.abs(rel)
  const capped = Math.min(abs, 30)
  const color = abs < 5 ? '#22c55e' : abs < 15 ? '#f59e0b' : '#ef4444'
  return (
    <div className={styles.errorBarWrap} title={`${rel > 0 ? '+' : ''}${rel.toFixed(1)}%`}>
      {rel < 0 && (
        <div className={styles.barLeft} style={{ width: `${capped / 30 * 50}%`, background: color }} />
      )}
      <div className={styles.barCenter} />
      {rel > 0 && (
        <div className={styles.barRight} style={{ width: `${capped / 30 * 50}%`, background: color }} />
      )}
    </div>
  )
}

export function PredictionsPage() {
  const [predictions, setPredictions] = useState<Prediction[]>([])
  const [versions, setVersions] = useState<ModelVersion[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filterVersionId, setFilterVersionId] = useState<number | ''>('')
  const [selected, setSelected] = useState<Prediction | null>(null)
  const [showCreate, setShowCreate] = useState(false)

  useEffect(() => {
    api.modelVersions.list().then(setVersions).catch(() => {})
    load()
  }, [])

  useEffect(() => { load() }, [filterVersionId])

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const data = await api.predictions.list(
        filterVersionId !== '' ? { model_version_id: filterVersionId as number } : undefined
      )
      setPredictions(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : '取得に失敗しました')
    } finally {
      setLoading(false)
    }
  }

  async function handleDelete(id: number) {
    if (!confirm('この予測記録を削除しますか？')) return
    await api.predictions.delete(id)
    setPredictions(prev => prev.filter(p => p.id !== id))
    if (selected?.id === id) setSelected(null)
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>予測結果管理</h1>
          <p className={styles.subtitle}>{predictions.length} 件</p>
        </div>
        <button className={styles.addBtn} onClick={() => setShowCreate(true)}>+ 予測結果を記録</button>
      </div>

      <div className={styles.toolbar}>
        <label className={styles.filterLabel}>バージョンで絞り込み</label>
        <select className={styles.filterSelect} value={filterVersionId}
          onChange={e => setFilterVersionId(e.target.value ? Number(e.target.value) : '')}>
          <option value="">すべてのバージョン</option>
          {versions.map(v => (
            <option key={v.id} value={v.id}>{v.version_name}</option>
          ))}
        </select>
        <button className={styles.refreshBtn} onClick={load}>↻</button>
      </div>

      {error && (
        <div className={styles.errorBanner}>{error} <button onClick={load}>再試行</button></div>
      )}

      <div className={styles.content}>
        {/* 一覧テーブル */}
        <div className={styles.tableWrap}>
          {loading ? (
            <div className={styles.empty}>読み込み中...</div>
          ) : predictions.length === 0 ? (
            <div className={styles.empty}>予測結果がまだ記録されていません</div>
          ) : (
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>サンプル</th>
                  <th>モデルバージョン</th>
                  <th>MAE</th>
                  <th>RMSE</th>
                  <th>R²</th>
                  <th>メモ</th>
                  <th>日時</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {predictions.map(p => (
                  <tr key={p.id}
                    className={selected?.id === p.id ? styles.selectedRow : ''}
                    onClick={() => setSelected(p)}>
                    <td className={styles.nameCell}>{p.sample_name}</td>
                    <td className={styles.versionCell}>{p.model_version_name || '—'}</td>
                    <td className={styles.metricCell}>{fmt(p.mae)}</td>
                    <td className={styles.metricCell}>{fmt(p.rmse)}</td>
                    <td className={styles.metricCell}>{fmt(p.r2, 3)}</td>
                    <td className={styles.noteCell}>{p.note ?? '—'}</td>
                    <td className={styles.dateCell}>{fmtDate(p.predicted_at)}</td>
                    <td>
                      <button className={styles.deleteBtn}
                        onClick={e => { e.stopPropagation(); handleDelete(p.id) }}>🗑</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* 詳細・比較パネル */}
        {selected && (
          <aside className={styles.detail}>
            <div className={styles.detailHead}>
              <div>
                <div className={styles.detailTitle}>{selected.sample_name}</div>
                {selected.model_version_name && (
                  <span className={styles.versionTag}>{selected.model_version_name}</span>
                )}
              </div>
              <button className={styles.closeBtn} onClick={() => setSelected(null)}>✕</button>
            </div>

            {selected.note && (
              <div className={styles.noteBlock}>{selected.note}</div>
            )}

            {/* 全体メトリクス */}
            {selected.mae != null && (
              <div className={styles.section}>
                <div className={styles.sectionTitle}>全体メトリクス</div>
                <div className={styles.metricsRow}>
                  {[['MAE', selected.mae, 4], ['RMSE', selected.rmse, 4], ['R²', selected.r2, 3]].map(([label, val, d]) => (
                    <div key={label as string} className={styles.metricBox}>
                      <span className={styles.metricLabel}>{label as string}</span>
                      <span className={styles.metricValue}>{fmt(val as number | null, d as number)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 出力変数ごとの比較 */}
            {selected.per_output_metrics && (
              <div className={styles.section}>
                <div className={styles.sectionTitle}>予測値 vs 実測値</div>
                <div className={styles.compTable}>
                  {Object.entries(selected.per_output_metrics).map(([key, m]) => (
                    <div key={key} className={styles.compRow}>
                      <div className={styles.compName}>{key}</div>
                      <div className={styles.compValues}>
                        <div className={styles.compValue}>
                          <span className={styles.compLabel}>予測</span>
                          <span className={styles.compNum}>{m.predicted}</span>
                        </div>
                        <div className={styles.compArrow}>→</div>
                        <div className={styles.compValue}>
                          <span className={styles.compLabel}>実測</span>
                          <span className={styles.compNum}>{m.actual}</span>
                        </div>
                      </div>
                      <div className={styles.compError}>
                        <span className={`${styles.errorVal} ${Math.abs(m.rel_error_pct ?? 0) > 15 ? styles.errorHigh : Math.abs(m.rel_error_pct ?? 0) > 5 ? styles.errorMed : styles.errorLow}`}>
                          {m.error > 0 ? '+' : ''}{m.error.toFixed(4)}
                          {m.rel_error_pct != null && ` (${m.rel_error_pct > 0 ? '+' : ''}${m.rel_error_pct.toFixed(1)}%)`}
                        </span>
                        <ErrorBar rel={m.rel_error_pct} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 実測値なしの場合：予測値のみ表示 */}
            {!selected.per_output_metrics && selected.predicted_values && (
              <div className={styles.section}>
                <div className={styles.sectionTitle}>予測値</div>
                <div className={styles.predOnly}>
                  {Object.entries(selected.predicted_values).map(([k, v]) => (
                    <div key={k} className={styles.predRow}>
                      <span className={styles.predKey}>{k}</span>
                      <span className={styles.predVal}>{v}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className={styles.section}>
              <div className={styles.dateInfo}>{new Date(selected.predicted_at).toLocaleString('ja-JP')}</div>
            </div>
          </aside>
        )}
      </div>

      {showCreate && (
        <PredictionCreateModal
          defaultVersionId={filterVersionId !== '' ? filterVersionId as number : undefined}
          onCreated={p => { setPredictions(prev => [p, ...prev]); setShowCreate(false); setSelected(p) }}
          onClose={() => setShowCreate(false)}
        />
      )}
    </div>
  )
}
