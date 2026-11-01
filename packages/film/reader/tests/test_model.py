"""The model's shapes and the heatmap decode, on an untrained backbone of DINOv2's shape (no download)."""
import numpy as np
import torch
from transformers import Dinov2Config

import pytest

from model import FRAME, IN_H, IN_W, JOINTS, STRIDE, Frame, Reader, decode, heat_targets, input_to_canvas, letterbox_matrix


def tiny() -> Dinov2Config:
    return Dinov2Config(hidden_size=32, num_hidden_layers=1, num_attention_heads=2, intermediate_size=64, patch_size=14)


def test_heads_shapes():
    torch.manual_seed(0)
    model = Reader(n_classes=5, backbone=tiny()).eval()
    with torch.no_grad():
        heat, logits = model(torch.zeros(2, 3, IN_H, IN_W))
    assert heat.shape == (2, len(JOINTS), FRAME.heat_h, FRAME.heat_w) == (2, 12, 160, 128)
    assert logits.shape == (2, 5)


def test_a_doubled_frame_reads_at_its_own_side():
    frame = Frame(896, 1120)
    model = Reader(n_classes=0, backbone=tiny()).eval()
    with torch.no_grad():
        heat, _ = model(torch.zeros(1, 3, frame.h, frame.w))
    assert heat.shape[2:] == (frame.heat_h, frame.heat_w) == (320, 256)
    m = letterbox_matrix(frame=frame)
    canvas = np.array([[0.0, 0.0], [266.5, 339.0], [532.0, 677.0]], np.float32)
    assert np.abs(canvas @ m[:, :2].T + m[:, 2] - canvas * 1120 / 678).max() < 1e-3
    assert np.abs(input_to_canvas(canvas @ m[:, :2].T + m[:, 2], frame) - canvas).max() < 1e-3
    assert heat_targets(np.array([[400.0, 500.0]], np.float32), frame)[0].shape == (1, 320, 256)


def test_a_frame_the_model_cannot_read_is_refused():
    with pytest.raises(ValueError, match="whole number of 14 px patches"):
        Frame(450, 560)
    with pytest.raises(ValueError, match="440.2 px wide"):
        Frame(420, 560)


def test_heatmap_only_reader_has_no_logits():
    model = Reader(n_classes=0, backbone=tiny()).eval()
    with torch.no_grad():
        _, logits = model(torch.zeros(1, 3, IN_H, IN_W))
    assert logits is None


def test_decode_is_exact_at_a_cell_centre():
    # heat cell k's centre is input px (k + 0.5) x STRIDE - 0.5
    pts = np.array([[(20 + 0.5) * STRIDE - 0.5, (90 + 0.5) * STRIDE - 0.5]], np.float32)
    got, conf = decode(torch.from_numpy(heat_targets(pts)[0])[None])
    assert np.abs(got[0] - pts).max() < 1e-3
    assert conf[0, 0] > 0.999


def test_decode_lands_within_half_a_cell():
    # the 5x5 soft-argmax window truncates the Gaussian, so an off-centre point is pulled toward its peak cell
    pts = np.array([[100.3, 200.7], [10.0, 15.5], [400.25, 530.0]], np.float32)
    h, vis = heat_targets(pts)
    assert vis.tolist() == [1.0, 1.0, 1.0]
    got, conf = decode(torch.from_numpy(h)[None])
    assert np.abs(got[0] - pts).max() < STRIDE / 2
    assert np.all(conf[0] > 0.9)


def test_off_map_joint_has_no_heat_and_no_weight():
    h, vis = heat_targets(np.array([[-1e4, -1e4]], np.float32))
    assert vis.tolist() == [0.0]
    assert float(h.max()) == 0.0


def test_canvas_round_trip():
    m = letterbox_matrix()
    canvas = np.array([[0.0, 0.0], [266.5, 339.0], [532.0, 677.0]], np.float32)
    assert np.abs(input_to_canvas(canvas @ m[:, :2].T + m[:, 2]) - canvas).max() < 1e-3
