"""データセットの組み立て: 結果 CSV と STL（と鋳造条件）の対応付け。

※ このファイルは ml-process-lab と surrogate-manager で同じものを使っています。
  直すときは両方に同じ変更を入れてください（どちらも外部に依存しない作りにしてある）。

結果 CSV と STL が同じフォルダにあるとは限らないので、対応付けを次の順で決める。

  1. 個別指定 … 画面でサンプルごとに選んだ STL（dataset_overrides.yml。画面が自動で書く）
  2. ルール   … dataset.yml に書いた「どのフォルダの、どの名前の STL か」の決まり
  3. 既定     … CSV と同じフォルダの STL（名前が同じもの → 無ければ最初の 1 つ）

dataset.yml と dataset_overrides.yml は「データセットのフォルダ」（root）の直下に置く。
中に書くパスはすべて root からの相対パス（/ 区切り。Windows でも / で書ける）。

    resolve(root)            … サンプル一覧（CSV・STL・条件・どの方法で決まったか）
    list_stls(root)          … root より下の全 STL（画面の選択肢）
    suggest(sample, stls)    … 名前が似ている STL の候補
    save_overrides(root, …)  … 画面で選んだ STL を保存
    preview(root, text)      … 画面用のまとめ（サンプル一覧＋候補＋全 STL）。text を渡すと保存前のルールで試せる
    read_spec_text / save_spec_text … dataset.yml の読み書き（保存前に書き方を確認する）
    TEMPLATE                 … dataset.yml のひな形（コメント付き）
"""

from __future__ import annotations

import difflib
import fnmatch
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import yaml

SPEC_FILE = "dataset.yml"                    # ルール（人が書く）
OVERRIDES_FILE = "dataset_overrides.yml"     # 個別指定（画面が書く）
MAX_STL_LIST = 5000                          # 画面に出す STL の上限（巨大なフォルダ対策）

# 条件ファイルとみなす名前（結果 CSV から除外する）
_COND_PREFIX = ("condition", "cond", "条件")
# 結果 CSV らしい名前（同じフォルダに CSV が複数あるときの優先）
_RESULT_HINT = re.compile(r"result|結果|field|cae", re.I)


# ---------------------------------------------------------------------------
# 設定（dataset.yml）
# ---------------------------------------------------------------------------

@dataclass
class Spec:
    """dataset.yml の中身。書かれていない項目は既定値（従来どおりの動き）。"""

    results_pattern: str = "**/*.csv"        # 結果 CSV の探し方（glob）
    results_exclude: list[str] = field(default_factory=list)
    name: str = "auto"                       # サンプル名のルール（auto = フォルダ名、同じフォルダに複数ならファイル名）
    regex: str = ""                          # CSV の相対パスから値を取り出す正規表現（名前付きグループ）
    stl_dirs: list[str] = field(default_factory=lambda: ["{dir}"])
    stl_files: list[str] = field(default_factory=lambda: ["{stem}.stl", "*.stl"])
    cond_dirs: list[str] = field(default_factory=lambda: ["{dir}"])
    cond_files: list[str] = field(default_factory=lambda: ["condition*.csv", "cond*.csv", "条件*.csv", "condition*.json"])
    from_file: bool = False                  # dataset.yml があったか
    pattern_given: bool = False              # 結果 CSV の探し方を指定したか（しないときは 1 フォルダ 1 サンプルの自動判定）


def _as_list(v: Any) -> list[str]:
    if v is None:
        return []
    return [str(x) for x in v] if isinstance(v, (list, tuple)) else [str(v)]


def parse_spec(text: str) -> Spec:
    """dataset.yml の文字列を読む。書き方の誤りは ValueError（画面にそのまま出す）。"""
    try:
        d = yaml.safe_load(text) or {}
    except yaml.YAMLError as e:
        raise ValueError(f"dataset.yml の書き方に誤りがあります: {e}") from e
    if not isinstance(d, dict):
        raise ValueError("dataset.yml は「項目: 値」の形で書いてください")
    s = Spec(from_file=True)
    res, stl, cond = d.get("results") or {}, d.get("stl") or {}, d.get("conditions") or {}
    for name, sec in (("results", res), ("stl", stl), ("conditions", cond)):
        if not isinstance(sec, dict):
            raise ValueError(f"{name} は「項目: 値」の形で書いてください")
    if res.get("pattern"):
        s.results_pattern, s.pattern_given = str(res["pattern"]), True
    s.results_exclude = _as_list(res.get("exclude"))
    s.name = str(res.get("name") or "auto")
    s.regex = str(res.get("regex") or "")
    if s.regex:
        try:
            re.compile(s.regex)
        except re.error as e:
            raise ValueError(f"results.regex の正規表現が正しくありません: {e}") from e
    if stl.get("dirs"):
        s.stl_dirs = _as_list(stl["dirs"])
    if stl.get("file"):
        s.stl_files = _as_list(stl["file"])
    if cond.get("dirs"):
        s.cond_dirs = _as_list(cond["dirs"])
    if cond.get("file"):
        s.cond_files = _as_list(cond["file"])
    return s


