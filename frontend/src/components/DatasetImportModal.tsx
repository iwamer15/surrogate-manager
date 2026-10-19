/**
 * フォルダからサンプルを一括で取り込むダイアログ（「データ管理」画面）。
 *
 * 結果 CSV と STL の対応付けは 2 つの方法で決める（優先順: 個別指定 → ルール → 同じフォルダ）。
 *   ① 個別指定: 表の STL 欄でサンプルごとに選び「選択を保存」→ dataset_overrides.yml
 *   ② ルール  : dataset.yml を書いて「試す」で確認し「保存」
 * 決まったら「取り込む」でサンプルを登録する（ファイルはコピーせず、元の場所のパスを記録）。
 * 仕組みは backend/services/dataset_spec.py（ml-process-lab と共通）。
 */
import { useMemo, useState } from 'react'
import { api } from '../api/client'
import type { DatasetImportResult, DatasetPreview, StlSource } from '../api/types'
import styles from './DatasetImportModal.module.css'

const SOURCE_LABEL: Record<StlSource, string> = {
  override: '個別指定', rule: 'ルール', default: '同じフォルダ', missing: '未設定',
}
const CLEAR = '__clear__'   // 「個別指定を外す」の選択肢

const errText = (e: unknown) => (e instanceof Error ? e.message.replace(/^\d+ [^:]*: /, '') : String(e))

interface Props {
  onImported: () => void
  onClose: () => void
}

