import { useState } from 'react'
import { api } from '../api/client'
import type { ModelVersion, PerOutputMetric } from '../api/types'
import styles from './MetricsUpdateModal.module.css'

interface Props {
  version: ModelVersion
  onUpdated: (v: ModelVersion) => void
  onClose: () => void
}

export function MetricsUpdateModal({ version, onUpdated, onClose }: Props) {
  const outputs = version.target_outputs ?? []

  const [mae, setMae] = useState(version.mae?.toString() ?? '')
  const [rmse, setRmse] = useState(version.rmse?.toString() ?? '')
  const [r2, setR2] = useState(version.r2?.toString() ?? '')
  const [artifactPath, setArtifactPath] = useState(version.artifact_path ?? '')

  const initPerOutput = (): Record<string, { mae: string; rmse: string; r2: string }> => {
    const result: Record<string, { mae: string; rmse: string; r2: string }> = {}
    for (const out of outputs) {
      const existing = version.per_output_metrics?.[out]
      result[out] = {
        mae: existing?.mae?.toString() ?? '',
        rmse: existing?.rmse?.toString() ?? '',
        r2: existing?.r2?.toString() ?? '',
      }
    }
    return result
  }
  const [perOutput, setPerOutput] = useState(initPerOutput)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function updatePerOutput(out: string, field: keyof PerOutputMetric, val: string) {
    setPerOutput(prev => ({ ...prev, [out]: { ...prev[out], [field]: val } }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const perOutputMetrics: Record<string, PerOutputMetric> = {}
      for (const [out, vals] of Object.entries(perOutput)) {
        if (vals.mae || vals.rmse || vals.r2) {
          perOutputMetrics[out] = {
            mae: parseFloat(vals.mae) || 0,
            rmse: parseFloat(vals.rmse) || 0,
            r2: parseFloat(vals.r2) || 0,
          }
        }
      }

      const updated = await api.modelVersions.update(version.id, {
        status: 'trained',
        mae: mae ? parseFloat(mae) : undefined,
        rmse: rmse ? parseFloat(rmse) : undefined,
        r2: r2 ? parseFloat(r2) : undefined,
        per_output_metrics: Object.keys(perOutputMetrics).length > 0 ? perOutputMetrics : undefined,
        artifact_path: artifactPath || undefined,
      })
      onUpdated(updated)
    } catch (err) {
      setError(err instanceof Error ? err.message : '更新に失敗しました')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <h2 className={styles.title}>精度メトリクスを記録 — {version.version_name}</h2>
        <form onSubmit={handleSubmit}>
          <div className={styles.section}>
            <h3 className={styles.sectionTitle}>全体メトリクス</h3>
            <div className={styles.metricsGrid}>
              {[['MAE', mae, setMae], ['RMSE', rmse, setRmse], ['R²', r2, setR2]].map(([label, val, setter]) => (
                <div key={label as string} className={styles.metricField}>
                  <label className={styles.label}>{label as string}</label>
                  <input className={styles.input} type="number" step="any" value={val as string}
                    onChange={e => (setter as (v: string) => void)(e.target.value)}
                    placeholder="0.000" />
                </div>
              ))}
            </div>
          </div>

          {outputs.length > 0 && (
            <div className={styles.section}>
              <h3 className={styles.sectionTitle}>出力変数ごとのメトリクス</h3>
              {outputs.map(out => (
                <div key={out} className={styles.outputBlock}>
                  <div className={styles.outputName}>{out}</div>
                  <div className={styles.metricsGrid}>
                    {(['mae', 'rmse', 'r2'] as const).map(field => (
                      <div key={field} className={styles.metricField}>
                        <label className={styles.label}>{field.toUpperCase()}</label>
                        <input className={styles.input} type="number" step="any"
                          value={perOutput[out]?.[field] ?? ''}
                          onChange={e => updatePerOutput(out, field, e.target.value)}
                          placeholder="0.000" />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className={styles.section}>
            <h3 className={styles.sectionTitle}>モデルファイルパス</h3>
            <input className={styles.inputFull} value={artifactPath}
              onChange={e => setArtifactPath(e.target.value)}
              placeholder="/path/to/model.pkl" />
          </div>

          {error && <p className={styles.error}>{error}</p>}

          <div className={styles.footer}>
            <button type="button" className={styles.cancel} onClick={onClose}>キャンセル</button>
            <button type="submit" className={styles.submit} disabled={loading}>
              {loading ? '保存中...' : '保存（ステータスを「学習済み」に更新）'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