def load_spec(root: Path) -> Spec:
    p = Path(root) / SPEC_FILE
    return parse_spec(p.read_text("utf-8")) if p.exists() else Spec()


def load_overrides(root: Path) -> dict[str, dict[str, str]]:
    """{"stl": {サンプル名: 相対パス}, "conditions": {...}}"""
    p = Path(root) / OVERRIDES_FILE
    if not p.exists():
        return {"stl": {}, "conditions": {}}
    d = yaml.safe_load(p.read_text("utf-8")) or {}
    return {"stl": dict(d.get("stl") or {}), "conditions": dict(d.get("conditions") or {})}


def save_overrides(root: Path, stl: dict[str, str | None], conditions: dict[str, str | None] | None = None) -> Path:
    """画面で選んだ対応を保存する。値が空（None / ""）のサンプルは指定を外す。"""
    root = Path(root)
    for rel in [*stl.values(), *(conditions or {}).values()]:
        if rel:
            _inside(root, rel)   # root の外を指していないか確認
    cur = load_overrides(root)
    for key, upd in (("stl", stl), ("conditions", conditions or {})):
        for name, rel in upd.items():
            if rel:
                cur[key][name] = Path(rel).as_posix()
            else:
                cur[key].pop(name, None)
    body = yaml.safe_dump(cur, allow_unicode=True, sort_keys=True)
    p = root / OVERRIDES_FILE
    p.write_text("# 画面で個別に選んだ対応（ツールが自動で書き換えます）。サンプル名: root からの相対パス\n" + body, "utf-8")
    return p


# ---------------------------------------------------------------------------
# 対応付け
# ---------------------------------------------------------------------------

@dataclass
class ResolvedSample:
    name: str
    csv: Path
    stl: Path | None = None
    conditions: Path | None = None
    stl_source: str = "missing"          # override / rule / default / missing
    cond_source: str = "missing"
    vars: dict[str, str] = field(default_factory=dict)   # ルールに使える変数（画面のヒント用）

    def to_dict(self, root: Path) -> dict:
        rel = lambda p: None if p is None else _rel(root, p)  # noqa: E731
        return {"name": self.name, "csv": rel(self.csv), "stl": rel(self.stl), "conditions": rel(self.conditions),
                "stl_source": self.stl_source, "cond_source": self.cond_source, "vars": self.vars}


@dataclass
class Resolution:
    root: Path
    samples: list[ResolvedSample]
    warnings: list[str]
    spec: Spec


def _rel(root: Path, p: Path) -> str:
    try:
        return Path(p).resolve().relative_to(Path(root).resolve()).as_posix()
    except ValueError:
        return str(p)


def _inside(root: Path, rel: str) -> Path:
    """root からの相対パスを実際のパスに。root の外（../ など）は拒否する。"""
    p = (Path(root) / rel).resolve()
    if p != Path(root).resolve() and Path(root).resolve() not in p.parents:
        raise ValueError(f"データのフォルダの外は指定できません: {rel}")
    return p


def _hidden(rel: Path) -> bool:
    return any(part.startswith(".") for part in rel.parts)


def _is_cond(p: Path) -> bool:
    return p.stem.lower().startswith(_COND_PREFIX)


class _Vars(dict):
    """テンプレートに無い変数を使ったとき、分かりやすいエラーにする。"""

    def __missing__(self, key):
        raise ValueError(f"ルールの変数 {{{key}}} がありません（使えるもの: {', '.join('{' + k + '}' for k in self)}）")


def _fill(template: str, v: dict[str, str]) -> str:
    return template.format_map(_Vars(v))


def _find(root: Path, dirs: list[str], files: list[str], v: dict[str, str]) -> Path | None:
    """dirs × files のテンプレートを埋めて、最初に見つかったファイルを返す（glob 可）。"""
    for d in dirs:
        base = _inside(root, _fill(d, v) or ".")
        if not base.is_dir():
            continue
        for f in files:
            pat = _fill(f, v)
            if any(ch in pat for ch in "*?["):
                hits = sorted(q for q in base.glob(pat) if q.is_file())
                if hits:
                    return hits[0]
            elif (base / pat).is_file():
                return base / pat
    return None


