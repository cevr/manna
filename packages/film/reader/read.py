"""Read joints, the nearest drawing and bone world angles from a dir of canvas PNGs, or from an mp4 (clip B) mapped
into the canvas. Per frame: `joints` (every joint of the union list), `drawing` (the classifier's nearest training
drawing, `<member>/<drawing>`; the lead-feast front for a heatmap-only checkpoint) and `p` (its probability; null for
a heatmap-only checkpoint), and `world` measured against that drawing's rest angles (only the bones that drawing has).

  python read.py --ckpt <reader>.pt --pngs <set>/held --out held.json
  python read.py --ckpt <reader>.pt --mp4 clip-b.mp4 --out clip-b.json

Clip B -> canvas (measured on the clip against the lead-feast front sheet): sheet px (sx, sy) covers video block [2sx+98, +2) x [2sy+68, +2); the canvas is the sheet + 140 px left,
so canvas px (cx, cy) = the mean of video block [2cx-182, 2cx-180) x [2cy+68, 2cy+70). Canvas px outside the
video (cx < 91 or cx > 442) take the frame's paper tone (median of the video's border).
"""
from __future__ import annotations

import argparse
import glob
import json
import os
import time

import cv2
import numpy as np
import torch

from model import CANVAS, decode, input_to_canvas, letterbox_matrix, load_ckpt, normalize, read_rgb, to_input, world_of

VIDEO_X0, VIDEO_Y0, VIDEO_SCALE = -182, 68, 2


def canvas_of_video(frame: np.ndarray) -> np.ndarray:
    """A clip B frame (RGB, 1440x704) -> the canvas (678x533 RGB): each canvas px the mean of its 2x2 video block."""
    w, h = CANVAS
    vh, vw = frame.shape[:2]
    border = np.concatenate([frame[:4].reshape(-1, 3), frame[-4:].reshape(-1, 3), frame[:, :4].reshape(-1, 3), frame[:, -4:].reshape(-1, 3)])
    big = np.empty((h * VIDEO_SCALE, w * VIDEO_SCALE, 3), np.float32)
    big[:] = np.median(border, 0)
    x0, y0 = VIDEO_X0, VIDEO_Y0  # video coords of big's (0, 0)
    sx0, sy0 = max(0, x0), max(0, y0)
    sx1, sy1 = min(vw, x0 + big.shape[1]), min(vh, y0 + big.shape[0])
    big[sy0 - y0:sy1 - y0, sx0 - x0:sx1 - x0] = frame[sy0:sy1, sx0:sx1]
    return np.round(big.reshape(h, VIDEO_SCALE, w, VIDEO_SCALE, 3).mean((1, 3))).astype(np.uint8)


def mp4_frames(path: str):
    cap = cv2.VideoCapture(path)
    i = 0
    while True:
        ok, bgr = cap.read()
        if not ok:
            break
        yield f"f{i:03d}", canvas_of_video(cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB))
        i += 1
    cap.release()


def png_frames(d: str, limit: int | None = None):
    ps = sorted(glob.glob(os.path.join(d, "*.png")))
    if limit and limit < len(ps):
        ps = [ps[int(i * len(ps) / limit)] for i in range(limit)]
    for p in ps:
        yield os.path.basename(p)[:-4], read_rgb(p)


@torch.no_grad()
def read(ckpt: str, frames, device: str = "cpu", batch: int = 16, bf16: bool = False, save_mapped: str | None = None, all_probs: bool = False) -> dict:
    model, ck = load_ckpt(ckpt, device)
    joints, rest, classes, m = ck["joints"], ck["rest"], ck["classes"], letterbox_matrix()
    out, names, xs, t0, n = [], [], [], time.time(), 0

    def flush():
        x = torch.stack(xs).to(device)
        with torch.autocast(device_type=device.split(":")[0], dtype=torch.bfloat16, enabled=bf16):
            heat, logits = model(x)
        pts_in, conf = decode(heat)
        pts = input_to_canvas(pts_in)
        prob = logits.float().softmax(-1).cpu() if logits is not None else None
        for k, name in enumerate(names):
            jd = {j: [round(float(pts[k, i, 0]), 2), round(float(pts[k, i, 1]), 2), round(float(conf[k, i]), 3)] for i, j in enumerate(joints)}
            if prob is not None:
                c = int(prob[k].argmax())
                drawing, p = classes[c], round(float(prob[k, c]), 4)
            else:
                drawing, p = next(iter(rest)), None
            fr = {"id": name, "joints": jd, "drawing": drawing, "p": p,
                  "world": {b: round(a, 2) for b, a in world_of(jd, rest[drawing]).items()}}
            if all_probs and prob is not None:
                # every class's probability, and the world angles against each drawing of the named member
                fr["probs"] = {cl: round(float(prob[k, i]), 5) for i, cl in enumerate(classes)}
                member = drawing.split("/")[0]
                fr["worlds"] = {d: {b: round(a, 2) for b, a in world_of(jd, r).items()} for d, r in rest.items() if d.split("/")[0] == member}
            out.append(fr)
        names.clear(); xs.clear()

    for name, img in frames:
        if save_mapped:
            os.makedirs(save_mapped, exist_ok=True)
            cv2.imwrite(os.path.join(save_mapped, name + ".png"), cv2.cvtColor(img, cv2.COLOR_RGB2BGR))
        names.append(name); xs.append(normalize(to_input(img, m))); n += 1
        if len(xs) == batch:
            flush()
    if xs:
        flush()
    sec = time.time() - t0
    return {"ckpt": ckpt, "step": ck["step"], "device": device, "classes": classes, "frames": out, "n": n, "sec_per_frame": sec / max(1, n),
            "units": "joints: canvas px [x, y, confidence]; drawing: nearest training drawing, p its probability; "
                     "world: deg against that drawing's rest, + clockwise on screen, wrapped to [-180, 180)"}


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--ckpt", required=True)
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument("--pngs")
    g.add_argument("--mp4")
    ap.add_argument("--out", required=True)
    ap.add_argument("--device", default="cuda" if torch.cuda.is_available() else "cpu")
    ap.add_argument("--batch", type=int, default=16)
    ap.add_argument("--bf16", action="store_true")
    ap.add_argument("--save-mapped", help="write each mapped clip frame (canvas px) here")
    ap.add_argument("--all-probs", action="store_true", help="add probs (every class) and worlds (each drawing of the member) per frame")
    ap.add_argument("--limit", type=int, help="read only this many PNGs, spread evenly over the sorted dir")
    a = ap.parse_args()
    frames = png_frames(a.pngs, a.limit) if a.pngs else mp4_frames(a.mp4)
    r = read(a.ckpt, frames, a.device, a.batch, a.bf16, a.save_mapped, a.all_probs)
    r["source"] = a.pngs or a.mp4
    os.makedirs(os.path.dirname(a.out) or ".", exist_ok=True)
    json.dump(r, open(a.out, "w"))
    print(f"read {r['n']} frames, {r['sec_per_frame']:.3f} s/frame -> {a.out}")
