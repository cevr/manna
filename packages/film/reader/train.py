"""Train the reader on a synthetic data dir; log the heat loss, the zero-map heat loss and the drawing CE; save a checkpoint.
The loss trained is heat + ce_weight x CE; `loss` in the log is the heat loss alone, so it compares with `zero_map_loss`.
It runs the whole step count: there is no wall-clock stop.

  python train.py --data <set>/train --out <reader>.pt --steps 30 --batch 4 --limit 200 --device cpu
"""
from __future__ import annotations

import argparse
import json
import math
import time

import torch
import torch.nn.functional as F

from model import Reader, SynthSet, heat_loss, rest_angles, save_ckpt


def train(data: str, out: str, steps: int = 8000, batch: int = 32, lr: float = 1e-3, backbone_lr_scale: float = 0.1,
          device: str = "cpu", limit: int | None = None, workers: int = 0, cache: bool = False, bf16: bool = False,
          log_every: int = 10, save_every: int = 1000, log_file: str | None = None, on_save=None, ce_weight: float = 1.0,
          seed: int = 0) -> dict:
    """Returns {'steps', 'first_loss', 'last_loss', 'zero_map_loss', 'first_ce', 'last_ce', 'classes', 'sec_per_step'}."""
    torch.manual_seed(seed)
    ds = SynthSet(data, limit=limit, augment=True, cache=cache)
    dl = torch.utils.data.DataLoader(ds, batch_size=batch, shuffle=True, drop_last=True, num_workers=workers,
                                     persistent_workers=workers > 0, pin_memory=device.startswith("cuda"))
    model = Reader(n_classes=len(ds.classes)).to(device).train()
    opt = torch.optim.AdamW([
        {"params": model.backbone.parameters(), "lr": lr * backbone_lr_scale},
        {"params": [*model.head.parameters(), *model.cls.parameters()], "lr": lr},
    ], weight_decay=1e-4)
    warm = max(1, min(500, steps // 20))
    sched = torch.optim.lr_scheduler.LambdaLR(opt, lambda s: min(1.0, (s + 1) / warm) * 0.5 * (1 + math.cos(math.pi * min(s, steps) / steps)))
    rest = rest_angles(ds.truth)
    cfg = dict(data=data, steps=steps, batch=batch, lr=lr, backbone_lr_scale=backbone_lr_scale, limit=limit, bf16=bf16, n=len(ds),
               ce_weight=ce_weight, seed=seed)
    log = open(log_file, "a") if log_file else None
    step, t0, losses, zeros, ces, first = 0, time.time(), [], [], [], None
    while step < steps:
        for x, h, vis, y in dl:
            x, h, vis, y = (t.to(device, non_blocking=True) for t in (x, h, vis, y))
            with torch.autocast(device_type=device.split(":")[0], dtype=torch.bfloat16, enabled=bf16):
                pred, logits = model(x)
            loss = heat_loss(pred, h, vis)
            ce = F.cross_entropy(logits.float(), y, ignore_index=-100)
            opt.zero_grad(set_to_none=True)
            (loss + ce_weight * ce).backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            opt.step()
            sched.step()
            step += 1
            losses.append(loss.item())
            ces.append(ce.item())
            zeros.append(heat_loss(torch.zeros_like(h), h, vis).item())
            first = losses[0] if first is None else first
            if step % log_every == 0 or step == 1 or step == steps:
                rec = {"step": step, "loss": sum(losses[-log_every:]) / len(losses[-log_every:]), "zero_map_loss": sum(zeros[-log_every:]) / len(zeros[-log_every:]),
                       "ce": sum(ces[-log_every:]) / len(ces[-log_every:]), "lr": sched.get_last_lr()[1],
                       "sec": round(time.time() - t0, 1)}
                print(json.dumps(rec), flush=True)
                if log:
                    log.write(json.dumps(rec) + "\n"); log.flush()
            if step % save_every == 0 or step == steps:
                save_ckpt(out, model, rest, ds.classes, step, cfg)
                if on_save:
                    on_save()
            if step >= steps:
                break
    tail = losses[-min(log_every, len(losses)):]
    return {"steps": step, "first_loss": first, "last_loss": sum(tail) / len(tail), "zero_map_loss": sum(zeros[-len(tail):]) / len(tail),
            "first_ce": ces[0], "last_ce": sum(ces[-len(tail):]) / len(tail), "classes": len(ds.classes),
            "sec_per_step": (time.time() - t0) / max(1, step)}


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--steps", type=int, default=8000)
    ap.add_argument("--batch", type=int, default=32)
    ap.add_argument("--lr", type=float, default=1e-3)
    ap.add_argument("--backbone-lr-scale", type=float, default=0.1)
    ap.add_argument("--device", default="cuda" if torch.cuda.is_available() else "cpu")
    ap.add_argument("--limit", type=int)
    ap.add_argument("--workers", type=int, default=0)
    ap.add_argument("--cache", action="store_true")
    ap.add_argument("--bf16", action="store_true")
    ap.add_argument("--log-every", type=int, default=10)
    ap.add_argument("--save-every", type=int, default=1000)
    ap.add_argument("--log-file")
    ap.add_argument("--ce-weight", type=float, default=1.0)
    ap.add_argument("--seed", type=int, default=0)
    a = ap.parse_args()
    r = train(a.data, a.out, a.steps, a.batch, a.lr, a.backbone_lr_scale, a.device, a.limit, a.workers, a.cache, a.bf16,
              a.log_every, a.save_every, a.log_file, ce_weight=a.ce_weight, seed=a.seed)
    print("result", json.dumps(r))
