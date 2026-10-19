/** Turbo カラーマップ（多項式近似）。t: 0..1 → [r,g,b] 0..1 */
export function turbo(t: number): [number, number, number] {
  const x = Math.min(1, Math.max(0, t))
  const r = 0.13572138 + x * (4.6153926 + x * (-42.66032258 + x * (132.13108234 + x * (-152.94239396 + x * 59.28637943))))
  const g = 0.09140261 + x * (2.19418839 + x * (4.84296658 + x * (-14.18503333 + x * (4.27729857 + x * 2.82956604))))
  const b = 0.1066733 + x * (12.64194608 + x * (-60.58204836 + x * (110.36276771 + x * (-89.90310912 + x * 27.34824973))))
  return [clamp(r), clamp(g), clamp(b)]
}

function clamp(v: number) { return Math.min(1, Math.max(0, v)) }

/** 閉ループ番号用の区別しやすい色（黄金角で色相を回す） */
export function categorical(id: number): [number, number, number] {
  const h = (id * 137.508) % 360
  return hsl(h, 0.75, 0.52)
}

function hsl(h: number, s: number, l: number): [number, number, number] {
  const k = (n: number) => (n + h / 30) % 12
  const a = s * Math.min(l, 1 - l)
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))
  return [f(0), f(8), f(4)]
}

export function cssRgb([r, g, b]: [number, number, number]) {
  return `rgb(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)})`
}

export const TURBO_GRADIENT =
  'linear-gradient(to right,' +
  Array.from({ length: 11 }, (_, i) => cssRgb(turbo(i / 10))).join(',') + ')'
