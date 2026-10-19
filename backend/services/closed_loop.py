"""凝固時間フィールド（ボクセル点群）の閉ループ（孤立液相）解析。

考え方
------
凝固時間 T(v) を持つボクセル群に対し、ある時刻 t でまだ液体のボクセルは T(v) > t。
t を大きい側から小さい側へ下げていくと液相領域が広がり、近傍でつながった液相の
「島」が合流していく。逆向き（実際の凝固の進行方向）に見ると、液相が分断され
周囲を固相に囲まれた液溜まり＝閉ループ（引け巣リスク部）が生まれる。

実装は max-tree（Union-Find で凝固時間の降順にボクセルを追加）で、
島が他の島に吸収される瞬間を記録する（elder rule: ピークが低い方が吸収される）。

- peak_time     … その閉ループ内の最大凝固時間（最終凝固点）
- isolation_time… 閉ループが周囲から孤立する時刻（＝合流時の凝固時間）
- delta_t       … peak_time - isolation_time（孤立していた時間。大きいほど危険）
- 領域          … 孤立した瞬間の液相ボクセル（T > isolation_time かつ近傍で連結）

最後まで吸収されない島（全体の最大点を含む）は「最終凝固部」（押湯など）として
別扱いにする。

近傍（探索範囲）は 6 / 18 / 26 近傍 × 半径、または任意のオフセット列で指定できる。
"""

from __future__ import annotations

import argparse
import csv
import io
import json
from dataclasses import dataclass, field, asdict

import numpy as np


# ---------------------------------------------------------------------------
# 近傍定義
# ---------------------------------------------------------------------------

@dataclass
class NeighborhoodSpec:
    """探索範囲の指定。

    connectivity: 6（面）/ 18（面+辺）/ 26（面+辺+頂点）
    radius:       探索半径（ボクセル数）。1 で通常の 6/18/26 近傍
    custom:       [[dx,dy,dz], ...] を与えるとこちらを優先（対称化して使う）
    """

    connectivity: int = 6
    radius: int = 1
    custom: list[list[int]] | None = None

    def offsets(self) -> np.ndarray:
        if self.custom:
            offs = {tuple(int(c) for c in o) for o in self.custom}
            offs |= {(-a, -b, -c) for a, b, c in offs}  # 連結性は対称でないと定義できない
            offs.discard((0, 0, 0))
            if not offs:
                raise ValueError("custom オフセットが空です")
            return np.array(sorted(offs), dtype=np.int64)

        if self.connectivity not in (6, 18, 26):
            raise ValueError("connectivity は 6 / 18 / 26 のいずれか")
        r = max(1, int(self.radius))
        rng = np.arange(-r, r + 1)
        d = np.stack(np.meshgrid(rng, rng, rng, indexing="ij"), axis=-1).reshape(-1, 3)
        a = np.abs(d)
        if self.connectivity == 6:
            keep = a.sum(axis=1) <= r  # マンハッタン距離
        elif self.connectivity == 18:
            # 18 近傍を r 倍に拡張: チェビシェフ距離 ≤ r かつ マンハッタン距離 ≤ 2r
            keep = (a.max(axis=1) <= r) & (a.sum(axis=1) <= 2 * r)
        else:
            keep = a.max(axis=1) <= r  # チェビシェフ距離
        d = d[keep & (a.sum(axis=1) > 0)]
        return d.astype(np.int64)


# ---------------------------------------------------------------------------
# 入力
# ---------------------------------------------------------------------------

@dataclass
class VoxelField:
    xyz: np.ndarray        # (N,3) float 実座標 [mm]
    value: np.ndarray      # (N,) float 凝固時間
    ijk: np.ndarray        # (N,3) int グリッド番号
    origin: np.ndarray     # (3,) グリッド原点
    pitch: np.ndarray      # (3,) ボクセルピッチ
    shape: tuple[int, int, int]
    columns: list[str] = field(default_factory=list)