def _results(root: Path, spec: Spec) -> list[Path]:
    csvs = [p for p in root.glob(spec.results_pattern)
            if p.is_file() and p.suffix.lower() == ".csv" and not _hidden(p.relative_to(root)) and not _is_cond(p)
            and not any(fnmatch.fnmatch(p.relative_to(root).as_posix(), ex) for ex in spec.results_exclude)]
    if spec.pattern_given:
        return sorted(csvs)
    # 自動判定: フォルダごとに結果 CSV を決める
    by_dir: dict[Path, list[Path]] = {}
    for p in csvs:
        by_dir.setdefault(p.parent, []).append(p)
    out = []
    for d, items in by_dir.items():
        if len(items) == 1:
            out += items
            continue
        paired = [p for p in items if p.with_suffix(".stl").exists() or p.with_suffix(".STL").exists()]
        if paired:                       # 名前.csv と 名前.stl が並ぶ形（フォルダ分けなし）
            out += paired
            continue
        named = [p for p in items if _RESULT_HINT.search(p.stem)]
        out.append((named or sorted(items, key=lambda p: -p.stat().st_size))[0])
    return sorted(out)


def resolve(root: Path, spec: Spec | None = None) -> Resolution:
    root = Path(root).resolve()
    if not root.is_dir():
        raise ValueError(f"フォルダが見つかりません: {root}")
    spec = spec or load_spec(root)
    ov = load_overrides(root)
    rx = re.compile(spec.regex) if spec.regex else None
    csvs = _results(root, spec)
    per_dir: dict[Path, int] = {}
    for p in csvs:
        per_dir[p.parent] = per_dir.get(p.parent, 0) + 1

    samples: list[ResolvedSample] = []
    warnings: list[str] = []
    for csv in csvs:
        rel = csv.relative_to(root)
        v = {"stem": csv.stem, "parent": csv.parent.name if csv.parent != root else csv.stem,
             "dir": rel.parent.as_posix() if rel.parent.as_posix() != "." else "."}
        if rx:
            m = rx.search(rel.as_posix())
            if not m:
                warnings.append(f"{rel.as_posix()}: results.regex に一致しないため対象外")
                continue
            v.update({k: (val or "") for k, val in m.groupdict().items()})
        if spec.name == "auto":
            name = v["parent"] if per_dir[csv.parent] == 1 and csv.parent != root else csv.stem
        else:
            name = _fill(spec.name, v)
        v["name"] = name
        s = ResolvedSample(name, csv, vars=dict(v))
        # STL: 個別指定 → ルール → 既定
        if name in ov["stl"]:
            p = _inside(root, ov["stl"][name])
            if p.is_file():
                s.stl, s.stl_source = p, "override"
            else:
                warnings.append(f"{name}: 個別指定の STL がありません（{ov['stl'][name]}）")
        if s.stl is None:
            s.stl = _find(root, spec.stl_dirs, spec.stl_files, v)
            if s.stl is not None:
                default = spec.stl_dirs == ["{dir}"] and spec.stl_files == ["{stem}.stl", "*.stl"]
                s.stl_source = "default" if default else "rule"
        # 鋳造条件: 個別指定 → ルール（既定は同じフォルダの condition*.csv）
        if name in ov["conditions"] and _inside(root, ov["conditions"][name]).is_file():
            s.conditions, s.cond_source = _inside(root, ov["conditions"][name]), "override"
        else:
            s.conditions = _find(root, spec.cond_dirs, spec.cond_files, v)
            s.cond_source = "rule" if s.conditions else "missing"
        samples.append(s)

    # 同じ名前が重なったら、相対パスで区別する
    seen: dict[str, int] = {}
    for s in samples:
        seen[s.name] = seen.get(s.name, 0) + 1
    dup = {n for n, c in seen.items() if c > 1}
    if dup:
        warnings.append(f"サンプル名が重なったため、フォルダ名を付けて区別しました: {', '.join(sorted(dup))}")
        for s in samples:
            if s.name in dup:
                s.name = s.vars["name"] = _rel(root, s.csv).removesuffix(".csv").replace("/", "_")
    missing = [s.name for s in samples if s.stl is None]
    if missing:
        warnings.append(f"STL が決まっていないサンプル: {len(missing)} 件（画面で選ぶか、dataset.yml にルールを書いてください）")
    return Resolution(root, samples, warnings, spec)


# ---------------------------------------------------------------------------
# 画面での個別指定の補助
# ---------------------------------------------------------------------------

def list_stls(root: Path, limit: int = MAX_STL_LIST) -> list[Path]:
    root = Path(root).resolve()
    out = []
    for p in root.rglob("*"):
        if p.is_file() and p.suffix.lower() == ".stl" and not _hidden(p.relative_to(root)):
            out.append(p)
            if len(out) >= limit:
                break
    return sorted(out)


_TOKEN = re.compile(r"[0-9A-Za-z]+|[一-龠ぁ-んァ-ヶー]+")


