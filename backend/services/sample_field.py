"""動作確認用の疑似凝固時間フィールド（2mm ボクセル）を生成する。

形状: 薄い板(ベース) + 厚肉ボス2個 + 押湯(円柱)。
凝固時間 ≒ k × (表面からの距離)^2（Chvorinov 則の簡易版）。
薄肉部で押湯とつながったボスは先に周囲が固まり、閉ループ（孤立液相）になる。

python -m services.sample_field ../data/samples/field_demo.csv
"""

from __future__ import annotations

import sys

import numpy as np


def make_field(pitch: float = 2.0, seed: int = 0) -> np.ndarray:
    nx, ny, nz = 60, 30, 30  # 120 x 60 x 60 mm
    i, j, k = np.meshgrid(np.arange(nx), np.arange(ny), np.arange(nz), indexing="ij")
    x, y, z = (i + 0.5) * pitch, (j + 0.5) * pitch, (k + 0.5) * pitch

    solid = (z < 10) & (y >= 4) & (y < 56) & (x >= 4) & (x < 116)          # 板 厚10mm
    solid |= ((x - 30) ** 2 + (y - 30) ** 2 < 15 ** 2) & (z < 34)          # ボス1
    solid |= (np.abs(x - 62) < 9) & (np.abs(y - 30) < 12) & (z < 26)       # ボス2（角）
    solid |= ((x - 98) ** 2 + (y - 30) ** 2 < 14 ** 2) & (z < 58)          # 押湯

    # 6近傍の繰り返し侵食で表面からの距離を求める
    dist = np.zeros(solid.shape, dtype=np.float64)
    cur = solid.copy()
    step = 0
    while cur.any():
        step += 1
        dist[cur] = step
        e = cur.copy()
        e[1:] &= cur[:-1]; e[:-1] &= cur[1:]
        e[:, 1:] &= cur[:, :-1]; e[:, :-1] &= cur[:, 1:]
        e[:, :, 1:] &= cur[:, :, :-1]; e[:, :, :-1] &= cur[:, :, 1:]
        e[0] = e[-1] = False; e[:, 0] = e[:, -1] = False; e[:, :, 0] = e[:, :, -1] = False
        cur = e

    rng = np.random.default_rng(seed)
    # 押湯は保温スリーブ想定で遅く固まる
    riser = ((x - 98) ** 2 + (y - 30) ** 2 < 14 ** 2) & (z >= 10)
    t = 0.6 * (dist * pitch / 2) ** 2 + rng.normal(0, 0.05, dist.shape)
    t[riser] *= 1.6
    t = np.clip(t, 0.05, None)

    pts = np.stack([x[solid], y[solid], z[solid], t[solid].round(4)], axis=1)
    return pts


def main() -> None:
    out = sys.argv[1] if len(sys.argv) > 1 else "field_demo.csv"
    pts = make_field()
    np.savetxt(out, pts, delimiter=",", header="x,y,z,solidification_time", comments="",
               fmt=["%.1f", "%.1f", "%.1f", "%.4f"])
    print(f"{out}: {len(pts)} 点")


if __name__ == "__main__":
    main()