def _detect_pitch(coord: np.ndarray) -> float | None:
    u = np.unique(np.round(coord, 6))
    diffs = np.diff(u)
    diffs = diffs[diffs > 1e-9]
    return float(diffs.min()) if len(diffs) else None


def read_csv_text(text: str) -> tuple[np.ndarray, list[str]]:
    """x,y,z,値 の CSV を読む。ヘッダ有無・区切り（, / タブ / 空白）は自動判定。"""
    lines = [ln for ln in text.splitlines() if ln.strip() and not ln.lstrip().startswith("#")]
    if not lines:
        raise ValueError("CSV が空です")
    first = lines[0]
    delim = "," if "," in first else ("\t" if "\t" in first else None)

    def split(ln: str) -> list[str]:
        return [c.strip() for c in (ln.split(delim) if delim else ln.split())]

    head = split(first)
    try:
        [float(c) for c in head[:4]]
        columns = ["x", "y", "z", "value"]
        body = lines
    except ValueError:
        columns = head
        body = lines[1:]
    data = np.loadtxt(io.StringIO("\n".join(body)), delimiter=delim, ndmin=2)
    if data.shape[1] < 4:
        raise ValueError("列が足りません（x, y, z, 値 の4列以上が必要）")
    return data, columns


def build_field(data: np.ndarray, pitch: float | None = None, value_col: int = 3,
                columns: list[str] | None = None) -> VoxelField:
    xyz = data[:, :3].astype(np.float64)
    val = data[:, value_col].astype(np.float64)
    ok = np.isfinite(val) & np.all(np.isfinite(xyz), axis=1)
    xyz, val = xyz[ok], val[ok]
    if len(val) == 0:
        raise ValueError("有効な点がありません")

    if pitch and pitch > 0:
        p = np.array([pitch] * 3, dtype=np.float64)
    else:
        found = [_detect_pitch(xyz[:, i]) for i in range(3)]
        # 1層しかない軸は他の軸のピッチを使う
        known = [v for v in found if v is not None]
        fallback = min(known) if known else 1.0
        p = np.array([v if v is not None else fallback for v in found])
    origin = xyz.min(axis=0)
    ijk = np.rint((xyz - origin) / p).astype(np.int64)
    shape = tuple(int(s) for s in ijk.max(axis=0) + 1)

    # 同一ボクセルに複数点があれば最大値を残す
    flat = np.ravel_multi_index(ijk.T, shape)
    order = np.lexsort((-val, flat))
    flat_sorted = flat[order]
    first = np.ones(len(order), dtype=bool)
    first[1:] = flat_sorted[1:] != flat_sorted[:-1]
    keep = order[first]
    return VoxelField(xyz=xyz[keep], value=val[keep], ijk=ijk[keep], origin=origin,
                      pitch=p, shape=shape, columns=columns or [])


# ---------------------------------------------------------------------------
# 解析
# ---------------------------------------------------------------------------

@dataclass
class AnalysisParams:
    connectivity: int = 6
    radius: int = 1
    custom_offsets: list[list[int]] | None = None
    min_delta_t: float = 0.0       # これ未満の孤立時間の閉ループは無視（ノイズ除去）
    min_voxels: int = 1            # これ未満の体積の閉ループは無視
    max_loops: int = 500


@dataclass
class Loop:
    id: int
    peak_time: float
    isolation_time: float
    delta_t: float
    voxels: int
    volume_mm3: float
    centroid: list[float]
    peak_xyz: list[float]
    bbox_min: list[float]
    bbox_max: list[float]