def _tokens(*texts: str) -> set[str]:
    return {t.lower() for s in texts for t in _TOKEN.findall(s)}


def suggest(sample: ResolvedSample, stls: list[Path], top: int = 5) -> list[tuple[Path, float]]:
    """名前が似ている STL を点数順に。点数 = 文字列の類似度 + 共通する単語 + フォルダの近さ。"""
    key = sample.name.lower()
    st = _tokens(sample.name, sample.csv.stem, sample.csv.parent.name)
    scored = []
    for p in stls:
        score = difflib.SequenceMatcher(None, key, p.stem.lower()).ratio()
        pt = _tokens(p.stem, p.parent.name)
        if st and pt:
            score += 0.6 * len(st & pt) / len(st | pt)
        if key and key in p.stem.lower():
            score += 0.4
        # 同じフォルダ・すぐ上のフォルダにあるほど高く
        if p.parent == sample.csv.parent:
            score += 0.3
        elif p.parent in sample.csv.parents:
            score += 0.15
        scored.append((p, round(score, 3)))
    scored.sort(key=lambda t: -t[1])
    return scored[:top]


# ---------------------------------------------------------------------------
# 画面用のまとめ
# ---------------------------------------------------------------------------

def preview(root: Path, spec_text: str | None = None, top: int = 5) -> dict:
    """サンプル一覧・STL の候補・全 STL を 1 回で返す。spec_text を渡すと、保存前のルールで試せる。"""
    root = Path(root).resolve()
    spec = parse_spec(spec_text) if spec_text is not None else load_spec(root)
    res = resolve(root, spec)
    stls = list_stls(root)
    samples = []
    for s in res.samples:
        d = s.to_dict(root)
        d["candidates"] = [{"path": _rel(root, p), "score": sc} for p, sc in suggest(s, stls, top)]
        samples.append(d)
    counts = {k: sum(1 for s in res.samples if s.stl_source == k) for k in ("override", "rule", "default", "missing")}
    return {"root": str(root), "samples": samples, "warnings": res.warnings, "counts": counts,
            "stl_files": [_rel(root, p) for p in stls], "stl_truncated": len(stls) >= MAX_STL_LIST,
            "spec_exists": (root / SPEC_FILE).exists(), "overrides_exists": (root / OVERRIDES_FILE).exists()}


def read_spec_text(root: Path) -> dict:
    p = Path(root) / SPEC_FILE
    return {"exists": p.exists(), "text": p.read_text("utf-8") if p.exists() else TEMPLATE, "template": TEMPLATE}


def save_spec_text(root: Path, text: str) -> Path:
    parse_spec(text)                 # 書き方の誤りがあれば保存しない
    p = Path(root) / SPEC_FILE
    p.write_text(text, "utf-8")
    return p


# ---------------------------------------------------------------------------
# dataset.yml のひな形
# ---------------------------------------------------------------------------

TEMPLATE = """\
# データセットの組み立てルール
#   この dataset.yml を置いたフォルダが「データセットのフォルダ」です。
#   書かない項目は既定の動き（CSV と同じフォルダの STL を使う）になります。
#   パスはこのフォルダからの相対パスで、/ 区切りで書きます（Windows でも / で書けます）。
#   画面で個別に選んだ STL は dataset_overrides.yml に保存され、このルールより優先されます。

results:
  # 結果 CSV の探し方（glob）。** は「下のすべての階層」。
  # 書かない場合は、フォルダごとに結果 CSV を 1 つ自動で選びます。
  pattern: "**/*.csv"
  # 対象外にする CSV（glob。複数可）。条件ファイル（condition*.csv など）は自動で除外されます。
  exclude: []
  # サンプル名のルール。auto = CSV のあるフォルダ名（同じフォルダに複数あればファイル名）
  # 使える変数: {parent} フォルダ名 / {stem} CSV のファイル名（拡張子なし）/ {dir} フォルダの相対パス
  #             / 下の regex の名前付きグループ（例 {id}）
  name: auto
  # CSV の相対パスから値を取り出す正規表現（任意）。例: "(?P<id>sample_\\\\d+)"
  regex: ""

stl:
  # STL を探すフォルダ（上から順に探します。変数が使えます）
  #   例: 結果と同じフォルダ → "{dir}" / 決まったフォルダ → "cad" / 上の階層 → "{dir}/../geometry"
  dirs:
    - "{dir}"
  # STL のファイル名のルール（上から順に探します。* などの glob 可）
  #   例: "{id}.stl" / "{parent}*.stl" / "*.stl"
  file:
    - "{stem}.stl"
    - "*.stl"

conditions:
  # 鋳造条件のファイル（任意）。探し方は stl と同じです。
  dirs:
    - "{dir}"
  file:
    - "condition*.csv"
"""
