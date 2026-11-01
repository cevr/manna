"""The reader: DINOv2-small with a heatmap head, one heatmap per joint of the synthetic set's truth, and a classifier
head over the drawings seen in training (`<member>/<drawing>`).

Frames. The canvas is the synthetic set's (533x678 px, the lead-feast front sheet padded 140 px left and
right, scale 1 = clip B's input scale; `src/core/pose-sample.ts`). The model's input is the canvas scaled by
S = 560/678 into 440x560 px, placed top-left on a 448x560 paper (32x40 patches of 14 px). The head
upsamples the 32x40 patch grid 4x into a 128x160 heatmap: one heat cell = 3.5 input px = 4.24 canvas px.

Joints: the union list JOINTS, the same names for every member (every member's puppet names its bones alike).
A joint a drawing lacks is absent from its truth (`masked`) and weighs 0 in the loss, as an off-canvas joint does.

Loss: heatmap MSE against a Gaussian (sigma 2 cells, peak 1) per joint, each cell weighted 1 + 9 x its target. Decoding: the argmax cell,
refined by a soft-argmax over the 5x5 cells around it; confidence = the peak's value. Classifier: a small MLP on the
CLS token beside the mean patch token, cross-entropy over the training drawings, added to the heat loss.
"""
from __future__ import annotations

import glob
import json
import math
import os

import cv2
import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F

BACKBONE = "facebook/dinov2-small"
CANVAS = (533, 678)  # w, h
IN_W, IN_H = 448, 560
S = IN_H / CANVAS[1]  # canvas -> input scale, 0.82596
STRIDE = 3.5  # input px per heat cell
HEAT_W, HEAT_H = int(IN_W / STRIDE), int(IN_H / STRIDE)  # 128, 160
SIGMA = 2.0
MEAN = np.array([0.485, 0.456, 0.406], np.float32)
STD = np.array([0.229, 0.224, 0.225], np.float32)

JOINTS = ["hip", "neckBase", "chin", "crown", "shoulderR", "elbowR", "wristR", "handR", "shoulderL", "elbowL", "wristL", "handL"]
# Each bone's vector, pivot joint -> next joint; its world angle = the vector's screen angle (deg, y down, + clockwise)
# minus its rest angle. Rest angles are measured from truth (rest_angles), constant to 0.001 deg over the held set.
BONES = {
    "lean": ("hip", "neckBase"), "neck": ("neckBase", "chin"), "head": ("chin", "crown"),
    "shoulderRight": ("shoulderR", "elbowR"), "elbowRight": ("elbowR", "wristR"), "wristRight": ("wristR", "handR"),
    "shoulderLeft": ("shoulderL", "elbowL"), "elbowLeft": ("elbowL", "wristL"), "wristLeft": ("wristL", "handL"),
}


def wrap(a: float) -> float:
    return (a + 180.0) % 360.0 - 180.0


def screen_angle(p, q) -> float:
    return math.degrees(math.atan2(q[1] - p[1], q[0] - p[0]))


def key_of(t: dict) -> str:
    """A truth's drawing key, `<member>/<drawing>`; a truth with neither field is the lead-feast front's."""
    return f"{t.get('member', 'lead-feast')}/{t.get('drawing', 'turnaround-front')}"


def rest_angles(truths: list[dict], n: int = 50) -> dict[str, dict[str, float]]:
    """Per drawing, each bone's rest screen angle: the screen angle of its vector minus its truth world angle
    (circular mean over up to n samples). A bone with a masked joint or no world angle has no rest in that drawing."""
    acc: dict[str, dict[str, list]] = {}
    seen: dict[str, int] = {}
    for t in truths:
        k = key_of(t)
        if seen.get(k, 0) >= n:
            continue
        seen[k] = seen.get(k, 0) + 1
        for b, (p, q) in BONES.items():
            if b not in t["world"] or p not in t["joints"] or q not in t["joints"]:
                continue
            a = math.radians(screen_angle(t["joints"][p], t["joints"][q]) - t["world"][b])
            c = acc.setdefault(k, {}).setdefault(b, [0.0, 0.0])
            c[0] += math.cos(a)
            c[1] += math.sin(a)
    return {k: {b: math.degrees(math.atan2(s, c)) for b, (c, s) in bs.items()} for k, bs in acc.items()}


def world_of(joints: dict, rest: dict[str, float]) -> dict[str, float]:
    """Each bone's world angle from joint positions (the truth's `world` definition), wrapped to [-180, 180), for the
    bones `rest` (one drawing's rest angles) names."""
    return {b: wrap(screen_angle(joints[p], joints[q]) - rest[b]) for b, (p, q) in BONES.items() if b in rest}


# ---------- images ----------

def letterbox_matrix(scale: float = 1.0, shift=(0.0, 0.0)) -> np.ndarray:
    """2x3 affine canvas px -> input px: scale about the canvas centre by `scale`, shift (canvas px), then S."""
    cx, cy = CANVAS[0] / 2, CANVAS[1] / 2
    a = S * scale
    return np.array([[a, 0, S * (cx - scale * cx + shift[0])], [0, a, S * (cy - scale * cy + shift[1])]], np.float32)