def neighbor_table(field_: VoxelField, offsets: np.ndarray) -> np.ndarray:
    """各ボクセルの近傍ボクセル番号 (N, K)。存在しなければ -1。"""
    shape = np.array(field_.shape)
    lut = np.full(int(np.prod(shape)), -1, dtype=np.int64)
    flat = np.ravel_multi_index(field_.ijk.T, field_.shape)
    lut[flat] = np.arange(len(flat))
    n = len(flat)
    table = np.full((n, len(offsets)), -1, dtype=np.int64)
    for k, o in enumerate(offsets):
        q = field_.ijk + o
        inside = np.all((q >= 0) & (q < shape), axis=1)
        idx = np.full(n, -1, dtype=np.int64)
        idx[inside] = lut[np.ravel_multi_index(q[inside].T, field_.shape)]
        table[:, k] = idx
    return table


def _find(parent: list[int], a: int) -> int:
    root = a
    while parent[root] != root:
        root = parent[root]
    while parent[a] != root:
        parent[a], a = root, parent[a]
    return root


def detect_closed_loops(field_: VoxelField, params: AnalysisParams) -> dict:
    spec = NeighborhoodSpec(params.connectivity, params.radius, params.custom_offsets)
    offsets = spec.offsets()
    nbr = neighbor_table(field_, offsets)
    val = field_.value
    n = len(val)

    # 凝固時間の降順（同値は番号順で決定的に）
    order = np.lexsort((np.arange(n), -val))
    rank = np.empty(n, dtype=np.int64)
    rank[order] = np.arange(n)

    parent = list(range(n))
    peak = list(range(n))        # 根 → その島の最大点（ボクセル番号）
    active = bytearray(n)
    events: list[tuple[int, int]] = []  # (吸収された島のピーク, 合流を起こしたボクセル)
    nbr_l = nbr.tolist()
    rank_l = rank.tolist()

    for v in order.tolist():
        active[v] = 1
        rv = v
        for u in nbr_l[v]:
            if u < 0 or not active[u]:
                continue
            ru = _find(parent, u)
            rv = _find(parent, rv)
            if ru == rv:
                continue
            # ピークが高い（rank が小さい）方を残す
            pu, pv = peak[ru], peak[rv]
            if rank_l[pu] < rank_l[pv]:
                keep, die = ru, rv
            else:
                keep, die = rv, ru
            # 自分自身（v）がまだ単独の島ならそれは単なる成長で、閉ループではない
            if peak[die] != v:
                events.append((peak[die], v))
            parent[die] = keep
            rv = keep

    final_roots = {_find(parent, i) for i in range(n)}
    final_peaks = sorted((peak[r] for r in final_roots), key=lambda i: rank_l[i])

    cand = []
    for p, m in events:
        dt = float(val[p] - val[m])
        if dt >= params.min_delta_t:
            cand.append((dt, p, m))
    cand.sort(key=lambda c: -c[0])

    labels = np.zeros(n, dtype=np.int32)
    loops: list[Loop] = []
    vol_unit = float(np.prod(field_.pitch))
    regions: list[tuple[int, np.ndarray]] = []
    for dt, p, m in cand:
        if len(loops) >= params.max_loops:
            break
        region = _flood(p, val, float(val[m]), nbr)
        if len(region) < params.min_voxels:
            continue
        pts = field_.xyz[region]
        loops.append(Loop(
            id=len(loops) + 1,
            peak_time=float(val[p]),
            isolation_time=float(val[m]),
            delta_t=dt,
            voxels=int(len(region)),
            volume_mm3=len(region) * vol_unit,
            centroid=pts.mean(axis=0).round(4).tolist(),
            peak_xyz=field_.xyz[p].round(4).tolist(),
            bbox_min=pts.min(axis=0).round(4).tolist(),
            bbox_max=pts.max(axis=0).round(4).tolist(),
        ))
        regions.append((loops[-1].id, region))

    # 入れ子の閉ループは内側（小さい方）を優先して塗る
    for lid, region in sorted(regions, key=lambda r: -len(r[1])):
        labels[region] = lid

    finals = []
    for p in final_peaks:
        finals.append({"peak_time": float(val[p]), "peak_xyz": field_.xyz[p].round(4).tolist()})

    return {
        "loops": [asdict(lp) for lp in loops],
        "labels": labels,
        "final_regions": finals,
        "candidates": len(cand),
        "offsets": offsets.tolist(),
    }


