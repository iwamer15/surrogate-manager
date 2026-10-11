import styles from './NeighborhoodEditor.module.css'

export type Offset = [number, number, number]

/** 6 / 18 / 26 近傍 × 半径 のオフセット（バックエンドと同じ定義） */
export function presetOffsets(connectivity: 6 | 18 | 26, radius: number): Offset[] {
  const out: Offset[] = []
  for (let dx = -radius; dx <= radius; dx++)
    for (let dy = -radius; dy <= radius; dy++)
      for (let dz = -radius; dz <= radius; dz++) {
        const a = [Math.abs(dx), Math.abs(dy), Math.abs(dz)]
        const sum = a[0] + a[1] + a[2]
        const max = Math.max(...a)
        if (sum === 0) continue
        const ok = connectivity === 6 ? sum <= radius
          : connectivity === 18 ? max <= radius && sum <= 2 * radius
          : max <= radius
        if (ok) out.push([dx, dy, dz])
      }
  return out
}

const key = (o: Offset) => o.join(',')

interface Props {
  radius: number
  offsets: Offset[]
  onChange: (offsets: Offset[]) => void
}

/** Z 層ごとの格子をクリックしてオフセットを編集する。点対称の相手も同時に切り替える。 */
export function NeighborhoodEditor({ radius, offsets, onChange }: Props) {
  const set = new Set(offsets.map(key))
  const range = Array.from({ length: radius * 2 + 1 }, (_, i) => i - radius)

  function toggle(o: Offset) {
    const mirror: Offset = [-o[0], -o[1], -o[2]]
    const next = new Set(set)
    if (next.has(key(o))) { next.delete(key(o)); next.delete(key(mirror)) }
    else { next.add(key(o)); next.add(key(mirror)) }
    onChange([...next].map((s) => s.split(',').map(Number) as Offset))
  }

  return (
    <div className={styles.wrap}>
      {range.slice().reverse().map((dz) => (
        <div key={dz} className={styles.layer}>
          <div className={styles.layerLabel}>dz={dz > 0 ? `+${dz}` : dz}</div>
          <div className={styles.grid} style={{ gridTemplateColumns: `repeat(${range.length}, 1fr)` }}>
            {range.slice().reverse().map((dy) =>
              range.map((dx) => {
                const o: Offset = [dx, dy, dz]
                const center = dx === 0 && dy === 0 && dz === 0
                const on = set.has(key(o))
                return (
                  <button
                    key={`${dx},${dy}`}
                    type="button"
                    disabled={center}
                    className={`${styles.cell} ${on ? styles.on : ''} ${center ? styles.center : ''}`}
                    title={`(${dx}, ${dy}, ${dz})`}
                    onClick={() => toggle(o)}
                  />
                )
              }),
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