def paper_of(img: np.ndarray) -> tuple:
    """The paper tone: median of the canvas border (RGB uint8)."""
    border = np.concatenate([img[:4].reshape(-1, 3), img[-4:].reshape(-1, 3), img[:, :4].reshape(-1, 3), img[:, -4:].reshape(-1, 3)])
    return tuple(int(v) for v in np.median(border, 0))


def to_input(img: np.ndarray, m: np.ndarray) -> np.ndarray:
    """Canvas RGB uint8 -> input RGB uint8 (IN_H, IN_W) through m, padded with the paper tone."""
    return cv2.warpAffine(img, m, (IN_W, IN_H), flags=cv2.INTER_AREA if m[0, 0] < 1 else cv2.INTER_LINEAR,
                          borderMode=cv2.BORDER_CONSTANT, borderValue=paper_of(img))


def normalize(x: np.ndarray) -> torch.Tensor:
    """(H, W, 3) uint8 -> (3, H, W) float, ImageNet-normalized."""
    return torch.from_numpy(((x.astype(np.float32) / 255.0 - MEAN) / STD).transpose(2, 0, 1).copy())


def read_rgb(path: str) -> np.ndarray:
    return cv2.cvtColor(cv2.imread(path, cv2.IMREAD_COLOR), cv2.COLOR_BGR2RGB)


def augment_color(x: np.ndarray, rng: np.random.Generator) -> np.ndarray:
    """Light, figure-keeping noise: paper/ink tone (per-channel gain and bias), blur, grain, video compression."""
    f = x.astype(np.float32)
    f = f * rng.uniform(0.88, 1.12, 3) + rng.uniform(-14, 14, 3)
    f = (f - 128) * rng.uniform(0.85, 1.15) + 128
    if rng.random() < 0.6:
        f = cv2.GaussianBlur(f, (0, 0), rng.uniform(0.3, 1.4))
    f += rng.normal(0, rng.uniform(0, 4), f.shape)
    x = np.clip(f, 0, 255).astype(np.uint8)
    if rng.random() < 0.3:
        ok, buf = cv2.imencode(".jpg", x, [cv2.IMWRITE_JPEG_QUALITY, int(rng.integers(45, 95))])
        x = cv2.imdecode(buf, cv2.IMREAD_UNCHANGED)
    return x


