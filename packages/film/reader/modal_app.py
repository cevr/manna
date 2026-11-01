"""The reader's train on Modal: one L4 (bf16), a fixed step count, no wall-clock stop.

Volumes, keyed by hash: `film-reader-data` holds each training set as `/sets/<trainset>.tar` (the set's shards merged,
`train/` and `held/`), uploaded only when the volume lacks it; `film-reader-ckpt` holds each reader as
`/readers/<key>.pt` and its train log beside it. The local entrypoint downloads the checkpoint to `--out` and prints
the train's result as JSON on its last line. A run that stops before its step count fails.

  modal run modal_app.py::train --trainset <hash> --key <key> --shards a.tar,b.tar --out <reader>.pt \
    --steps 4800 --batch 32 --lr 0.001 --seed 0 --gpu L4 --precision bf16
"""
from __future__ import annotations

import json
import os

import modal

HERE = os.path.dirname(os.path.abspath(__file__))
GPU = "L4"
# The packages the container imports, pinned as pyproject.toml pins them (tests/test_pins.py holds the two equal).
PACKAGES = ["torch==2.15.0", "transformers==5.22.0", "numpy==2.5.4", "pillow==13.0.0", "opencv-python-headless==5.0.0.93"]

image = (
    modal.Image.debian_slim(python_version="3.12")
    .apt_install("libglib2.0-0")
    .uv_pip_install(*PACKAGES)
    .run_commands("python -c \"from transformers import AutoModel; AutoModel.from_pretrained('facebook/dinov2-small')\"")
    .add_local_dir(HERE, "/root/reader", ignore=[".venv", "tests", "__pycache__", ".pytest_cache"])
)
app = modal.App("film-reader", image=image)
data_vol = modal.Volume.from_name("film-reader-data", create_if_missing=True)
ckpt_vol = modal.Volume.from_name("film-reader-ckpt", create_if_missing=True)
VOLS = {"/data": data_vol, "/ckpt": ckpt_vol}


def _stage(trainset: str) -> str:
    """Unpack the training set from its one tar on the volume to local disk: the volume reads many small files slowly."""
    import tarfile

    root = f"/tmp/set-{trainset}"
    if not os.path.isdir(root):
        with tarfile.open(f"/data/sets/{trainset}.tar") as t:
            t.extractall(root, filter="data")
    return root


@app.function(gpu=GPU, timeout=2 * 60 * 60, cpu=8, memory=32768, volumes=VOLS)
def fit(trainset: str, key: str, steps: int, batch: int, lr: float, seed: int, bf16: bool) -> dict:
    import sys

    sys.path.insert(0, "/root/reader")
    from train import train as run

    out = f"/ckpt/readers/{key}.pt"
    r = run(_stage(trainset) + "/train", out, steps=steps, batch=batch, lr=lr, device="cuda", workers=6, cache=True,
            bf16=bf16, log_every=50, save_every=1000, log_file=out[:-3] + ".train.log.jsonl", on_save=ckpt_vol.commit,
            seed=seed)
    ckpt_vol.commit()
    if r["steps"] != steps:
        raise RuntimeError(f"the train stopped at step {r['steps']} of {steps}")
    return r


def _set_tar(shards: list[str], dest: str) -> None:
    """The training set's one tar: every shard's members, in shard order."""
    import tarfile

    with tarfile.open(dest, "w") as out:
        for shard in shards:
            with tarfile.open(shard) as t:
                for m in t.getmembers():
                    out.addfile(m, t.extractfile(m) if m.isfile() else None)


def _has(vol: modal.Volume, path: str) -> bool:
    try:
        return any(e.path.lstrip("/") == path.lstrip("/") for e in vol.listdir(os.path.dirname(path)))
    except Exception:  # a missing folder: the volume lacks it
        return False


@app.local_entrypoint()
def train(trainset: str, key: str, shards: str, out: str, steps: int, batch: int, lr: float, seed: int, gpu: str,
          precision: str):
    import tempfile

    if gpu != GPU:
        raise ValueError(f"the reader trains on {GPU} only, not {gpu}")
    if precision not in ("bf16", "fp32"):
        raise ValueError(f"precision {precision}: bf16 or fp32")
    remote = f"/sets/{trainset}.tar"
    if not _has(data_vol, remote):
        with tempfile.TemporaryDirectory() as tmp:
            tar = os.path.join(tmp, "set.tar")
            _set_tar(shards.split(","), tar)
            with data_vol.batch_upload() as b:
                b.put_file(tar, remote)
    r = fit.remote(trainset, key, steps, batch, lr, seed, precision == "bf16")
    os.makedirs(os.path.dirname(out) or ".", exist_ok=True)
    with open(out, "wb") as f:
        for chunk in ckpt_vol.read_file(f"/readers/{key}.pt"):
            f.write(chunk)
    print(json.dumps(r))
