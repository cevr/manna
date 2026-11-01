"""Score a read of a synthetic dir against its truth, per member and per drawing (`<member>/<drawing>`): bone angle error
median and p90 (deg), joint px error median and p90, and drawing accuracy (the read's nearest drawing = the truth's).

Angle error per bone = the wrapped difference between the screen angles of the read's and the truth's joint vectors (pivot
joint -> next joint). Under the truth drawing's rest angles this is exactly its world-angle error, and it does not lean on
the classifier being right. A bone or joint counts only where the truth has it (not masked) and its joints lie on the canvas.
Drawings outside the checkpoint's classes (the held-out member) are scored apart under `unseen`, with a histogram of the
nearest drawings the reader chose for them instead of an accuracy.

  python eval.py --read held.json --truth <set>/held --out held-eval.json
"""
from __future__ import annotations

import argparse
import json
import math
import os
from collections import Counter

import numpy as np

from model import BONES, CANVAS, key_of, screen_angle, wrap


def _on(p) -> bool:
    return 0 <= p[0] < CANVAS[0] and 0 <= p[1] < CANVAS[1]


def stat(v) -> dict | None:
    if not len(v):
        return None
    v = np.array(v)
    return {"n": len(v), "median": round(float(np.median(v)), 2), "p90": round(float(np.percentile(v, 90)), 2), "mean": round(float(v.mean()), 2)}


def evaluate(read: dict, truth_dir: str) -> dict:
    classes = set(read.get("classes") or [])
    groups: dict[str, dict] = {}  # drawing key -> {ang, px, hit, nearest, bones}

    def group(k):
        return groups.setdefault(k, {"ang": [], "px": [], "hit": [], "nearest": Counter(), "bones": {}})

    for fr in read["frames"]:
        t = json.load(open(os.path.join(truth_dir, fr["id"] + ".json")))
        k = key_of(t)
        g = group(k)
        tj, rj = t["joints"], fr["joints"]
        for b, (p, q) in BONES.items():
            if p in tj and q in tj and _on(tj[p]) and _on(tj[q]):
                e = abs(wrap(screen_angle(rj[p], rj[q]) - screen_angle(tj[p], tj[q])))
                g["ang"].append(e)
                g["bones"].setdefault(b, []).append(e)
        for j, xy in tj.items():
            if _on(xy):
                g["px"].append(math.hypot(rj[j][0] - xy[0], rj[j][1] - xy[1]))
        g["nearest"][fr.get("drawing")] += 1
        if classes:
            g["hit"].append(float(fr.get("drawing") == k))

    def summary(keys: list[str], seen: bool) -> dict:
        ang = sum((groups[k]["ang"] for k in keys), [])
        bones: dict[str, list] = {}
        for k in keys:
            for b, v in groups[k]["bones"].items():
                bones.setdefault(b, []).extend(v)
        out = {"n": sum(sum(groups[k]["nearest"].values()) for k in keys), "angle_deg": stat(ang),
               "joint_px": stat(sum((groups[k]["px"] for k in keys), [])),
               "angle_deg_by_bone": {b: stat(v) for b, v in bones.items()}}
        if seen:
            hits = sum((groups[k]["hit"] for k in keys), [])
            out["accuracy"] = round(float(np.mean(hits)), 4) if hits else None
        else:
            out["nearest"] = dict(sum((groups[k]["nearest"] for k in keys), Counter()).most_common())
        return out

    seen_keys = sorted(k for k in groups if k in classes or not classes)
    unseen_keys = sorted(k for k in groups if classes and k not in classes)
    members = sorted({k.split("/")[0] for k in groups})
    return {
        "n": len(read["frames"]), "step": read.get("step"), "sec_per_frame": read.get("sec_per_frame"),
        "seen": summary(seen_keys, True) if seen_keys else None,
        "unseen": summary(unseen_keys, False) if unseen_keys else None,
        "by_member": {m: summary([k for k in groups if k.split("/")[0] == m], all(k in seen_keys for k in groups if k.split("/")[0] == m))
                      for m in members},
        "by_drawing": {k: summary([k], k in seen_keys) for k in sorted(groups)},
    }


def table(e: dict) -> str:
    def row(name, s):
        a, p = s["angle_deg"] or {}, s["joint_px"] or {}
        acc = f"{s['accuracy']:.3f}" if s.get("accuracy") is not None else "-"
        tail = "" if "nearest" not in s else "  nearest " + ", ".join(f"{k}:{v}" for k, v in list(s["nearest"].items())[:3])
        return f"{name:<44} {s['n']:>5} {a.get('median', '-'):>7} {a.get('p90', '-'):>7} {p.get('median', '-'):>7} {p.get('p90', '-'):>7} {acc:>6}{tail}"

    rows = [f"n={e['n']} step={e['step']} s/frame={e['sec_per_frame']:.3f}",
            f"{'group':<44} {'n':>5} {'ang med':>7} {'ang p90':>7} {'px med':>7} {'px p90':>7} {'acc':>6}"]
    for name in ("seen", "unseen"):
        if e[name]:
            rows.append(row(f"ALL {name}", e[name]))
    rows += [row(f"member {m}", s) for m, s in e["by_member"].items()]
    rows += [row(k, s) for k, s in e["by_drawing"].items()]
    return "\n".join(rows)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--read", required=True)
    ap.add_argument("--truth", required=True)
    ap.add_argument("--out")
    a = ap.parse_args()
    e = evaluate(json.load(open(a.read)), a.truth)
    if a.out:
        json.dump(e, open(a.out, "w"), indent=1)
    print(table(e))
