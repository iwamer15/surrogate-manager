/**
 * 予測結果を記録するダイアログ（出力ごとに予測値と解析値を入力）。
 */
import { useState, useEffect } from 'react'
import { api } from '../api/client'
import type { Prediction, Sample, ModelVersion } from '../api/types'
import styles from './PredictionCreateModal.module.css'

interface Props {
  onCreated: (p: Prediction) => void
  onClose: () => void
  defaultVersionId?: number
}

export function PredictionCreateModal({ onCreated, onClose, defaultVersionId }: Props) {
  const [samples, setSamples] = useState<Sample[]>([])
  const [versions, setVersions] = useState<ModelVersion[]>([])
  const [sampleId, setSampleId] = useState<number | ''>('')
  const [versionId, setVersionId] = useState<number | ''>(defaultVersionId ?? '')
  const [note, setNote] = useState('')

  const selectedVersion = versions.find(v => v.id === versionId)
  const outputs = selectedVersion?.target_outputs ?? []

  const [predicted, setPredicted] = useState<Record<string, string>>({})
  const [actual, setActual] = useState<Record<string, string>>({})

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api.samples.list().then(setSamples).catch(() => {})
    api.modelVersions.list().then(setVersions).catch(() => {})
  }, [])

  // バージョン変更時に入力をリセット
  useEffect(() => {
    setPredicted({})
    setActual({})
  }, [versionId])

  function setPredVal(key: string, val: string) {
    setPredicted(prev => ({ ...prev, [key]: val }))
  }
  function setActualVal(key: string, val: string) {
    setActual(prev => ({ ...prev, [key]: val }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!sampleId) { setError('サンプルを選択してください'); return }
    if (outputs.length === 0 && Object.keys(predicted).length === 0) {
      setError('予測値を入力してください'); return
    }

    const predictedValues: Record<string, number> = {}
    for (const [k, v] of Object.entries(predicted)) {
      if (v !== '') predictedValues[k] = parseFloat(v)
    }
    const actualValues: Record<string, number> = {}
    for (const [k, v] of Object.entries(actual)) {
      if (v !== '') actualValues[k] = parseFloat(v)
    }

    if (Object.keys(predictedValues).length === 0) {
      setError('少なくとも1つの予測値を入力してください'); return
    }

    setLoading(true)
    setError(null)
    try {
      const result = await api.predictions.create({
        sample_id: sampleId as number,
        model_version_id: versionId !== '' ? (versionId as number) : undefined,
        predicted_values: predictedValues,
        actual_values: Object.keys(actualValues).length > 0 ? actualValues : undefined,
        note: note.trim() || undefined,
      })
      onCreated(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : '記録に失敗しました')
    } finally {
      setLoading(false)
    }
  }

  const hasActual = outputs.some(k => actual[k])

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <h2 className={styles.title}>予測結果を記録</h2>
        <form onSubmit={handleSubmit}>
          {/* サンプル・バージョン選択 */}
          <div className={styles.row2}>
            <div className={styles.field}>
              <label className={styles.label}>サンプル <span className={styles.req}>*</span></label>
              <select className={styles.select} value={sampleId}
                onChange={e => setSampleId(e.target.value ? Number(e.target.value) : '')}>
                <option value="">-- 選択 --</option>
                {samples.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
            <div className={styles.field}>
              <label className={styles.label}>モデルバージョン</label>
              <select className={styles.select} value={versionId}
                onChange={e => setVersionId(e.target.value ? Number(e.target.value) : '')}>
                <option value="">-- 選択 --</option>
                {versions.map(v => (
                  <option key={v.id} value={v.id}>{v.version_name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* 予測値 / 実測値 入力テーブル */}
          {outputs.length > 0 ? (
            <div className={styles.tableSection}>
              <div className={styles.tableHeader}>
                <span className={styles.colOutput}>出力変数</span>
                <span className={styles.colPred}>サロゲート予測値</span>
                <span className={styles.colActual}>解析結果（実測値）</span>
              </div>
              {outputs.map(key => (
                <div key={key} className={styles.tableRow}>
                  <span className={styles.outputName}>{key}</span>
                  <input
                    className={styles.numInput}
                    type="number" step="any"
                    value={predicted[key] ?? ''}
                    onChange={e => setPredVal(key, e.target.value)}
                    placeholder="予測値"
                  />
                  <input
                    className={`${styles.numInput} ${styles.actualInput}`}
                    type="number" step="any"
                    value={actual[key] ?? ''}
                    onChange={e => setActualVal(key, e.target.value)}
                    placeholder="実測値（任意）"
                  />
                </div>
              ))}
              {!hasActual && (
                <p className={styles.hint}>実測値を入力するとMAE/RMSE/R²が自動計算されます</p>
              )}
            </div>
          ) : (
            <div className={styles.noOutputs}>
              {versionId
                ? 'このバージョンには目的変数が設定されていません。自由入力で記録できます。'
                : 'モデルバージョンを選択すると目的変数が自動表示されます。'}
            </div>
          )}

          <div className={styles.field}>
            <label className={styles.label}>メモ</label>
            <input className={styles.input} value={note} onChange={e => setNote(e.target.value)}
              placeholder="条件の特記事項など" />
          </div>

          {error && <p className={styles.error}>{error}</p>}

          <div className={styles.footer}>
            <button type="button" className={styles.cancel} onClick={onClose}>キャンセル</button>
            <button type="submit" className={styles.submit} disabled={loading}>
              {loading ? '記録中...' : '記録'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
