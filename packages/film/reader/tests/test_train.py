"""A train reads the backbone and input frame it is given, and its checkpoint keeps both, so a read takes them."""
import json

import cv2
import numpy as np
import torch
import transformers
from transformers import AutoModel, Dinov2Config

from model import BONES, CANVAS, JOINTS, Frame, Reader, frame_of
from train import train


def tiny() -> Dinov2Config:
    return Dinov2Config(hidden_size=32, num_hidden_layers=1, num_attention_heads=2, intermediate_size=64, patch_size=14)


def test_train_keeps_the_backbone_and_frame_it_was_given(tmp_path, monkeypatch):
    # a named backbone, built untrained (no download), so the name reaches the model and the checkpoint
    named = []
    monkeypatch.setattr(transformers.AutoModel, "from_pretrained", lambda name: named.append(name) or AutoModel.from_config(tiny()))
    # each batch's input side (height, width), as the model is fed it
    fed = []
    forward = Reader.forward
    monkeypatch.setattr(Reader, "forward", lambda self, x: fed.append(tuple(x.shape[2:])) or forward(self, x))
    data = tmp_path / "train"
    data.mkdir()
    for i in range(2):
        cv2.imwrite(str(data / f"{i}.png"), np.full((CANVAS[1], CANVAS[0], 3), 230, np.uint8))
        joints = {j: [200.0 + 5 * k, 150.0 + 30 * k] for k, j in enumerate(JOINTS)}
        (data / f"{i}.json").write_text(json.dumps({"joints": joints, "world": {b: 0.0 for b in BONES}, "member": "m", "drawing": "d"}))
    out = tmp_path / "reader.pt"
    r = train(str(data), str(out), steps=1, batch=2, log_every=1, backbone="facebook/dinov2-base", input_side=(224, 280))
    assert r["steps"] == 1
    assert named == ["facebook/dinov2-base"]
    assert fed == [(280, 224)]
    ck = torch.load(out, map_location="cpu", weights_only=False)
    assert ck["backbone"] == "facebook/dinov2-base"
    assert frame_of(ck) == Frame(224, 280)
    assert ck["cfg"]["backbone"] == "facebook/dinov2-base" and ck["cfg"]["input"] == [224, 280]