export function DatasetImportModal({ onImported, onClose }: Props) {
  const [root, setRoot] = useState('')
  const [data, setData] = useState<DatasetPreview | null>(null)
  const [pending, setPending] = useState<Record<string, string | null>>({})   // 未保存の個別指定
  const [onlyMissing, setOnlyMissing] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<DatasetImportResult | null>(null)
  // ルール（dataset.yml）
  const [ruleText, setRuleText] = useState('')
  const [ruleSaved, setRuleSaved] = useState('')
  const [template, setTemplate] = useState('')
  const [trial, setTrial] = useState(false)   // 保存前のルールで試している最中か

  async function run<T>(label: string, fn: () => Promise<T>): Promise<T | undefined> {
    setBusy(label); setError(null)
    try { return await fn() } catch (e) { setError(errText(e)) } finally { setBusy(null) }
  }

  async function load() {
    if (!root.trim()) return
    await run('フォルダを調べています…', async () => {
      const [p, spec] = await Promise.all([api.datasets.preview(root), api.datasets.spec(root)])
      setData(p); setPending({}); setTrial(false); setResult(null)
      setRuleText(spec.text); setRuleSaved(spec.exists ? spec.text : ''); setTemplate(spec.template)
    })
  }

  const rows = useMemo(() => (data?.samples ?? []).filter((x) => !onlyMissing || x.stl_source === 'missing'), [data, onlyMissing])
  const changed = Object.keys(pending).length

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.head}>
          <h2 className={styles.title}>フォルダから取り込む</h2>
          <button className={styles.close} onClick={onClose}>✕</button>
        </div>
        <p className={styles.hint}>
          フォルダの下にある結果 CSV を探し、STL と鋳造条件を対応付けてサンプルとして登録します。ファイルはコピーせず、元の場所のパスを記録します。
        </p>

        <div className={styles.row}>
          <input className={styles.input} value={root} onChange={(e) => setRoot(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && load()}
            placeholder="例: C:\CAE\dataset または data/ からの相対パス" autoFocus />
          <button className={styles.secondary} onClick={load} disabled={!root.trim() || !!busy}>調べる</button>
        </div>

        {error && <div className={styles.error}>{error}</div>}
        {busy && <div className={styles.hint}>{busy}</div>}

        {data && (
          <>
            <div className={styles.counts}>
              <span>{data.samples.length} サンプル</span>
              {(['override', 'rule', 'default', 'missing'] as StlSource[]).map((k) => data.counts[k] > 0 && (
                <span key={k} className={`${styles.badge} ${styles['src_' + k]}`}>{SOURCE_LABEL[k]} {data.counts[k]}</span>
              ))}
            </div>
            <p className={styles.hint}>STL は「① 表で個別に選んだもの → ② ルール（dataset.yml）→ 結果 CSV と同じフォルダ」の順で決まります。</p>
            {trial && <div className={styles.info}>保存前のルールで試した結果です。よければ下の「ルールを保存」を押してください。</div>}
            {data.warnings.map((w) => <div key={w} className={styles.warn}>⚠ {w}</div>)}

            {data.samples.length > 0 && (
              <>
                <div className={styles.row}>
                  <label className={styles.check}><input type="checkbox" checked={onlyMissing} onChange={(e) => setOnlyMissing(e.target.checked)} /> 未設定だけ表示</label>
                  <span className={styles.hint}>STL の選択肢: 名前の近い候補 → すべての STL（{data.stl_files.length}{data.stl_truncated ? '件以上' : '件'}）</span>
                  <button className={styles.secondary} disabled={!changed || !!busy || trial}
                    onClick={() => run('保存中…', async () => { setData(await api.datasets.saveOverrides(root, pending)); setPending({}) })}>
                    選択を保存{changed ? `（${changed}件）` : ''}
                  </button>
                </div>
                <div className={styles.tableWrap}>
                  <table className={styles.table}>
                    <thead><tr><th>サンプル</th><th>結果 CSV</th><th>STL</th><th>決まり方</th><th>鋳造条件</th></tr></thead>
                    <tbody>
                      {rows.map((x) => {
                        const p = x.name in pending ? pending[x.name] : undefined
                        const value = p === undefined ? (x.stl ?? '') : p === null ? CLEAR : p
                        return (
                          <tr key={x.name} className={p !== undefined ? styles.changed : ''}>
                            <td className={styles.name} title={Object.entries(x.vars).map(([k, v]) => `{${k}} = ${v}`).join('\n')}>{x.name}</td>
                            <td className={styles.path}>{x.csv}</td>
                            <td>
                              <select className={styles.select} value={value} disabled={trial}
                                onChange={(e) => {
                                  const v = e.target.value
                                  setPending((m) => {
                                    const o = { ...m }
                                    if (v === (x.stl ?? '')) delete o[x.name]
                                    else o[x.name] = v === CLEAR || v === '' ? null : v
                                    return o
                                  })
                                }}>
                                <option value="">（未設定）</option>
                                {x.stl_source === 'override' && <option value={CLEAR}>個別指定を外す（ルール・同じフォルダに戻す）</option>}
                                {x.stl && <option value={x.stl}>{x.stl}（現在）</option>}
                                <optgroup label="名前の近い候補">
                                  {x.candidates.filter((c) => c.path !== x.stl).map((c) => (
                                    <option key={c.path} value={c.path}>{c.path}（一致度 {c.score.toFixed(2)}）</option>
                                  ))}
                                </optgroup>
                                <optgroup label="すべての STL">
                                  {data.stl_files.filter((f) => f !== x.stl).map((f) => <option key={f} value={f}>{f}</option>)}
                                </optgroup>
                              </select>
                            </td>
                            <td><span className={`${styles.badge} ${styles['src_' + (p !== undefined ? 'override' : x.stl_source)]}`}>
                              {p !== undefined ? '個別指定（未保存）' : SOURCE_LABEL[x.stl_source]}</span></td>
                            <td className={styles.path}>{x.conditions ?? '—'}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            <details className={styles.rule}>
              <summary>② ルールで決める（dataset.yml）{data.spec_exists ? '— 保存済み' : '— 未作成（ひな形を表示中）'}</summary>
              <p className={styles.hint}>「STL は cad フォルダの 〇〇.stl」のような決まりを書きます。サンプル名にマウスを乗せると、ルールに使える変数の値が見られます。</p>
              <textarea className={styles.editor} spellCheck={false} rows={16} value={ruleText} onChange={(e) => setRuleText(e.target.value)} />
              <div className={styles.row}>
                <button className={styles.secondary} disabled={!!busy}
                  onClick={() => run('ルールを試しています…', async () => { setData(await api.datasets.preview(root, ruleText)); setTrial(true) })}>試す（保存しない）</button>
                <button className={styles.secondary} disabled={!!busy || ruleText === ruleSaved}
                  onClick={() => run('ルールを保存中…', async () => { setData(await api.datasets.saveSpec(root, ruleText)); setRuleSaved(ruleText); setTrial(false) })}>ルールを保存</button>
                <button className={styles.secondary} disabled={!!busy} onClick={() => setRuleText(template)}>ひな形に戻す</button>
                {trial && <button className={styles.secondary} onClick={load}>試すのをやめる</button>}
              </div>
            </details>

            {result && (
              <div className={styles.info}>
                取り込みました: 新規 {result.created.length} 件・更新 {result.updated.length} 件
                {result.skipped.length > 0 && `・スキップ ${result.skipped.length} 件`}
                {result.without_stl.length > 0 && `（STL 未設定 ${result.without_stl.length} 件）`}
              </div>
            )}
            <div className={styles.actions}>
              <button className={styles.cancel} onClick={onClose}>閉じる</button>
              <button className={styles.submit} disabled={!!busy || trial || changed > 0 || !data.samples.length}
                title={changed > 0 ? '先に「選択を保存」を押してください' : ''}
                onClick={() => run('取り込み中…', async () => { setResult(await api.datasets.importSamples(root)); onImported() })}>
                {data.samples.length} サンプルを取り込む
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
