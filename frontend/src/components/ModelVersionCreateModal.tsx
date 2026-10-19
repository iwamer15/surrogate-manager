/**
 * モデルの版を作るダイアログ（アルゴリズム・ハイパーパラメータ・特徴量・目的変数）。
 */
import { useState, useEffect } from 'react'
import { api } from '../api/client'
import type { ModelVersion, Sample, SampleSplit } from '../api/types'
import styles from './ModelVersionCreateModal.module.css'

interface Props {
  onCreated: (v: ModelVersion) => void
  onClose: () => void
}

type SampleEntry = { sample_id: number; split: SampleSplit }

const ALGORITHMS = ['Random Forest', 'XGBoost', 'MLP (Neural Network)', 'Gaussian Process', 'Ridge Regression', 'SVR', 'その他']

export function ModelVersionCreateModal({ onCreated, onClose }: Props) {
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [samples, setSamples] = useState<Sample[]>([])

  // Step1: 基本情報
  const [versionName, setVersionName] = useState('')
  const [description, setDescription] = useState('')
  const [algorithm, setAlgorithm] = useState('')
  const [customAlgo, setCustomAlgo] = useState('')

  // Step2: 特徴量・目的変数
  const [inputFeaturesText, setInputFeaturesText] = useState('')
  const [targetOutputsText, setTargetOutputsText] = useState('')

  // Step3: サンプル割り当て
  const [sampleEntries, setSampleEntries] = useState<SampleEntry[]>([])

  // ハイパーパラメータ（キー/値ペア）
  const [hpRows, setHpRows] = useState<{ key: string; value: string }[]>([{ key: '', value: '' }])

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api.samples.list().then(setSamples).catch(() => {})
  }, [])

  function toggleSample(sampleId: number) {
    setSampleEntries(prev => {
      const exists = prev.find(e => e.sample_id === sampleId)
      if (exists) return prev.filter(e => e.sample_id !== sampleId)
      return [...prev, { sample_id: sampleId, split: 'train' }]
    })
  }

  function setSplit(sampleId: number, split: SampleSplit) {
    setSampleEntries(prev => prev.map(e => e.sample_id === sampleId ? { ...e, split } : e))
  }

  function addHpRow() {
    setHpRows(prev => [...prev, { key: '', value: '' }])
  }

  function updateHpRow(i: number, field: 'key' | 'value', val: string) {
    setHpRows(prev => prev.map((r, idx) => idx === i ? { ...r, [field]: val } : r))
  }

  function removeHpRow(i: number) {
    setHpRows(prev => prev.filter((_, idx) => idx !== i))
  }

  function buildHyperparameters(): Record<string, unknown> | undefined {
    const result: Record<string, unknown> = {}
    for (const { key, value } of hpRows) {
      if (!key.trim()) continue
      const num = Number(value)
      result[key.trim()] = isNaN(num) || value.trim() === '' ? value : num
    }
    return Object.keys(result).length > 0 ? result : undefined
  }

  async function handleSubmit() {
    if (!versionName.trim()) { setError('バージョン名を入力してください'); return }
    setLoading(true)
    setError(null)
    try {
      const finalAlgo = algorithm === 'その他' ? customAlgo : algorithm
      const inputFeatures = inputFeaturesText.split(/[,\n]/).map(s => s.trim()).filter(Boolean)
      const targetOutputs = targetOutputsText.split(/[,\n]/).map(s => s.trim()).filter(Boolean)

      const version = await api.modelVersions.create({
        version_name: versionName.trim(),
        description: description.trim() || undefined,
        algorithm: finalAlgo || undefined,
        hyperparameters: buildHyperparameters(),
        input_features: inputFeatures.length > 0 ? inputFeatures : undefined,
        target_outputs: targetOutputs.length > 0 ? targetOutputs : undefined,
      })

      if (sampleEntries.length > 0) {
        const updated = await api.modelVersions.addSamples(version.id, sampleEntries)
        onCreated(updated)
      } else {
        onCreated(version)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '作成に失敗しました')
    } finally {
      setLoading(false)
    }
  }

  const trainCount = sampleEntries.filter(e => e.split === 'train').length
  const valCount = sampleEntries.filter(e => e.split === 'validation').length

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.header}>
          <h2 className={styles.title}>モデルバージョンを作成</h2>
          <div className={styles.steps}>
            {(['基本情報', '特徴量・出力', 'サンプル割り当て'] as const).map((label, i) => (
              <span key={i} className={`${styles.step} ${step === i + 1 ? styles.activeStep : step > i + 1 ? styles.doneStep : ''}`}>
                {step > i + 1 ? '✓' : i + 1}. {label}
              </span>
            ))}
          </div>
        </div>

        {/* Step 1: 基本情報 */}
        {step === 1 && (
          <div className={styles.body}>
            <div className={styles.field}>
              <label className={styles.label}>バージョン名 <span className={styles.req}>*</span></label>
              <input className={styles.input} value={versionName} onChange={e => setVersionName(e.target.value)}
                placeholder="例: v1.0-rf, exp-001-mlp" autoFocus />
            </div>
            <div className={styles.field}>
              <label className={styles.label}>説明</label>
              <textarea className={styles.textarea} value={description} onChange={e => setDescription(e.target.value)}
                placeholder="このバージョンの目的・変更点" rows={2} />
            </div>
            <div className={styles.field}>
              <label className={styles.label}>アルゴリズム</label>
              <select className={styles.select} value={algorithm} onChange={e => setAlgorithm(e.target.value)}>
                <option value="">-- 選択 --</option>
                {ALGORITHMS.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
              {algorithm === 'その他' && (
                <input className={styles.input} style={{ marginTop: 6 }} value={customAlgo}
                  onChange={e => setCustomAlgo(e.target.value)} placeholder="アルゴリズム名を入力" />
              )}
            </div>
            <div className={styles.field}>
              <label className={styles.label}>
                ハイパーパラメータ
                <button type="button" className={styles.addRowBtn} onClick={addHpRow}>+ 追加</button>
              </label>
              <div className={styles.hpGrid}>
                {hpRows.map((row, i) => (
                  <div key={i} className={styles.hpRow}>
                    <input className={styles.input} value={row.key} onChange={e => updateHpRow(i, 'key', e.target.value)}
                      placeholder="パラメータ名" />
                    <input className={styles.input} value={row.value} onChange={e => updateHpRow(i, 'value', e.target.value)}
                      placeholder="値" />
                    {hpRows.length > 1 && (
                      <button type="button" className={styles.removeBtn} onClick={() => removeHpRow(i)}>✕</button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Step 2: 特徴量・目的変数 */}
        {step === 2 && (
          <div className={styles.body}>
            <div className={styles.field}>
              <label className={styles.label}>入力特徴量（使用した鋳造条件パラメータ）</label>
              <p className={styles.hint}>カンマまたは改行区切りで入力してください</p>
              <textarea className={styles.textarea} value={inputFeaturesText}
                onChange={e => setInputFeaturesText(e.target.value)} rows={4}
                placeholder={'pour_temp\nmold_temp\ncooling_rate\nmaterial_param'} />
              {inputFeaturesText && (
                <div className={styles.tagPreview}>
                  {inputFeaturesText.split(/[,\n]/).map(s => s.trim()).filter(Boolean).map(f => (
                    <span key={f} className={styles.tag}>{f}</span>
                  ))}
                </div>
              )}
            </div>
            <div className={styles.field}>
              <label className={styles.label}>目的変数（予測した出力）</label>
              <p className={styles.hint}>カンマまたは改行区切りで入力してください</p>
              <textarea className={styles.textarea} value={targetOutputsText}
                onChange={e => setTargetOutputsText(e.target.value)} rows={4}
                placeholder={'solidification_time\nshrinkage_risk\nresidual_stress'} />
              {targetOutputsText && (
                <div className={styles.tagPreview}>
                  {targetOutputsText.split(/[,\n]/).map(s => s.trim()).filter(Boolean).map(f => (
                    <span key={f} className={`${styles.tag} ${styles.outputTag}`}>{f}</span>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Step 3: サンプル割り当て */}
        {step === 3 && (
          <div className={styles.body}>
            <div className={styles.splitSummary}>
              <span className={styles.splitBadge}>学習: {trainCount}</span>
              <span className={`${styles.splitBadge} ${styles.valBadge}`}>検証: {valCount}</span>
              <span className={styles.splitBadge}>合計: {sampleEntries.length} / {samples.length}</span>
            </div>
            <div className={styles.sampleList}>
              {samples.length === 0 ? (
                <p className={styles.noSample}>登録済みサンプルがありません</p>
              ) : samples.map(sample => {
                const entry = sampleEntries.find(e => e.sample_id === sample.id)
                const checked = !!entry
                return (
                  <div key={sample.id} className={`${styles.sampleRow} ${checked ? styles.checkedRow : ''}`}>
                    <label className={styles.checkLabel}>
                      <input type="checkbox" checked={checked} onChange={() => toggleSample(sample.id)} />
                      <span className={styles.sampleName}>{sample.name}</span>
                      {sample.description && <span className={styles.sampleDesc}>{sample.description}</span>}
                    </label>
                    {checked && (
                      <div className={styles.splitToggle}>
                        {(['train', 'validation', 'test'] as SampleSplit[]).map(split => (
                          <button key={split} type="button"
                            className={`${styles.splitBtn} ${entry?.split === split ? styles.activeSplit : ''}`}
                            onClick={() => setSplit(sample.id, split)}>
                            {split === 'train' ? '学習' : split === 'validation' ? '検証' : 'テスト'}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {error && <p className={styles.error}>{error}</p>}

        <div className={styles.footer}>
          <button type="button" className={styles.cancelBtn} onClick={onClose}>キャンセル</button>
          <div className={styles.navBtns}>
            {step > 1 && (
              <button type="button" className={styles.backBtn} onClick={() => setStep(s => (s - 1) as 1 | 2 | 3)}>
                ← 戻る
              </button>
            )}
            {step < 3 ? (
              <button type="button" className={styles.nextBtn}
                onClick={() => setStep(s => (s + 1) as 1 | 2 | 3)}
                disabled={step === 1 && !versionName.trim()}>
                次へ →
              </button>
            ) : (
              <button type="button" className={styles.submitBtn} onClick={handleSubmit} disabled={loading}>
                {loading ? '作成中...' : '作成'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