def heat_targets(pts_in: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Input px joints (J, 2) -> Gaussian heatmaps (J, HEAT_H, HEAT_W) and visibility weights (J,)."""
    hx = (pts_in[:, 0] + 0.5) / STRIDE - 0.5
    hy = (pts_in[:, 1] + 0.5) / STRIDE - 0.5
    xs = np.arange(HEAT_W, dtype=np.float32)[None, None, :]
    ys = np.arange(HEAT_H, dtype=np.float32)[None, :, None]
    h = np.exp(-((xs - hx[:, None, None]) ** 2 + (ys - hy[:, None, None]) ** 2) / (2 * SIGMA**2)).astype(np.float32)
    vis = ((hx >= 0) & (hx <= HEAT_W - 1) & (hy >= 0) & (hy <= HEAT_H - 1)).astype(np.float32)
    return h, vis


class SynthSet(torch.utils.data.Dataset):
    """The synthetic set: <id>.png + <id>.json. `augment` draws scale 0.92-1.08, shift +-24 canvas px and colour noise.
    `limit` takes that many files spread evenly over the sorted list (so a subset holds every drawing). Items:
    (input, heatmaps, joint weights = in frame x present, drawing index in `classes`)."""

    def __init__(self, data_dir: str, limit: int | None = None, augment: bool = True, cache: bool = False,
                 classes: list[str] | None = None):
        files = sorted(glob.glob(os.path.join(data_dir, "*.json")))
        if limit and limit < len(files):
            files = [files[int(i * len(files) / limit)] for i in range(limit)]
        self.files = files
        self.augment = augment
        self.cache = [read_rgb(f[:-5] + ".png") for f in self.files] if cache else None
        self.truth = [json.load(open(f)) for f in self.files]
        self.classes = classes if classes is not None else sorted({key_of(t) for t in self.truth})
        idx = {k: i for i, k in enumerate(self.classes)}
        self.labels = [idx.get(key_of(t), -100) for t in self.truth]  # -100: a drawing outside `classes`, ignored by CE

    def __len__(self):
        return len(self.files)

    def __getitem__(self, i):
        rng = np.random.default_rng()
        img = self.cache[i] if self.cache is not None else read_rgb(self.files[i][:-5] + ".png")
        if self.augment:
            m = letterbox_matrix(rng.uniform(0.92, 1.08), rng.uniform(-24, 24, 2))
        else:
            m = letterbox_matrix()
        x = to_input(img, m)
        if self.augment:
            x = augment_color(x, rng)
        tj = self.truth[i]["joints"]
        present = np.array([j in tj for j in JOINTS], np.float32)
        pts = np.array([tj.get(j, (-1e4, -1e4)) for j in JOINTS], np.float32)  # a masked joint: far off the map, zero heat
        pts_in = pts @ m[:, :2].T + m[:, 2]
        h, vis = heat_targets(pts_in)
        return normalize(x), torch.from_numpy(h), torch.from_numpy(vis * present), self.labels[i]


# ---------- model ----------

class Reader(nn.Module):
    """`backbone`: a pretrained model's name, or a config (an untrained backbone of that shape, for tests)."""

    def __init__(self, n_joints: int = len(JOINTS), n_classes: int = 0, backbone=BACKBONE):
        super().__init__()
        from transformers import AutoModel

        self.backbone = AutoModel.from_pretrained(backbone) if isinstance(backbone, str) else AutoModel.from_config(backbone)
        d = self.backbone.config.hidden_size  # 384
        self.head = nn.Sequential(
            nn.Conv2d(d, 256, 3, padding=1), nn.GroupNorm(32, 256), nn.GELU(),
            nn.ConvTranspose2d(256, 128, 4, 2, 1), nn.GroupNorm(16, 128), nn.GELU(),
            nn.ConvTranspose2d(128, 64, 4, 2, 1), nn.GroupNorm(8, 64), nn.GELU(),
            nn.Conv2d(64, n_joints, 1),
        )
        nn.init.normal_(self.head[-1].weight, std=1e-3)  # start near the all-zero map, not at random heat
        nn.init.zeros_(self.head[-1].bias)
        # n_classes 0: a heatmap-only checkpoint, no classifier
        self.cls = nn.Sequential(nn.LayerNorm(2 * d), nn.Linear(2 * d, 256), nn.GELU(), nn.Linear(256, n_classes)) if n_classes else None

    def forward(self, x: torch.Tensor) -> tuple[torch.Tensor, torch.Tensor | None]:
        """(heatmaps (B, J, HEAT_H, HEAT_W), drawing logits (B, n_classes) or None)."""
        b, _, h, w = x.shape
        hid = self.backbone(pixel_values=x).last_hidden_state
        tok = hid[:, 1:]
        grid = tok.transpose(1, 2).reshape(b, -1, h // 14, w // 14)
        logits = self.cls(torch.cat([hid[:, 0], tok.mean(1)], -1)) if self.cls is not None else None
        return self.head(grid), logits


def heat_loss(pred: torch.Tensor, tgt: torch.Tensor, vis: torch.Tensor) -> torch.Tensor:
    """Heatmap MSE, each cell weighted 1 + 9 x its target (so an all-zero map is not a cheap minimum), invisible
    joints weighted 0; x1000 so logged values are readable. heat_loss(zeros) is the baseline a reader must beat."""
    return ((((pred.float() - tgt) ** 2) * (1 + 9 * tgt)).mean((2, 3)) * vis).sum() / vis.sum().clamp(min=1) * 1000


def decode(heat: torch.Tensor) -> tuple[np.ndarray, np.ndarray]:
    """(B, J, h, w) -> input px (B, J, 2) and confidence (B, J): argmax, then soft-argmax over its 5x5 window."""
    heat = heat.float()
    b, j, h, w = heat.shape
    flat = heat.reshape(b, j, -1)
    conf, idx = flat.max(-1)
    py, px = (idx // w).float(), (idx % w).float()
    pad = F.pad(heat, (2, 2, 2, 2), value=0.0)
    off = torch.arange(-2, 3, dtype=torch.float32, device=heat.device)
    out = torch.zeros(b, j, 2)
    for bi in range(b):
        for ji in range(j):
            y0, x0 = int(py[bi, ji]), int(px[bi, ji])
            win = pad[bi, ji, y0:y0 + 5, x0:x0 + 5].clamp(min=0)
            s = win.sum().clamp(min=1e-6)
            out[bi, ji, 0] = x0 + (win.sum(0) * off).sum() / s
            out[bi, ji, 1] = y0 + (win.sum(1) * off).sum() / s
    pts_in = (out + 0.5) * STRIDE - 0.5
    return pts_in.numpy(), conf.cpu().numpy()


def input_to_canvas(pts_in: np.ndarray) -> np.ndarray:
    m = letterbox_matrix()
    return (pts_in - m[:, 2]) / m[0, 0]


def save_ckpt(path: str, model: Reader, rest: dict, classes: list[str], step: int, cfg: dict):
    """`rest`: {drawing key: {bone: rest angle}}; `classes`: the classifier's drawing keys, in logit order."""
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    torch.save({"state": model.state_dict(), "joints": JOINTS, "rest": rest, "classes": classes, "step": step, "cfg": cfg,
                "input": [IN_W, IN_H], "canvas": list(CANVAS)}, path)


def load_ckpt(path: str, device: str = "cpu") -> tuple[Reader, dict]:
    """Loads a checkpoint with classes, or a heatmap-only one (no classes, one flat rest table: the lead-feast front's)."""
    ck = torch.load(path, map_location="cpu", weights_only=False)
    if "classes" not in ck:
        ck["classes"], ck["rest"] = [], {"lead-feast/turnaround-front": ck["rest"]}
    model = Reader(len(ck["joints"]), len(ck["classes"]))
    model.load_state_dict(ck["state"])
    return model.to(device).eval(), ck
