import { useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../api/client'
import type { AnalyzeResult, ClosedLoop, FieldFile, FieldInfo } from '../api/types'
import { PointCloudView, type CloudData, type ViewUniforms } from '../components/fieldviewer/PointCloudView'
import { NeighborhoodEditor, presetOffsets, type Offset } from '../components/fieldviewer/NeighborhoodEditor'
import { categorical, cssRgb, turbo, TURBO_GRADIENT } from '../components/fieldviewer/colormap'
import styles from './FieldViewerPage.module.css'

type ColorMode = 'value' | 'loop' | 'deltaT'
type SortKey = 'delta_t' | 'voxels' | 'peak_time'

const AXES = ['X', 'Y', 'Z'] as const
const NO_ISO = 1e30

function fmt(n: number, d = 2) { return Number.isFinite(n) ? n.toFixed(d) : '—' }

export function FieldViewerPage() {
  // ── データ ───────────────────────────────
  const [info, setInfo] = useState<FieldInfo | null>(null)
  const [raw, setRaw] = useState<Float32Array | null>(null)
  const [files, setFiles] = useState<FieldFile[]>([])
  const [pitchOverride, setPitchOverride] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  // ── 解析条件 ─────────────────────────────
  const [nbMode, setNbMode] = useState<'preset' | 'custom'>('preset')
  const [connectivity, setConnectivity] = useState<6 | 18 | 26>(6)
  const [radius, setRadius] = useState(1)
  const [customRadius, setCustomRadius] = useState(1)
  const [customOffsets, setCustomOffsets] = useState<Offset[]>(presetOffsets(6, 1))
  const [minDeltaT, setMinDeltaT] = useState(0)
  const [minVoxels, setMinVoxels] = useState(1)
  const [result, setResult] = useState<AnalyzeResult | null>(null)
  const [labels, setLabels] = useState<Int32Array | null>(null)

  // ── 表示 ─────────────────────────────────
  const [colorMode, setColorMode] = useState<ColorMode>('value')
  const [contextAlpha, setContextAlpha] = useState(1)
  const [hideContext, setHideContext] = useState(false)
  const [clip, setClip] = useState<[number, number][]>([[0, 1], [0, 1], [0, 1]])
  const [valueMinRatio, setValueMinRatio] = useState(0)
  const [sizeScale, setSizeScale] = useState(1)
  const [playTime, setPlayTime] = useState<number | null>(null)
  const [playing, setPlaying] = useState(false)
  const [selected, setSelected] = useState(0)
  const [focus, setFocus] = useState<{ center: number[]; size: number; seq: number } | null>(null)
  const [picked, setPicked] = useState<number | null>(null)
  const [sortKey, setSortKey] = useState<SortKey>('delta_t')

  useEffect(() => { api.fields.files().then(setFiles).catch(() => {}) }, [])

  const offsetsInUse: Offset[] = nbMode === 'preset' ? presetOffsets(connectivity, radius) : customOffsets

  // ── 読み込み ─────────────────────────────
  async function loadWith(label: string, fn: () => Promise<FieldInfo>) {
    setBusy(label)
    setError(null)
    try {
      const fi = await fn()
      const pts = await api.fields.points(fi.id)
      setInfo(fi)
      setRaw(pts)
      setResult(null)
      setLabels(null)
      setSelected(0)
      setPicked(null)
      setPlayTime(null)
      setClip([[0, 1], [0, 1], [0, 1]])
      setValueMinRatio(0)
      setColorMode('value')
      // ノイズ由来の小さな山を拾わないよう、最小Δt の初期値は値の範囲の 2%
      const dt0 = Number(((fi.value_max - fi.value_min) * 0.02).toPrecision(2))
      setMinDeltaT(dt0)
      await runAnalysis(fi, dt0)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(null)
    }
  }

  const pitchArg = () => (pitchOverride ? Number(pitchOverride) : undefined)

  async function runAnalysis(fi = info, minDt = minDeltaT) {
    if (!fi) return
    setBusy('閉ループ解析中…')
    setError(null)
    try {
      const r = await api.fields.analyze(fi.id, {
        connectivity,
        radius,
        custom_offsets: nbMode === 'custom' ? customOffsets : null,
        min_delta_t: minDt,
        min_voxels: minVoxels,
      })
      const bin = Uint8Array.from(atob(r.labels_b64), (c) => c.charCodeAt(0))
      setLabels(new Int32Array(bin.buffer))
      setResult(r)
      setSelected(0)
      if (r.loops.length) {
        // 閉ループは内部にあることが多いので、周囲を薄くして透かす
        setColorMode((m) => (m === 'value' ? 'loop' : m))
        setContextAlpha((a) => (a >= 0.99 ? 0.12 : a))
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(null)
    }
  }

  // ── 描画用データ ─────────────────────────
  const center = useMemo(
    () => (info ? info.bounds_min.map((v, i) => (v + info.bounds_max[i]) / 2) : [0, 0, 0]),
    [info],
  )

  const base = useMemo(() => {
    if (!raw || !info) return null
    const n = raw.length / 4
    const pos = new Float32Array(n * 3)
    const value = new Float32Array(n)
    for (let i = 0; i < n; i++) {
      pos[i * 3] = raw[i * 4] - center[0]
      pos[i * 3 + 1] = raw[i * 4 + 1] - center[1]
      pos[i * 3 + 2] = raw[i * 4 + 2] - center[2]
      value[i] = raw[i * 4 + 3]
    }
    const ext = info.bounds_max.map((v, i) => v - info.bounds_min[i])
    return { n, pos, value, radius: Math.max(10, Math.hypot(ext[0], ext[1], ext[2]) / 2) }
  }, [raw, info, center])

  const loopById = useMemo(() => {
    const m = new Map<number, ClosedLoop>()
    result?.loops.forEach((l) => m.set(l.id, l))
    return m
  }, [result])

  const labelAttr = useMemo(() => {
    if (!base) return null
    const label = new Float32Array(base.n)
    const iso = new Float32Array(base.n).fill(NO_ISO)
    if (labels && labels.length === base.n) {
      for (let i = 0; i < base.n; i++) {
        const l = labels[i]
        if (l > 0) { label[i] = l; iso[i] = loopById.get(l)?.isolation_time ?? NO_ISO }
      }
    }
    return { label, iso }
  }, [base, labels, loopById])

  const maxDt = useMemo(() => Math.max(1e-9, ...(result?.loops.map((l) => l.delta_t) ?? [0])), [result])

  const color = useMemo(() => {
    if (!base || !info || !labelAttr) return null
    const c = new Float32Array(base.n * 3)
    const span = info.value_max - info.value_min || 1
    const grey: [number, number, number] = [0.62, 0.65, 0.7]
    const catCache = new Map<number, [number, number, number]>()
    for (let i = 0; i < base.n; i++) {
      const l = labelAttr.label[i]
      let rgb: [number, number, number]
      if (colorMode === 'value') rgb = turbo((base.value[i] - info.value_min) / span)
      else if (l < 0.5) rgb = grey
      else if (colorMode === 'loop') {
        if (!catCache.has(l)) catCache.set(l, categorical(l))
        rgb = catCache.get(l)!
      } else rgb = turbo((loopById.get(l)?.delta_t ?? 0) / maxDt)
      c[i * 3] = rgb[0]; c[i * 3 + 1] = rgb[1]; c[i * 3 + 2] = rgb[2]
    }
    return c
  }, [base, info, labelAttr, colorMode, loopById, maxDt])

  const cloud: CloudData | null = useMemo(() => {
    if (!base || !labelAttr || !color || !info) return null
    return {
      pos: base.pos, value: base.value, label: labelAttr.label, iso: labelAttr.iso, color,
      pitch: Math.min(...info.pitch), radius: base.radius,
    }
  }, [base, labelAttr, color, info])

  const uniforms: ViewUniforms = useMemo(() => {
    const lo = info ? info.bounds_min.map((v, i) => v - center[i]) : [0, 0, 0]
    const hi = info ? info.bounds_max.map((v, i) => v - center[i]) : [0, 0, 0]
    const eps = (info ? Math.max(...info.pitch) : 1) * 0.01
    const cmin = [0, 1, 2].map((k) => lo[k] + (hi[k] - lo[k]) * clip[k][0] - eps) as [number, number, number]
    const cmax = [0, 1, 2].map((k) => lo[k] + (hi[k] - lo[k]) * clip[k][1] + eps) as [number, number, number]
    const vmin = info && valueMinRatio > 0
      ? info.value_min + (info.value_max - info.value_min) * valueMinRatio : -1e30
    return {
      clipMin: cmin, clipMax: cmax, valueMin: vmin, selected, contextAlpha,
      hideContext, playTime, sizeScale,
    }
  }, [info, center, clip, valueMinRatio, selected, contextAlpha, hideContext, playTime, sizeScale])

  // ── 凝固進行の再生 ───────────────────────
  useEffect(() => {
    if (!playing || !info) return
    let raf = 0
    let last = performance.now()
    const span = info.value_max - info.value_min
    const tick = (now: number) => {
      const dt = (now - last) / 1000
      last = now
      setPlayTime((t) => {
        const next = (t ?? info.value_min) + (span / 15) * dt // 全体を約15秒で再生
        if (next >= info.value_max) { setPlaying(false); return info.value_max }
        return next
      })
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [playing, info])

  const liquidStats = useMemo(() => {
    if (playTime == null || !base || !labelAttr) return null
    let liquid = 0, isolated = 0
    const loops = new Set<number>()
    for (let i = 0; i < base.n; i++) {
      if (base.value[i] > playTime) {
        liquid++
        if (playTime >= labelAttr.iso[i]) { isolated++; loops.add(labelAttr.label[i]) }
      }
    }
    return { liquid, isolated, loops: loops.size }
  }, [playTime, base, labelAttr])

  // ── 閉ループ一覧 ─────────────────────────
  const sortedLoops = useMemo(
    () => [...(result?.loops ?? [])].sort((a, b) => b[sortKey] - a[sortKey]),
    [result, sortKey],
  )

  function selectLoop(l: ClosedLoop) {
    if (selected === l.id) { setSelected(0); return }
    setSelected(l.id)
    const size = Math.max(...l.bbox_max.map((v, i) => v - l.bbox_min[i]))
    setFocus({ center: l.centroid.map((v, i) => v - center[i]), size, seq: Date.now() })
  }

  function resetView() {
    setSelected(0)
    setFocus({ center: [0, 0, 0], size: base ? base.radius * 0.9 : 50, seq: Date.now() })
  }

  const pickedInfo = picked != null && base && raw
    ? {
        xyz: [raw[picked * 4], raw[picked * 4 + 1], raw[picked * 4 + 2]],
        value: raw[picked * 4 + 3],
        loop: labelAttr ? labelAttr.label[picked] : 0,
      }
    : null

  // ── 画面 ─────────────────────────────────
  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>フィールド可視化（閉ループ解析）</h1>
          <p className={styles.subtitle}>
            サロゲート予測の凝固時間点群から、周囲より先に固まった部分に囲まれて孤立する液相（閉ループ＝引け巣リスク部）を検出します
          </p>
        </div>
      </div>

      {error && (
        <div className={styles.errorBanner}>
          <span>{error}</span>
          <button onClick={() => setError(null)}>閉じる</button>
        </div>
      )}

      <div className={styles.content}>
        {/* ── 左: 入力と条件 ── */}
        <aside className={`${styles.side} ${styles.left}`}>
          <section className={styles.card}>
            <h2 className={styles.cardTitle}>1. データ読み込み</h2>
            <p className={styles.hint}>CSV: x, y, z, 値（凝固時間）。ヘッダ有無・区切りは自動判定</p>
            <div
              className={styles.drop}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault()
                const f = e.dataTransfer.files[0]
                if (f) loadWith('アップロード中…', () => api.fields.upload(f, pitchArg()))
              }}
              onClick={() => fileInput.current?.click()}
            >
              CSV をドロップ / クリックで選択
              <input
                ref={fileInput} type="file" accept=".csv,.txt" hidden
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) loadWith('アップロード中…', () => api.fields.upload(f, pitchArg()))
                  e.target.value = ''
                }}
              />
            </div>
            {files.length > 0 && (
              <select
                className={styles.input} value=""
                onChange={(e) => e.target.value && loadWith('読み込み中…', () => api.fields.load(e.target.value, pitchArg()))}
              >
                <option value="">data/ 配下の CSV から選ぶ…</option>
                {files.map((f) => (
                  <option key={f.path} value={f.path}>{f.path}（{(f.size / 1024).toFixed(0)} KB）</option>
                ))}
              </select>
            )}
            <div className={styles.row}>
              <label className={styles.label}>ボクセルピッチ</label>
              <input
                className={styles.inputSm} placeholder="自動" value={pitchOverride}
                onChange={(e) => setPitchOverride(e.target.value.replace(/[^0-9.]/g, ''))}
              />
              <span className={styles.unit}>mm</span>
            </div>
            <button className={styles.secondaryBtn} onClick={() => loadWith('デモ生成中…', api.fields.demo)}>
              デモデータで試す
            </button>
            {info && (
              <dl className={styles.meta}>
                <dt>ファイル</dt><dd title={info.name}>{info.name}</dd>
                <dt>点数</dt><dd>{info.points.toLocaleString()}</dd>
                <dt>ピッチ</dt><dd>{info.pitch.map((p) => fmt(p, 2)).join(' × ')} mm</dd>
                <dt>グリッド</dt><dd>{info.shape.join(' × ')}</dd>
                <dt>値の範囲</dt><dd>{fmt(info.value_min, 3)} 〜 {fmt(info.value_max, 3)}</dd>
              </dl>
            )}
          </section>

          <section className={styles.card}>
            <h2 className={styles.cardTitle}>2. 探索範囲（近傍）</h2>
            <div className={styles.seg}>
              <button className={nbMode === 'preset' ? styles.segOn : ''} onClick={() => setNbMode('preset')}>標準</button>
              <button className={nbMode === 'custom' ? styles.segOn : ''} onClick={() => setNbMode('custom')}>カスタム</button>
            </div>
            {nbMode === 'preset' ? (
              <>
                <div className={styles.row}>
                  <label className={styles.label}>近傍</label>
                  <select className={styles.inputSm} value={connectivity}
                    onChange={(e) => setConnectivity(Number(e.target.value) as 6 | 18 | 26)}>
                    <option value={6}>6近傍（面）</option>
                    <option value={18}>18近傍（面+辺）</option>
                    <option value={26}>26近傍（面+辺+角）</option>
                  </select>
                </div>
                <div className={styles.row}>
                  <label className={styles.label}>半径</label>
                  <input type="range" min={1} max={4} value={radius}
                    onChange={(e) => setRadius(Number(e.target.value))} />
                  <span className={styles.unit}>{radius} vox</span>
                </div>
              </>
            ) : (
              <>
                <div className={styles.row}>
                  <label className={styles.label}>編集範囲</label>
                  <select className={styles.inputSm} value={customRadius}
                    onChange={(e) => setCustomRadius(Number(e.target.value))}>
                    {[1, 2, 3].map((r) => <option key={r} value={r}>±{r}</option>)}
                  </select>
                  <button className={styles.linkBtn} onClick={() => setCustomOffsets(presetOffsets(connectivity, radius))}>
                    標準から複製
                  </button>
                  <button className={styles.linkBtn} onClick={() => setCustomOffsets([])}>クリア</button>
                </div>
                <NeighborhoodEditor radius={customRadius} offsets={customOffsets} onChange={setCustomOffsets} />
                <p className={styles.hint}>
                  黒＝注目ボクセル。マスをクリックで追加/削除（反対側も同時に切替）。例: Z 方向だけ ±2 まで見る等
                </p>
              </>
            )}
            <p className={styles.hint}>
              探索するオフセット: <b>{offsetsInUse.length}</b> 個（{info ? `≒ ${fmt(Math.max(...offsetsInUse.map((o) => Math.hypot(...o)), 0) * Math.min(...info.pitch), 1)} mm 先まで` : ''}）
            </p>
          </section>

          <section className={styles.card}>
            <h2 className={styles.cardTitle}>3. 閉ループの判定条件</h2>
            <div className={styles.row}>
              <label className={styles.label} title="孤立してから固まり切るまでの時間（ピーク − 孤立時刻）">最小 Δt</label>
              <input className={styles.inputSm} type="number" min={0} step={0.1} value={minDeltaT}
                onChange={(e) => setMinDeltaT(Number(e.target.value))} />
            </div>
            <div className={styles.row}>
              <label className={styles.label}>最小体積</label>
              <input className={styles.inputSm} type="number" min={1} step={1} value={minVoxels}
                onChange={(e) => setMinVoxels(Math.max(1, Number(e.target.value)))} />
              <span className={styles.unit}>vox</span>
            </div>
            <p className={styles.hint}>ノイズによる小さな山を除くには最小 Δt を上げてください</p>
            <button className={styles.primaryBtn} disabled={!info || !!busy || offsetsInUse.length === 0}
              onClick={() => runAnalysis()}>
              閉ループ解析を実行
            </button>
            {result && (
              <p className={styles.hint}>
                {result.loops.length} 個検出（候補 {result.candidates}）・{result.elapsed_sec} 秒
              </p>
            )}
          </section>
        </aside>

        {/* ── 中央: 3D ── */}
        <div className={`${styles.viewer} ${styles.viewerArea}`}>
          <PointCloudView data={cloud} uniforms={uniforms} focus={focus} onPick={setPicked} />
          {!info && !busy && (
            <div className={styles.placeholder}>CSV を読み込むか「デモデータで試す」を押してください</div>
          )}
          {busy && <div className={styles.busy}>{busy}</div>}

          {info && (
            <div className={styles.overlayTop}>
              <div className={styles.seg}>
                {([['value', '凝固時間'], ['loop', '閉ループ別'], ['deltaT', 'Δt（危険度）']] as const).map(([m, l]) => (
                  <button key={m} className={colorMode === m ? styles.segOn : ''} onClick={() => setColorMode(m)}
                    disabled={m !== 'value' && !result?.loops.length}>{l}</button>
                ))}
              </div>
              <button className={styles.ghostBtn} onClick={resetView}>全体表示</button>
            </div>
          )}

          {info && (
            <div className={styles.legend}>
              {playTime != null ? (
                <div className={styles.playLegend}>
                  <span><i style={{ background: '#338cf2' }} />液相（つながっている）</span>
                  <span><i style={{ background: '#eb2929' }} />孤立した液相（閉ループ）</span>
                  <span><i style={{ background: '#9ea6b3' }} />凝固済み</span>
                </div>
              ) : colorMode === 'loop' ? (
                <span className={styles.legendText}>色 = 閉ループ番号 ／ 灰 = 閉ループ外</span>
              ) : (
                <>
                  <span>{colorMode === 'value' ? fmt(info.value_min) : '0'}</span>
                  <div className={styles.colorbar} style={{ background: TURBO_GRADIENT }} />
                  <span>{colorMode === 'value' ? fmt(info.value_max) : fmt(maxDt)}</span>
                  <span className={styles.legendText}>{colorMode === 'value' ? '凝固時間' : 'Δt'}</span>
                </>
              )}
            </div>
          )}

          {info && (
            <div className={styles.playBar}>
              <button className={styles.playBtn} onClick={() => {
                if (playing) { setPlaying(false); return }
                if (playTime == null || playTime >= info.value_max) setPlayTime(info.value_min)
                setPlaying(true)
              }}>{playing ? '❚❚' : '▶'}</button>
              <span className={styles.playLabel}>凝固進行</span>
              <input type="range" className={styles.playSlider} min={info.value_min} max={info.value_max}
                step={(info.value_max - info.value_min) / 1000} value={playTime ?? info.value_min}
                onChange={(e) => { setPlaying(false); setPlayTime(Number(e.target.value)) }} />
              <span className={styles.playTime}>
                {playTime != null ? `t = ${fmt(playTime)}` : '—'}
                {liquidStats && ` ／ 液相 ${liquidStats.liquid.toLocaleString()} ・ 孤立 ${liquidStats.isolated.toLocaleString()} vox（${liquidStats.loops} 箇所）`}
              </span>
              {playTime != null && (
                <button className={styles.ghostBtn} onClick={() => { setPlaying(false); setPlayTime(null) }}>終了</button>
              )}
            </div>
          )}

          {pickedInfo && (
            <div className={styles.pickInfo}>
              <div>({pickedInfo.xyz.map((v) => fmt(v, 1)).join(', ')}) mm</div>
              <div>値 <b>{fmt(pickedInfo.value, 3)}</b>{pickedInfo.loop > 0 && <> ／ 閉ループ <b>#{pickedInfo.loop}</b></>}</div>
              <button onClick={() => setPicked(null)}>×</button>
            </div>
          )}
        </div>

        {/* ── 右: 表示条件と結果 ── */}
        <aside className={`${styles.side} ${styles.right}`}>
          <section className={styles.card}>
            <h2 className={styles.cardTitle}>表示</h2>
            <div className={styles.row}>
              <label className={styles.label}>点サイズ</label>
              <input type="range" min={0.3} max={2} step={0.05} value={sizeScale}
                onChange={(e) => setSizeScale(Number(e.target.value))} />
            </div>
            <div className={styles.row}>
              <label className={styles.label}>周囲の濃さ</label>
              <input type="range" min={0} max={1} step={0.05} value={contextAlpha}
                onChange={(e) => setContextAlpha(Number(e.target.value))} />
            </div>
            <label className={styles.check}>
              <input type="checkbox" checked={hideContext} onChange={(e) => setHideContext(e.target.checked)} />
              閉ループ（再生中は液相）だけ表示
            </label>
            <div className={styles.row}>
              <label className={styles.label}>値の下限</label>
              <input type="range" min={0} max={0.99} step={0.01} value={valueMinRatio}
                onChange={(e) => setValueMinRatio(Number(e.target.value))} />
              <span className={styles.unit}>
                {info && valueMinRatio > 0 ? fmt(info.value_min + (info.value_max - info.value_min) * valueMinRatio, 1) : '—'}
              </span>
            </div>
            <div className={styles.subTitle}>断面（範囲を絞ると内部が見えます）</div>
            {AXES.map((ax, k) => (
              <div key={ax} className={styles.clipRow}>
                <span className={styles.axis}>{ax}</span>
                <input type="range" min={0} max={1} step={0.005} value={clip[k][0]}
                  onChange={(e) => setClip((c) => c.map((r, j) => j === k ? [Math.min(Number(e.target.value), r[1]), r[1]] : r))} />
                <input type="range" min={0} max={1} step={0.005} value={clip[k][1]}
                  onChange={(e) => setClip((c) => c.map((r, j) => j === k ? [r[0], Math.max(Number(e.target.value), r[0])] : r))} />
              </div>
            ))}
            <button className={styles.linkBtn} onClick={() => setClip([[0, 1], [0, 1], [0, 1]])}>断面をリセット</button>
          </section>

          <section className={`${styles.card} ${styles.loopCard}`}>
            <div className={styles.loopHead}>
              <h2 className={styles.cardTitle}>閉ループ一覧 {result && `(${result.loops.length})`}</h2>
              {info && result && (
                <a className={styles.linkBtn} href={api.fields.exportUrl(info.id)} download>CSV出力</a>
              )}
            </div>
            {result && result.loops.length > 0 && (
              <div className={styles.row}>
                <label className={styles.label}>並び順</label>
                <select className={styles.inputSm} value={sortKey} onChange={(e) => setSortKey(e.target.value as SortKey)}>
                  <option value="delta_t">Δt が大きい順</option>
                  <option value="voxels">体積が大きい順</option>
                  <option value="peak_time">ピークが遅い順</option>
                </select>
              </div>
            )}
            {!result ? (
              <p className={styles.hint}>解析するとここに結果が出ます</p>
            ) : result.loops.length === 0 ? (
              <p className={styles.hint}>条件に合う閉ループはありません</p>
            ) : (
              <div className={styles.loopList}>
                {sortedLoops.map((l) => (
                  <button key={l.id} className={`${styles.loopItem} ${selected === l.id ? styles.loopSel : ''}`}
                    onClick={() => selectLoop(l)}>
                    <span className={styles.swatch} style={{ background: cssRgb(categorical(l.id)) }} />
                    <span className={styles.loopId}>#{l.id}</span>
                    <span className={styles.loopMain}>
                      <span>Δt <b>{fmt(l.delta_t)}</b>（{fmt(l.isolation_time)} → {fmt(l.peak_time)}）</span>
                      <span className={styles.loopSub}>
                        {l.voxels.toLocaleString()} vox ・ {fmt(l.volume_mm3 / 1000, 2)} cm³ ・ 重心 ({l.centroid.map((v) => fmt(v, 0)).join(', ')})
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            )}
            {result && result.final_regions.length > 0 && (
              <p className={styles.hint}>
                最終凝固部（閉ループ扱いしない）: {result.final_regions.map((f) =>
                  `t=${fmt(f.peak_time)} @(${f.peak_xyz.map((v) => fmt(v, 0)).join(', ')})`).join(' / ')}
              </p>
            )}
          </section>
        </aside>
      </div>
    </div>
  )
}