def _flood(seed: int, val: np.ndarray, level: float, nbr: np.ndarray) -> np.ndarray:
    """seed から近傍をたどり、凝固時間 > level のボクセルを集める。"""
    seen = {seed}
    stack = [seed]
    while stack:
        v = stack.pop()
        for u in nbr[v]:
            if u >= 0 and u not in seen and val[u] > level:
                seen.add(int(u))
                stack.append(int(u))
    return np.fromiter(seen, dtype=np.int64, count=len(seen))


def analyze(data: np.ndarray, params: AnalysisParams, pitch: float | None = None,
            columns: list[str] | None = None) -> dict:
    f = build_field(data, pitch=pitch, columns=columns)
    res = detect_closed_loops(f, params)
    return {"field": f, **res}


def result_to_csv(f: VoxelField, labels: np.ndarray) -> str:
    out = io.StringIO()
    w = csv.writer(out, lineterminator="\n")
    w.writerow(["x", "y", "z", "value", "loop_id"])
    for (x, y, z), v, lb in zip(f.xyz.tolist(), f.value.tolist(), labels.tolist()):
        w.writerow([x, y, z, v, lb])
    return out.getvalue()


# ---------------------------------------------------------------------------
# CLI:  python -m services.closed_loop input.csv -o out.csv --connectivity 6
# ---------------------------------------------------------------------------

def main(argv: list[str] | None = None) -> None:
    ap = argparse.ArgumentParser(description="凝固時間ボクセル点群の閉ループ検出")
    ap.add_argument("csv")
    ap.add_argument("-o", "--out", help="loop_id 付き CSV の出力先")
    ap.add_argument("--summary", help="閉ループ一覧 JSON の出力先")
    ap.add_argument("--pitch", type=float, default=None, help="ボクセルピッチ[mm]（省略時は自動判定）")
    ap.add_argument("--connectivity", type=int, default=6, choices=(6, 18, 26))
    ap.add_argument("--radius", type=int, default=1)
    ap.add_argument("--offsets", help='任意の近傍 JSON 例: "[[1,0,0],[0,1,0],[0,0,2]]"')
    ap.add_argument("--min-dt", type=float, default=0.0)
    ap.add_argument("--min-voxels", type=int, default=1)
    a = ap.parse_args(argv)

    raw = open(a.csv, "rb").read()
    try:
        text = raw.decode("utf-8-sig")
    except UnicodeDecodeError:
        text = raw.decode("cp932")  # Windows の Excel で保存した CSV
    data, cols = read_csv_text(text)
    params = AnalysisParams(a.connectivity, a.radius, json.loads(a.offsets) if a.offsets else None,
                            a.min_dt, a.min_voxels)
    r = analyze(data, params, pitch=a.pitch, columns=cols)
    f = r["field"]
    print(f"点数 {len(f.value)} / グリッド {f.shape} / ピッチ {f.pitch.tolist()} / "
          f"近傍 {len(r['offsets'])} 個")
    print(f"閉ループ {len(r['loops'])} 個（候補 {r['candidates']}）")
    for lp in r["loops"][:20]:
        print(f"  #{lp['id']:>3}  Δt={lp['delta_t']:.3f}  peak={lp['peak_time']:.3f}  "
              f"孤立={lp['isolation_time']:.3f}  {lp['voxels']} vox  重心={lp['centroid']}")
    if a.out:
        with open(a.out, "w", encoding="utf-8", newline="") as fh:
            fh.write(result_to_csv(f, r["labels"]))
    if a.summary:
        with open(a.summary, "w", encoding="utf-8") as fh:
            json.dump({"loops": r["loops"], "final_regions": r["final_regions"]}, fh,
                      ensure_ascii=False, indent=2)


if __name__ == "__main__":
    main()
